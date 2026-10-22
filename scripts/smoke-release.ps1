param(
  [switch]$VerifyInputSave,
  [switch]$VerifyExternalConflict,
  [switch]$VerifySaveFailure,
  [switch]$VerifyCapsuleSave,
  [switch]$VerifyPopoutSave,
  [switch]$VerifyPrivateSave,
  [switch]$VerifyExitSaveFailure,
  [ValidateRange(0, 60000)]
  [int]$SaveDelayMs = 0
)

$ErrorActionPreference = "Stop"
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$root = Split-Path $PSScriptRoot -Parent
$exe = Join-Path $root "src-tauri\target\release\md-sticky-note.exe"
if (!(Test-Path -LiteralPath $exe)) {
  throw "Release exe not found: $exe. Run npm run build:green first."
}

function Get-ExistingMknoteProcess {
  @(Get-Process -Name 'md-sticky-note','MarkdownStickyNote' -ErrorAction SilentlyContinue |
      Where-Object { $_.Id -ne $PID })
}

$existingMknoteProcesses = @(Get-ExistingMknoteProcess)
if ($existingMknoteProcesses.Count -gt 0) {
  $processDetails = @($existingMknoteProcesses | ForEach-Object {
      "$($_.ProcessName) pid=$($_.Id) title=$($_.MainWindowTitle)"
    }) -join "; "
  throw "Existing MKnote process detected; close it before Release smoke: $processDetails"
}

$artifactDir = Join-Path $root ".codex-smoke"
New-Item -ItemType Directory -Force -Path $artifactDir | Out-Null

$sandbox = Join-Path ([System.IO.Path]::GetTempPath()) ("mknote-smoke-" + [Guid]::NewGuid().ToString("N"))
$appRoot = Join-Path $sandbox "App"
$runExe = Join-Path $appRoot "md-sticky-note.exe"
$appData = Join-Path $sandbox "AppData\Roaming"
$localAppData = Join-Path $sandbox "AppData\Local"
$tempDir = Join-Path $sandbox "Temp"
New-Item -ItemType Directory -Force -Path $appRoot, $appData, $localAppData, $tempDir | Out-Null
Copy-Item -LiteralPath $exe -Destination $runExe -Force

$defaultNoteDir = Join-Path $appRoot "File\default"
$defaultNotePath = Join-Path $defaultNoteDir "default-note.md"
New-Item -ItemType Directory -Force -Path $defaultNoteDir | Out-Null
Set-Content -LiteralPath $defaultNotePath -Value "smoke seed" -Encoding UTF8

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class MkSmokeWin32 {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

  [DllImport("user32.dll")]
  public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

  [DllImport("user32.dll")]
  public static extern bool IsWindowVisible(IntPtr hWnd);

  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);

  [DllImport("user32.dll")]
  public static extern int GetWindowTextLength(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);

  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool PostMessage(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);

  [DllImport("user32.dll")]
  public static extern bool SetCursorPos(int x, int y);

  [DllImport("user32.dll")]
  public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);

  [DllImport("user32.dll")]
  public static extern void keybd_event(byte virtualKey, byte scanCode, uint flags, UIntPtr extraInfo);

  [DllImport("user32.dll")]
  public static extern bool SetProcessDPIAware();

  [DllImport("user32.dll")]
  private static extern bool GetGUIThreadInfo(uint threadId, ref GUITHREADINFO threadInfo);

  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  private static extern IntPtr SendMessage(IntPtr windowHandle, uint message, IntPtr wParam, IntPtr lParam);

  [StructLayout(LayoutKind.Sequential)]
  private struct GUITHREADINFO {
    public uint size;
    public uint flags;
    public IntPtr active;
    public IntPtr focus;
    public IntPtr capture;
    public IntPtr menuOwner;
    public IntPtr moveSize;
    public IntPtr caret;
    public RECT caretRect;
  }

  public const uint WM_CLOSE = 0x0010;
  public const uint WM_PASTE = 0x0302;
  public const uint WM_CHAR = 0x0102;
  public const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
  public const uint MOUSEEVENTF_LEFTUP = 0x0004;

  public static bool SendFocusedText(IntPtr topLevelWindow, string text) {
    uint processId = 0;
    uint threadId = GetWindowThreadProcessId(topLevelWindow, out processId);
    var info = new GUITHREADINFO { size = (uint)Marshal.SizeOf(typeof(GUITHREADINFO)) };
    if (threadId == 0 || !GetGUIThreadInfo(threadId, ref info) || info.focus == IntPtr.Zero) {
      return false;
    }
    foreach (char character in text) {
      SendMessage(info.focus, WM_CHAR, (IntPtr)character, IntPtr.Zero);
    }
    return true;
  }

  public static bool SendFocusedPaste(IntPtr topLevelWindow) {
    uint processId = 0;
    uint threadId = GetWindowThreadProcessId(topLevelWindow, out processId);
    var info = new GUITHREADINFO { size = (uint)Marshal.SizeOf(typeof(GUITHREADINFO)) };
    if (threadId == 0 || !GetGUIThreadInfo(threadId, ref info) || info.focus == IntPtr.Zero) {
      return false;
    }
    SendMessage(info.focus, WM_PASTE, IntPtr.Zero, IntPtr.Zero);
    return true;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct RECT {
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;
  }
}
"@

[void][MkSmokeWin32]::SetProcessDPIAware()

function Get-AppWindows([int]$ProcessId) {
  $windows = New-Object System.Collections.Generic.List[object]
  $callback = [MkSmokeWin32+EnumWindowsProc]{
    param([IntPtr]$hwnd, [IntPtr]$lparam)
      [uint32]$windowProcessId = 0
      [void][MkSmokeWin32]::GetWindowThreadProcessId($hwnd, [ref]$windowProcessId)
      if ($windowProcessId -eq [uint32]$ProcessId) {
      $len = [MkSmokeWin32]::GetWindowTextLength($hwnd)
      $sb = New-Object System.Text.StringBuilder ($len + 1)
      [void][MkSmokeWin32]::GetWindowText($hwnd, $sb, $sb.Capacity)
      $rect = New-Object MkSmokeWin32+RECT
      [void][MkSmokeWin32]::GetWindowRect($hwnd, [ref]$rect)
      $windows.Add([pscustomobject]@{
        Hwnd = $hwnd
        Title = $sb.ToString()
        Visible = [MkSmokeWin32]::IsWindowVisible($hwnd)
        Left = $rect.Left
        Top = $rect.Top
        Right = $rect.Right
        Bottom = $rect.Bottom
        Width = $rect.Right - $rect.Left
        Height = $rect.Bottom - $rect.Top
      })
    }
    return $true
  }
  [void][MkSmokeWin32]::EnumWindows($callback, [IntPtr]::Zero)
  return $windows
}

function Find-MainWindow([int]$ProcessId) {
  Get-AppWindows $ProcessId |
    Where-Object { $_.Title -eq "MKNOTE" -and $_.Visible -and $_.Width -gt 100 -and $_.Height -gt 100 } |
    Select-Object -First 1
}

function Find-AnyMainWindow([int]$ProcessId) {
  Get-AppWindows $ProcessId |
    Where-Object { $_.Title -eq "MKNOTE" -and $_.Width -gt 100 -and $_.Height -gt 100 } |
    Select-Object -First 1
}

function Click-WindowPoint($Window, [double]$XRatio, [double]$YRatio) {
  $x = [int]($Window.Left + ($Window.Width * $XRatio))
  $y = [int]($Window.Top + ($Window.Height * $YRatio))
  [void][MkSmokeWin32]::SetCursorPos($x, $y)
  Start-Sleep -Milliseconds 80
  [MkSmokeWin32]::mouse_event([MkSmokeWin32]::MOUSEEVENTF_LEFTDOWN, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 60
  [MkSmokeWin32]::mouse_event([MkSmokeWin32]::MOUSEEVENTF_LEFTUP, 0, 0, 0, [UIntPtr]::Zero)
}

function Get-WindowUiText([IntPtr]$WindowHandle) {
  Add-Type -AssemblyName UIAutomationClient
  Add-Type -AssemblyName UIAutomationTypes

  try {
    $root = [System.Windows.Automation.AutomationElement]::FromHandle($WindowHandle)
    $elements = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
    $names = @()
    foreach ($element in $elements) {
      try {
        $name = $element.Current.Name
        if ($name) {
          $names += $name
        }
        $valuePattern = $null
        if ($element.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$valuePattern)) {
          $value = $valuePattern.Current.Value
          if ($value) {
            $names += $value
          }
        }
        $textPattern = $null
        if ($element.TryGetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern, [ref]$textPattern)) {
          $text = $textPattern.DocumentRange.GetText(-1)
          if ($text) {
            $names += $text
          }
        }
      } catch {
        # WebView2 的单个无效 UIA 节点不应阻断整次 smoke。
      }
    }
    return ($names -join " | ")
  } catch {
    return "UIA_ERROR: $($_.Exception.Message)"
  }
}

function Test-InputAutoSave($Window, [string]$AppRoot) {
  Add-Type -AssemblyName System.Windows.Forms
  $marker = "mknote smoke autosave " + [Guid]::NewGuid().ToString("N")
  $notePaths = @(
    (Join-Path $AppRoot "default-note.md"),
    (Join-Path $AppRoot "File\default\default-note.md")
  )
  $oldClipboard = $null
  $hadClipboard = $false
  $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

  try {
    $oldClipboard = Get-Clipboard -Raw -ErrorAction Stop
    $hadClipboard = $true
  } catch {
    $hadClipboard = $false
  }

  try {
    [void][MkSmokeWin32]::SetForegroundWindow($Window.Hwnd)
    Start-Sleep -Milliseconds 300

    # Visual Editor 的可编辑内容只占编辑区顶部的实际段落高度；点击中下部空白
    # 不会把焦点交给 ProseMirror，导致后续 WM_CHAR 只落到顶层窗口而没有输入。
    # 从首个可见段落取点，兼容默认种子内容和普通 Markdown 首段。
    $points = @(
      @(0.15, 0.28),
      @(0.52, 0.28),
      @(0.45, 0.32)
    )

    Set-Clipboard -Value $marker
    foreach ($point in $points) {
      Click-WindowPoint $Window $point[0] $point[1]
      Start-Sleep -Milliseconds 250
      [System.Windows.Forms.SendKeys]::SendWait("^a")
      Start-Sleep -Milliseconds 100
      try {
        if (-not [MkSmokeWin32]::SendFocusedText($Window.Hwnd, $marker)) {
          throw "无法取得当前焦点窗口"
        }
      } catch {
        Write-Host "Direct focused input unavailable: $($_.Exception.Message)"
        # 备用路径：使用原生 WM_PASTE 投递到当前窗口。
        [void][MkSmokeWin32]::PostMessage($Window.Hwnd, [MkSmokeWin32]::WM_PASTE, [IntPtr]::Zero, [IntPtr]::Zero)
      }
      Start-Sleep -Milliseconds 100
      # 编辑器的 onBlur 会主动 flushSave，点击标题栏验证失焦保存路径。
      Click-WindowPoint $Window 0.50 0.08
      Start-Sleep -Milliseconds 300

      for ($i = 0; $i -lt 20; $i++) {
        Start-Sleep -Milliseconds 300
        foreach ($notePath in $notePaths) {
        if ((Test-Path -LiteralPath $notePath) -and ((Get-Content -LiteralPath $notePath -Raw) -like "*$marker*")) {
          $stopwatch.Stop()
          return [pscustomobject]@{
            marker = $marker
            notePath = $notePath
            elapsedMs = [int]$stopwatch.ElapsedMilliseconds
          }
          }
        }
      }
    }

    Add-Type -AssemblyName System.Drawing
    $failedWidth = [Math]::Max(1, [int]$Window.Width)
    $failedHeight = [Math]::Max(1, [int]$Window.Height)
    $failedBitmap = New-Object System.Drawing.Bitmap $failedWidth, $failedHeight
    $failedGraphics = [System.Drawing.Graphics]::FromImage($failedBitmap)
    $failedGraphics.CopyFromScreen([int]$Window.Left, [int]$Window.Top, 0, 0, $failedBitmap.Size)
    $failedShotPath = Join-Path (Split-Path $PSScriptRoot -Parent) ".codex-smoke\release-smoke-input-failed.png"
    $failedBitmap.Save($failedShotPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $failedGraphics.Dispose()
    $failedBitmap.Dispose()
    Write-Host "inputFailureScreenshot=$failedShotPath"
    throw "Input autosave smoke failed: marker was not saved to any expected default note path: $($notePaths -join ', ')"
  } finally {
    if ($hadClipboard) {
      Set-Clipboard -Value $oldClipboard
    }
  }
}

function Test-SaveFailure($Window, [string]$AppRoot) {
  Add-Type -AssemblyName System.Windows.Forms
  $marker = "mknote smoke failure " + [Guid]::NewGuid().ToString("N")
  $notePaths = @(
    (Join-Path $AppRoot "default-note.md"),
    (Join-Path $AppRoot "File\default\default-note.md")
  )
  $oldClipboard = $null
  $hadClipboard = $false
  $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

  try {
    try {
      $oldClipboard = Get-Clipboard -Raw -ErrorAction Stop
      $hadClipboard = $true
    } catch {
      $hadClipboard = $false
    }

    [void][MkSmokeWin32]::SetForegroundWindow($Window.Hwnd)
    Start-Sleep -Milliseconds 300
    Set-Clipboard -Value $marker
    Click-WindowPoint $Window 0.52 0.48
    Start-Sleep -Milliseconds 250
    [System.Windows.Forms.SendKeys]::SendWait("^a")
    Start-Sleep -Milliseconds 100
    try {
      if (-not [MkSmokeWin32]::SendFocusedText($Window.Hwnd, $marker)) {
        throw "无法取得当前焦点窗口"
      }
    } catch {
      Write-Host "Direct focused input unavailable: $($_.Exception.Message)"
      [void][MkSmokeWin32]::PostMessage($Window.Hwnd, [MkSmokeWin32]::WM_PASTE, [IntPtr]::Zero, [IntPtr]::Zero)
    }

    Start-Sleep -Milliseconds 250
    Click-WindowPoint $Window 0.50 0.08

    $uiText = ""
    $uiShowsSaveError = $false
    $diskHasMarker = $false
    for ($i = 0; $i -lt 20; $i++) {
      Start-Sleep -Milliseconds 300
      $diskHasMarker = $false
      foreach ($notePath in $notePaths) {
        if ((Test-Path -LiteralPath $notePath) -and ((Get-Content -LiteralPath $notePath -Raw) -like "*$marker*")) {
          $diskHasMarker = $true
        }
      }
      $uiText = Get-WindowUiText $Window.Hwnd
      $uiShowsSaveError = $uiText -match "测试故障注入|保存.*失败|保存.*错误"
      if (-not $diskHasMarker -and $uiShowsSaveError) {
        $stopwatch.Stop()
        return [pscustomobject]@{
          marker = $marker
          diskHasMarker = $diskHasMarker
          uiShowsSaveError = $uiShowsSaveError
          uiText = $uiText
          elapsedMs = [int]$stopwatch.ElapsedMilliseconds
        }
      }
    }

    throw "Save failure smoke failed: diskHasMarker=$diskHasMarker, uiShowsSaveError=$uiShowsSaveError, uiText=$uiText"
  } finally {
    if ($hadClipboard) {
      Set-Clipboard -Value $oldClipboard
    }
  }
}

function Capture-SmokeWindow($Window, [string]$FileName) {
  Add-Type -AssemblyName System.Drawing
  $width = [Math]::Max(1, [int]$Window.Width)
  $height = [Math]::Max(1, [int]$Window.Height)
  $path = Join-Path (Split-Path $PSScriptRoot -Parent) ".codex-smoke\$FileName"
  $bitmap = New-Object System.Drawing.Bitmap $width, $height
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.CopyFromScreen([int]$Window.Left, [int]$Window.Top, 0, 0, $bitmap.Size)
  $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose()
  $bitmap.Dispose()
  return $path
}

function Click-WindowPointWithCtrl($Window, [double]$XRatio, [double]$YRatio) {
  [void][MkSmokeWin32]::SetForegroundWindow($Window.Hwnd)
  [MkSmokeWin32]::keybd_event(0x11, 0, 0, [UIntPtr]::Zero)
  try {
    Click-WindowPoint $Window $XRatio $YRatio
  } finally {
    [MkSmokeWin32]::keybd_event(0x11, 0, 2, [UIntPtr]::Zero)
  }
}

function Wait-NoteWindow([int]$ProcessId, [string]$Title, [int]$MinWidth, [int]$MinHeight, [int]$MaxHeight = 1000) {
  for ($i = 0; $i -lt 40; $i++) {
    $candidate = Get-AppWindows $ProcessId |
      Where-Object {
        $_.Title -eq $Title -and
          $_.Width -ge $MinWidth -and
          $_.Height -ge $MinHeight -and
          $_.Height -le $MaxHeight
      } |
      Select-Object -First 1
    if ($candidate) {
      return $candidate
    }
    Start-Sleep -Milliseconds 300
  }
  $observed = (Get-AppWindows $ProcessId | ForEach-Object { "$($_.Title):$($_.Width)x$($_.Height)@$($_.Left),$($_.Top)" }) -join "; "
  throw "Timed out waiting for note window '$Title' (${MinWidth}x${MinHeight}..${MaxHeight}); observed=$observed"
}

function Open-ExpandedSmokePopout($Main, [int]$ProcessId, [string]$Title) {
  [void][MkSmokeWin32]::SetForegroundWindow($Main.Hwnd)
  # 主窗口 logo 的点击区域是进入 Capsule 的稳定入口；使用比例坐标兼容 DPI 虚拟化。
  Click-WindowPoint $Main 0.04 0.055
  $capsule = Wait-NoteWindow $ProcessId $Title 200 20 120
  [void][MkSmokeWin32]::SetForegroundWindow($capsule.Hwnd)
  # Capsule 左侧圆点负责还原为 Expanded Popout。
  for ($attempt = 0; $attempt -lt 3; $attempt++) {
    Click-WindowPoint $capsule 0.075 0.5
    Start-Sleep -Milliseconds 500
    $expanded = Get-AppWindows $ProcessId |
      Where-Object {
        $_.Title -eq $Title -and
          $_.Width -ge 400 -and
          $_.Height -ge 200 -and
          $_.Height -le 1000
      } |
      Select-Object -First 1
    if ($expanded) {
      return $expanded
    }
  }
  return (Wait-NoteWindow $ProcessId $Title 400 200 1000)
}

function Invoke-WindowSaveFailure(
  $Window,
  [string[]]$NotePaths,
  [string]$ArtifactName,
  [bool]$CollapseToCapsule,
  $FallbackWindow
) {
  Add-Type -AssemblyName System.Windows.Forms
  $marker = "mknote smoke $ArtifactName failure " + [Guid]::NewGuid().ToString("N")
  $oldClipboard = $null
  $hadClipboard = $false
  $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    try {
      $oldClipboard = Get-Clipboard -Raw -ErrorAction Stop
      $hadClipboard = $true
    } catch {
      $hadClipboard = $false
    }

    [void][MkSmokeWin32]::SetForegroundWindow($Window.Hwnd)
    Set-Clipboard -Value $marker
    Click-WindowPoint $Window 0.50 0.55
    Start-Sleep -Milliseconds 250
    [System.Windows.Forms.SendKeys]::SendWait("^a")
    Start-Sleep -Milliseconds 100
    [System.Windows.Forms.SendKeys]::SendWait("^v")
    Start-Sleep -Milliseconds 150
    if (-not [MkSmokeWin32]::SendFocusedPaste($Window.Hwnd)) {
      [void][MkSmokeWin32]::PostMessage($Window.Hwnd, [MkSmokeWin32]::WM_PASTE, [IntPtr]::Zero, [IntPtr]::Zero)
    }
    Start-Sleep -Milliseconds 250

    if ($CollapseToCapsule) {
      Click-WindowPoint $Window 0.82 0.08
    } else {
      # 与主窗口 smoke 一致，点击标题栏触发失焦保存。
      Click-WindowPoint $Window 0.50 0.08
    }

    $uiText = ""
    $diskHasMarker = $false
    for ($i = 0; $i -lt 20; $i++) {
      Start-Sleep -Milliseconds 300
      $diskHasMarker = $false
      foreach ($notePath in $NotePaths) {
        if ((Test-Path -LiteralPath $notePath) -and ((Get-Content -LiteralPath $notePath -Raw) -like "*$marker*")) {
          $diskHasMarker = $true
        }
      }
      $uiText = Get-WindowUiText $Window.Hwnd
      if ($FallbackWindow) {
        $uiText = "$uiText | $(Get-WindowUiText $FallbackWindow.Hwnd)"
      }
      $uiShowsSaveError = $uiText -match "测试故障注入|保存.*失败|保存.*错误"
      if (-not $diskHasMarker -and $uiShowsSaveError) {
        $stopwatch.Stop()
        return [pscustomobject]@{
          marker = $marker
          diskHasMarker = $diskHasMarker
          uiShowsSaveError = $uiShowsSaveError
          uiText = $uiText
          elapsedMs = [int]$stopwatch.ElapsedMilliseconds
          screenshot = Capture-SmokeWindow $Window "release-smoke-$ArtifactName-failure.png"
        }
      }
    }

    $screenshot = Capture-SmokeWindow $Window "release-smoke-$ArtifactName-failure.png"
    throw "$ArtifactName save failure smoke failed: diskHasMarker=$diskHasMarker, uiShowsSaveError=$uiShowsSaveError, uiText=$uiText, screenshot=$screenshot"
  } finally {
    if ($hadClipboard) {
      Set-Clipboard -Value $oldClipboard
    }
  }
}

function Test-CapsuleSaveFailure($Main, [int]$ProcessId, [string]$AppRoot) {
  $expanded = Open-ExpandedSmokePopout $Main $ProcessId "default-note"
  $notePaths = @(
    (Join-Path $AppRoot "default-note.md"),
    (Join-Path $AppRoot "File\default\default-note.md")
  )
  return Invoke-WindowSaveFailure $expanded $notePaths "capsule-save" $true $Main
}

function Test-PopoutSaveFailure($Main, [int]$ProcessId, [string]$AppRoot) {
  $expanded = Open-ExpandedSmokePopout $Main $ProcessId "default-note"
  $notePaths = @(
    (Join-Path $AppRoot "default-note.md"),
    (Join-Path $AppRoot "File\default\default-note.md")
  )
  return Invoke-WindowSaveFailure $expanded $notePaths "popout-save" $false $Main
}

function Test-PrivateSaveFailure($Main, [int]$ProcessId, [string]$AppRoot) {
  $privateDir = Join-Path $AppRoot "File\.private"
  [void][MkSmokeWin32]::SetForegroundWindow($Main.Hwnd)
  # 状态栏字数位于右侧 metadata 区，必须落在可处理 Ctrl+click 的外层 span 上。
  Click-WindowPointWithCtrl $Main 0.90 0.96
  Start-Sleep -Seconds 2

  $privateNote = $null
  for ($i = 0; $i -lt 20; $i++) {
    $privateNote = Get-ChildItem -LiteralPath $privateDir -Filter "*.md" -File -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($privateNote) {
      break
    }
    Start-Sleep -Milliseconds 300
  }
  if (-not $privateNote) {
    throw "Private save failure smoke did not create a private note."
  }

  Add-Type -AssemblyName System.Windows.Forms
  $marker = "mknote smoke private-save failure " + [Guid]::NewGuid().ToString("N")
  $oldClipboard = $null
  $hadClipboard = $false
  try {
    try {
      $oldClipboard = Get-Clipboard -Raw -ErrorAction Stop
      $hadClipboard = $true
    } catch {
      $hadClipboard = $false
    }
    Set-Clipboard -Value $marker
    Click-WindowPoint $Main 0.50 0.55
    Start-Sleep -Milliseconds 250
    [System.Windows.Forms.SendKeys]::SendWait("^a")
    Start-Sleep -Milliseconds 100
    [System.Windows.Forms.SendKeys]::SendWait("^v")
    Start-Sleep -Milliseconds 150
    if (-not [MkSmokeWin32]::SendFocusedPaste($Main.Hwnd)) {
      [void][MkSmokeWin32]::PostMessage($Main.Hwnd, [MkSmokeWin32]::WM_PASTE, [IntPtr]::Zero, [IntPtr]::Zero)
    }

    # Private 没有自动保存；点击主窗口隐藏按钮触发 flushAllDirty/flushPrivateNote。
    Click-WindowPoint $Main 0.95 0.04
    Start-Sleep -Milliseconds 500

    $uiText = ""
    $diskHasMarker = $false
    $windowRemainsVisible = $false
    for ($i = 0; $i -lt 20; $i++) {
      Start-Sleep -Milliseconds 300
      $diskHasMarker = (Test-Path -LiteralPath $privateNote.FullName) -and
        ((Get-Content -LiteralPath $privateNote.FullName -Raw) -like "*$marker*")
      $uiText = Get-WindowUiText $Main.Hwnd
      $windowRemainsVisible = [bool](Get-AppWindows $ProcessId | Where-Object { $_.Hwnd -eq $Main.Hwnd -and $_.Visible })
      $uiShowsSaveError = $uiText -match "测试故障注入|保存.*失败|保存.*错误"
      if (-not $diskHasMarker -and $uiShowsSaveError -and $windowRemainsVisible) {
        return [pscustomobject]@{
          marker = $marker
          notePath = $privateNote.FullName
          diskHasMarker = $diskHasMarker
          uiShowsSaveError = $uiShowsSaveError
          windowRemainsVisible = $windowRemainsVisible
          uiText = $uiText
          screenshot = Capture-SmokeWindow $Main "release-smoke-private-save-failure.png"
        }
      }
    }
    $screenshot = Capture-SmokeWindow $Main "release-smoke-private-save-failure.png"
    throw "Private save failure smoke failed: diskHasMarker=$diskHasMarker, uiShowsSaveError=$uiShowsSaveError, windowRemainsVisible=$windowRemainsVisible, uiText=$uiText, screenshot=$screenshot"
  } finally {
    if ($hadClipboard) {
      Set-Clipboard -Value $oldClipboard
    }
  }
}

function Test-ExitSaveFailure($Main, [int]$ProcessId, [string]$AppRoot, [string]$RunExe) {
  Add-Type -AssemblyName System.Windows.Forms
  $marker = "mknote smoke exit-save failure " + [Guid]::NewGuid().ToString("N")
  $notePath = Join-Path $AppRoot "File\default\default-note.md"
  $oldClipboard = $null
  $hadClipboard = $false
  $quitProcess = $null

  try {
    try {
      $oldClipboard = Get-Clipboard -Raw -ErrorAction Stop
      $hadClipboard = $true
    } catch {
      $hadClipboard = $false
    }

    [void][MkSmokeWin32]::SetForegroundWindow($Main.Hwnd)
    Set-Clipboard -Value $marker
    Click-WindowPoint $Main 0.50 0.55
    Start-Sleep -Milliseconds 250
    [System.Windows.Forms.SendKeys]::SendWait("^a")
    Start-Sleep -Milliseconds 100
    [System.Windows.Forms.SendKeys]::SendWait("^v")
    Start-Sleep -Milliseconds 150
    if (-not [MkSmokeWin32]::SendFocusedPaste($Main.Hwnd)) {
      [void][MkSmokeWin32]::PostMessage($Main.Hwnd, [MkSmokeWin32]::WM_PASTE, [IntPtr]::Zero, [IntPtr]::Zero)
    }
    Start-Sleep -Milliseconds 250

    # 第二次启动通过 single-instance 转发 --quit，复用托盘退出最终使用的 request-quit 事件。
    $quitProcess = Start-Process -FilePath $RunExe -WorkingDirectory $AppRoot -ArgumentList "--quit" -PassThru
    Wait-Process -Id $quitProcess.Id -Timeout 10 -ErrorAction SilentlyContinue

    $uiText = ""
    $diskHasMarker = $false
    $uiShowsSaveError = $false
    $windowRemainsVisible = $false
    for ($i = 0; $i -lt 20; $i++) {
      Start-Sleep -Milliseconds 300
      $diskHasMarker = (Test-Path -LiteralPath $notePath) -and
        ((Get-Content -LiteralPath $notePath -Raw) -like "*$marker*")
      $uiText = Get-WindowUiText $Main.Hwnd
      $uiShowsSaveError = $uiText -match "测试故障注入|保存.*失败|保存.*错误"
      $windowRemainsVisible = [bool](Get-AppWindows $ProcessId | Where-Object { $_.Hwnd -eq $Main.Hwnd -and $_.Visible })
      if (-not $diskHasMarker -and $uiShowsSaveError -and $windowRemainsVisible) {
        return [pscustomobject]@{
          marker = $marker
          notePath = $notePath
          diskHasMarker = $diskHasMarker
          uiShowsSaveError = $uiShowsSaveError
          windowRemainsVisible = $windowRemainsVisible
          uiText = $uiText
          screenshot = Capture-SmokeWindow $Main "release-smoke-exit-save-failure.png"
        }
      }
    }

    $screenshot = Capture-SmokeWindow $Main "release-smoke-exit-save-failure.png"
    throw "Exit save failure smoke failed: diskHasMarker=$diskHasMarker, uiShowsSaveError=$uiShowsSaveError, windowRemainsVisible=$windowRemainsVisible, uiText=$uiText, screenshot=$screenshot"
  } finally {
    if ($hadClipboard) {
      Set-Clipboard -Value $oldClipboard
    }
  }
}

function Test-ExternalConflict($Window, [string]$AppRoot) {
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing
  $localMarker = "mknote smoke local " + [Guid]::NewGuid().ToString("N")
  $externalMarker = "mknote smoke external " + [Guid]::NewGuid().ToString("N")
  $notePath = Join-Path $AppRoot "File\default\default-note.md"
  if (!(Test-Path -LiteralPath $notePath)) {
    throw "External conflict smoke note not found: $notePath"
  }
  $oldClipboard = $null
  $hadClipboard = $false

  try {
    try {
      $oldClipboard = Get-Clipboard -Raw -ErrorAction Stop
      $hadClipboard = $true
    } catch {
      $hadClipboard = $false
    }

    [void][MkSmokeWin32]::SetForegroundWindow($Window.Hwnd)
    Start-Sleep -Milliseconds 300
    Set-Clipboard -Value $localMarker
    Click-WindowPoint $Window 0.52 0.48
    Start-Sleep -Milliseconds 250
    [System.Windows.Forms.SendKeys]::SendWait("^a")
    Start-Sleep -Milliseconds 100
    try {
      if (-not [MkSmokeWin32]::SendFocusedText($Window.Hwnd, $localMarker)) {
        throw "无法取得当前焦点窗口"
      }
    } catch {
      Write-Host "Direct focused input unavailable: $($_.Exception.Message)"
      [void][MkSmokeWin32]::PostMessage($Window.Hwnd, [MkSmokeWin32]::WM_PASTE, [IntPtr]::Zero, [IntPtr]::Zero)
    }

    # 留出输入事件进入 React 状态，但短于 600ms 防抖窗口，确保后端尚未写入 local marker。
    Start-Sleep -Milliseconds 250
    Set-Content -LiteralPath $notePath -Value $externalMarker -Encoding UTF8
    Click-WindowPoint $Window 0.50 0.08

    $uiText = ""
    $uiShowsConflict = $false
    Start-Sleep -Milliseconds 900
    for ($i = 0; $i -lt 40; $i++) {
      Start-Sleep -Milliseconds 300
      $diskContent = if (Test-Path -LiteralPath $notePath) {
        Get-Content -LiteralPath $notePath -Raw
      } else {
        ""
      }
      $uiText = Get-WindowUiText $Window.Hwnd

      # 应用必须已经返回 CAS 冲突，且磁盘仍只保留 external；不能只因为外部文件刚写入就提前通过。
      $diskIsExternalOnly = ($diskContent -like "*$externalMarker*" -and $diskContent -notlike "*$localMarker*")
      $uiShowsConflict = $uiText -match "外部修改|拒绝覆盖|保存.*失败"
      if ($diskIsExternalOnly -and $uiShowsConflict) {
        $shotPath = Join-Path (Split-Path $PSScriptRoot -Parent) ".codex-smoke\release-smoke-cas-conflict.png"
        $windowBitmap = New-Object System.Drawing.Bitmap ([Math]::Max(1, [int]$Window.Width)), ([Math]::Max(1, [int]$Window.Height))
        $windowGraphics = [System.Drawing.Graphics]::FromImage($windowBitmap)
        $windowGraphics.CopyFromScreen([int]$Window.Left, [int]$Window.Top, 0, 0, $windowBitmap.Size)
        $windowBitmap.Save($shotPath, [System.Drawing.Imaging.ImageFormat]::Png)
        $windowGraphics.Dispose()
        $windowBitmap.Dispose()
        return [pscustomobject]@{
          notePath = $notePath
          externalMarker = $externalMarker
          localMarker = $localMarker
          screenshot = $shotPath
          uiShowsConflict = $uiShowsConflict
          uiText = $uiText
        }
      }
    }

    throw "External conflict smoke failed: CAS evidence incomplete; disk=$notePath, uiShowsConflict=$uiShowsConflict, uiText=$uiText"
  } finally {
    if ($hadClipboard) {
      Set-Clipboard -Value $oldClipboard
    }
  }
}

$oldAppData = $env:APPDATA
$oldLocalAppData = $env:LOCALAPPDATA
$oldTemp = $env:TEMP
$oldTmp = $env:TMP
$oldTestSaveDelay = $env:MKN_TEST_SAVE_DELAY_MS
$oldTestSaveFailure = $env:MKN_TEST_SAVE_FAILURE

$proc = $null
try {
  $env:APPDATA = $appData
  $env:LOCALAPPDATA = $localAppData
  $env:TEMP = $tempDir
  $env:TMP = $tempDir
  if ($PSBoundParameters.ContainsKey("SaveDelayMs")) {
    $env:MKN_TEST_SAVE_DELAY_MS = "$SaveDelayMs"
  } else {
    Remove-Item Env:MKN_TEST_SAVE_DELAY_MS -ErrorAction SilentlyContinue
  }
  $verifyWindowSaveFailure = $VerifySaveFailure -or $VerifyCapsuleSave -or $VerifyPopoutSave -or $VerifyPrivateSave -or $VerifyExitSaveFailure
  if ($verifyWindowSaveFailure) {
    $env:MKN_TEST_SAVE_FAILURE = "1"
  } else {
    Remove-Item Env:MKN_TEST_SAVE_FAILURE -ErrorAction SilentlyContinue
  }

  $proc = Start-Process -FilePath $runExe -WorkingDirectory $appRoot -PassThru
  $createdMain = $null
  for ($i = 0; $i -lt 40; $i++) {
    if ($proc.HasExited) {
      throw "MKNOTE exited before creating the main window. ExitCode=$($proc.ExitCode)"
    }
    $createdMain = Find-AnyMainWindow $proc.Id
    if ($createdMain) { break }
    Start-Sleep -Milliseconds 500
  }
  if (!$createdMain) {
    Get-AppWindows $proc.Id | Format-List | Out-String | Write-Host
    throw "MKNOTE main window was not created."
  }

  $showProc = Start-Process -FilePath $runExe -WorkingDirectory $appRoot -ArgumentList "--show" -PassThru
  Wait-Process -Id $showProc.Id -Timeout 10 -ErrorAction SilentlyContinue

  $main = $null
  for ($i = 0; $i -lt 40; $i++) {
    $main = Find-MainWindow $proc.Id
    if ($main) { break }
    Start-Sleep -Milliseconds 500
  }

  if (!$main) {
    Get-AppWindows $proc.Id | Format-List | Out-String | Write-Host
    throw "MKNOTE main window did not become visible."
  }

  [void][MkSmokeWin32]::SetForegroundWindow($main.Hwnd)
  Start-Sleep -Seconds 10

  $inputSave = $null
  $externalConflict = $null
  $saveFailure = $null
  $capsuleSave = $null
  $popoutSave = $null
  $privateSave = $null
  $exitSave = $null
  if ($VerifyInputSave) {
    $inputSave = Test-InputAutoSave $main $appRoot
  }
  if ($VerifyExternalConflict) {
    $externalConflict = Test-ExternalConflict $main $appRoot
  }
  if ($VerifySaveFailure) {
    $saveFailure = Test-SaveFailure $main $appRoot
  }
  if ($VerifyCapsuleSave) {
    $capsuleSave = Test-CapsuleSaveFailure $main $proc.Id $appRoot
  }
  if ($VerifyPopoutSave) {
    $popoutSave = Test-PopoutSaveFailure $main $proc.Id $appRoot
  }
  if ($VerifyPrivateSave) {
    $privateSave = Test-PrivateSaveFailure $main $proc.Id $appRoot
  }
  if ($VerifyExitSaveFailure) {
    $exitSave = Test-ExitSaveFailure $main $proc.Id $appRoot $runExe
  }

  Add-Type -AssemblyName System.Drawing
  $width = [Math]::Max(1, [int]$main.Width)
  $height = [Math]::Max(1, [int]$main.Height)
  $bitmap = New-Object System.Drawing.Bitmap $width, $height
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.CopyFromScreen([int]$main.Left, [int]$main.Top, 0, 0, $bitmap.Size)
  $shotPath = Join-Path $artifactDir "release-smoke-main.png"
  $bitmap.Save($shotPath, [System.Drawing.Imaging.ImageFormat]::Png)

  $minBrightness = 255
  $maxBrightness = 0
  $sumBrightness = 0.0
  $sampleCount = 0
  $stepX = [Math]::Max(1, [Math]::Floor($width / 48))
  $stepY = [Math]::Max(1, [Math]::Floor($height / 48))
  for ($x = 0; $x -lt $width; $x += $stepX) {
    for ($y = 0; $y -lt $height; $y += $stepY) {
      $pixel = $bitmap.GetPixel($x, $y)
      $brightness = [Math]::Round(($pixel.R + $pixel.G + $pixel.B) / 3)
      $minBrightness = [Math]::Min($minBrightness, $brightness)
      $maxBrightness = [Math]::Max($maxBrightness, $brightness)
      $sumBrightness += $brightness
      $sampleCount += 1
    }
  }
  $meanBrightness = if ($sampleCount -gt 0) { [Math]::Round($sumBrightness / $sampleCount, 2) } else { 0 }
  $brightnessRange = $maxBrightness - $minBrightness

  $metadata = [pscustomobject]@{
    timestamp = (Get-Date).ToString("o")
    pid = $proc.Id
    window = [pscustomobject]@{
      left = $main.Left
      top = $main.Top
      width = $main.Width
      height = $main.Height
    }
    screenshot = $shotPath
    sandbox = $sandbox
    saveDelayMs = if ($PSBoundParameters.ContainsKey("SaveDelayMs")) { $SaveDelayMs } else { $null }
    inputSave = $inputSave
    externalConflict = $externalConflict
    saveFailure = $saveFailure
    capsuleSave = $capsuleSave
    popoutSave = $popoutSave
    privateSave = $privateSave
    exitSave = $exitSave
    pixel = [pscustomobject]@{
      samples = $sampleCount
      minBrightness = $minBrightness
      maxBrightness = $maxBrightness
      meanBrightness = $meanBrightness
      brightnessRange = $brightnessRange
    }
  }
  $metadataPath = Join-Path $artifactDir "release-smoke-main.json"
  $metadata | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $metadataPath -Encoding UTF8

  $graphics.Dispose()
  $bitmap.Dispose()

  if ($brightnessRange -lt 12) {
    throw "MKNOTE screenshot appears blank. Brightness range=$brightnessRange, screenshot=$shotPath"
  }

  Write-Host "MKNOTE release smoke passed"
  Write-Host "pid=$($proc.Id)"
  Write-Host "window=$($main.Left),$($main.Top),$($main.Width)x$($main.Height)"
  Write-Host "screenshot=$shotPath"
  Write-Host "metadata=$metadataPath"
  Write-Host "brightnessRange=$brightnessRange meanBrightness=$meanBrightness"
  if ($inputSave) {
    Write-Host "inputSaveNote=$($inputSave.notePath)"
    Write-Host "inputSaveMarker=$($inputSave.marker)"
  }
  if ($externalConflict) {
    Write-Host "externalConflictNote=$($externalConflict.notePath)"
    Write-Host "externalConflictScreenshot=$($externalConflict.screenshot)"
  }
  if ($capsuleSave) {
    Write-Host "capsuleSaveScreenshot=$($capsuleSave.screenshot)"
  }
  if ($popoutSave) {
    Write-Host "popoutSaveScreenshot=$($popoutSave.screenshot)"
  }
  if ($privateSave) {
    Write-Host "privateSaveScreenshot=$($privateSave.screenshot)"
  }
  if ($exitSave) {
    Write-Host "exitSaveScreenshot=$($exitSave.screenshot)"
  }
  Write-Host "sandbox=$sandbox"
}
finally {
  if ($proc -and !$proc.HasExited) {
    $main = Find-MainWindow $proc.Id
    if ($main) {
      [void][MkSmokeWin32]::PostMessage($main.Hwnd, [MkSmokeWin32]::WM_CLOSE, [IntPtr]::Zero, [IntPtr]::Zero)
      Start-Sleep -Seconds 2
    }
    if (!$proc.HasExited) {
      Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    }
  }
  $env:APPDATA = $oldAppData
  $env:LOCALAPPDATA = $oldLocalAppData
  $env:TEMP = $oldTemp
  $env:TMP = $oldTmp
  if ($null -eq $oldTestSaveDelay) {
    Remove-Item Env:MKN_TEST_SAVE_DELAY_MS -ErrorAction SilentlyContinue
  } else {
    $env:MKN_TEST_SAVE_DELAY_MS = $oldTestSaveDelay
  }
  if ($null -eq $oldTestSaveFailure) {
    Remove-Item Env:MKN_TEST_SAVE_FAILURE -ErrorAction SilentlyContinue
  } else {
    $env:MKN_TEST_SAVE_FAILURE = $oldTestSaveFailure
  }
}

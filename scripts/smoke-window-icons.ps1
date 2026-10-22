param([Parameter(Mandatory)][string]$ExePath, [switch]$KeepRunning)
$ErrorActionPreference = 'Stop'
$taskSource = (Resolve-Path -LiteralPath $ExePath).Path
# A separate identifier/product name prevents CLI forwarding and autostart edits
# from affecting the user's regular instance. Build with this TAURI_CONFIG first.
if ((Get-Item -LiteralPath $taskSource).VersionInfo.ProductName -ne 'MDnote Icon Smoke') {
    throw 'Requires an isolated build: TAURI_CONFIG={"identifier":"com.sin.md-sticky-note.icon-smoke","productName":"MDnote Icon Smoke"}'
}
$taskRoot = Join-Path ([IO.Path]::GetTempPath()) ('mknote-icon-smoke-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $taskRoot | Out-Null
$taskExe = Join-Path $taskRoot 'md-sticky-note.exe'
Copy-Item -LiteralPath $taskSource -Destination $taskExe
$taskConfig = @{
    last_note = $null; always_on_top = $false; autostart = $false
    sync_enabled = $false; clip_server_enabled = $false
    global_hotkeys = @{
        toggle_window = 'Ctrl+Alt+Shift+F15'; focus_window = 'Ctrl+Alt+Shift+F16'
        quick_capture = 'Ctrl+Alt+Shift+F17'; clipboard_inbox = 'Ctrl+Alt+Shift+F18'
        quick_search = 'Ctrl+Alt+Shift+F19'
    }
}
[IO.File]::WriteAllText((Join-Path $taskRoot 'config.json'), ($taskConfig | ConvertTo-Json -Depth 4))
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class MkIconSmoke {
 public delegate bool EnumProc(IntPtr hwnd, IntPtr param);
 [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr param);
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
 [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int count);
 [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr hwnd);
 [DllImport("user32.dll")] public static extern int GetSystemMetricsForDpi(int index, uint dpi);
 [DllImport("user32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr SendMessageTimeout(IntPtr hwnd, uint msg, IntPtr w, IntPtr l, uint flags, uint timeout, out IntPtr result);
 [StructLayout(LayoutKind.Sequential)] struct IconInfo { public bool icon; public uint x,y; public IntPtr mask,color; }
 [StructLayout(LayoutKind.Sequential)] struct BitmapInfo { public int type,width,height,stride; public ushort planes,bits; public IntPtr data; }
 [StructLayout(LayoutKind.Sequential)] struct Rect { public int left,top,right,bottom; }
 [DllImport("user32.dll")] static extern bool GetIconInfo(IntPtr icon, out IconInfo info);
 [DllImport("gdi32.dll")] static extern int GetObject(IntPtr bitmap, int count, out BitmapInfo info);
 [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr obj);
 [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr hwnd, out Rect rect);
 [DllImport("user32.dll")] public static extern uint GetGuiResources(IntPtr process, uint flag);
 public static Dictionary<string,IntPtr> Windows(uint pid) {
  var result=new Dictionary<string,IntPtr>();
  EnumWindows((hwnd,p)=>{uint current;GetWindowThreadProcessId(hwnd,out current);
   if(current==pid){var title=new StringBuilder(256);GetWindowText(hwnd,title,256);if(title.Length>0)result[title.ToString()]=hwnd;}
   return true;},IntPtr.Zero);return result;
 }
 public static int IconSize(IntPtr hwnd, int kind) {
  IntPtr icon;
  if(SendMessageTimeout(hwnd,0x7f,(IntPtr)kind,IntPtr.Zero,2,2000,out icon)==IntPtr.Zero)throw new Exception("WM_GETICON timed out");
  IconInfo info;if(icon==IntPtr.Zero||!GetIconInfo(icon,out info))return 0;
  try{BitmapInfo bitmap;GetObject(info.color,Marshal.SizeOf(typeof(BitmapInfo)),out bitmap);return bitmap.width;}
  finally{if(info.mask!=IntPtr.Zero)DeleteObject(info.mask);if(info.color!=IntPtr.Zero)DeleteObject(info.color);}
 }
 public static void DpiChange(uint pid, IntPtr hwnd, uint dpi) {
  // This system message synchronously marshals the suggested RECT to the
  // disposable test window; never change the desktop's actual DPI settings.
  Rect rect;GetWindowRect(hwnd,out rect);
  var bytes=new byte[16];var values=new[]{rect.left,rect.top,rect.right,rect.bottom};
  for(int i=0;i<4;i++)Buffer.BlockCopy(BitConverter.GetBytes(values[i]),0,bytes,i*4,4);
  var address=Marshal.AllocHGlobal(16);
  try{
   Marshal.Copy(bytes,0,address,16);
   IntPtr result;
   if(SendMessageTimeout(hwnd,0x2e0,(IntPtr)((dpi<<16)|dpi),address,2,5000,out result)==IntPtr.Zero)throw new Exception("WM_DPICHANGED failed: "+Marshal.GetLastWin32Error());
  }finally{Marshal.FreeHGlobal(address);}
 }
}
'@
function Assert-WindowIcons([IntPtr]$Hwnd, [uint32]$Dpi) {
    $taskExpectedSmall = [MkIconSmoke]::GetSystemMetricsForDpi(49, $Dpi)
    $taskExpectedBig = [MkIconSmoke]::GetSystemMetricsForDpi(11, $Dpi)
    $taskSmall = [MkIconSmoke]::IconSize($Hwnd, 0)
    $taskBig = [MkIconSmoke]::IconSize($Hwnd, 1)
    if ($taskSmall -ne $taskExpectedSmall -or $taskBig -ne $taskExpectedBig) {
        throw "DPI $Dpi expected $taskExpectedSmall/$taskExpectedBig, got $taskSmall/$taskBig"
    }
    "DPI $Dpi : small=$taskSmall big=$taskBig"
}
$taskProc = $null
$taskSucceeded = $false
try {
    $taskStart = [Diagnostics.ProcessStartInfo]::new($taskExe)
    $taskStart.UseShellExecute = $false
    $taskStart.WindowStyle = [Diagnostics.ProcessWindowStyle]::Hidden
    $taskStart.EnvironmentVariables['APPDATA'] = Join-Path $taskRoot 'Roaming'
    $taskStart.EnvironmentVariables['LOCALAPPDATA'] = Join-Path $taskRoot 'Local'
    $taskProc = [Diagnostics.Process]::Start($taskStart)
    $taskMain = [IntPtr]::Zero
    for ($taskTry=0; $taskTry -lt 100; $taskTry++) {
        if ($taskProc.HasExited) { throw "Test process exited: $($taskProc.ExitCode)" }
        $taskWindows = [MkIconSmoke]::Windows($taskProc.Id)
        if ($taskWindows.ContainsKey('MKNOTE')) { $taskMain = $taskWindows['MKNOTE']; break }
        Start-Sleep -Milliseconds 100
    }
    if ($taskMain -eq [IntPtr]::Zero) { throw 'Main window not created' }
    # WebView2 and the first DPI change lazily create native UI resources.
    # Warm them up before measuring whether repeated icon replacement leaks.
    Start-Sleep -Milliseconds 5000
    $taskNativeDpi = [MkIconSmoke]::GetDpiForWindow($taskMain)
    Assert-WindowIcons $taskMain $taskNativeDpi
    foreach ($taskDpi in @(96,120,144,192,$taskNativeDpi)) {
        [MkIconSmoke]::DpiChange($taskProc.Id, $taskMain, $taskDpi)
        Start-Sleep -Milliseconds 100
        Assert-WindowIcons $taskMain $taskDpi
    }
    Start-Sleep -Milliseconds 2000
    $taskBaseline = [MkIconSmoke]::GetGuiResources($taskProc.Handle, 1)
    for ($taskCycle=0; $taskCycle -lt 10; $taskCycle++) {
        foreach ($taskDpi in @(96,120,144,192)) {
            [MkIconSmoke]::DpiChange($taskProc.Id, $taskMain, $taskDpi)
            Start-Sleep -Milliseconds 50
            $taskResult = Assert-WindowIcons $taskMain $taskDpi
            if ($taskCycle -eq 0) { $taskResult }
        }
    }
    [MkIconSmoke]::DpiChange($taskProc.Id, $taskMain, $taskNativeDpi)
    Start-Sleep -Milliseconds 300
    $taskAfter = [MkIconSmoke]::GetGuiResources($taskProc.Handle, 1)
    if ($taskAfter -gt $taskBaseline + 2) { throw "USER handles grew from $taskBaseline to $taskAfter" }
    "40 DPI changes: USER handles $taskBaseline -> $taskAfter"
    foreach ($taskArgument in @('--quick-todo','--quick-pocket')) {
        $taskForward = Start-Process -FilePath $taskExe -ArgumentList $taskArgument -WindowStyle Hidden -PassThru
        if (-not $taskForward.WaitForExit(10000)) { throw 'Test CLI forwarding timed out' }
    }
    Start-Sleep -Milliseconds 1500
    $taskQuick = @([MkIconSmoke]::Windows($taskProc.Id).GetEnumerator() | Where-Object { $_.Key -like 'Quick*' })
    if ($taskQuick.Count -lt 2) { throw 'Quick Todo/Pocket windows not created' }
    foreach ($taskWindow in $taskQuick) {
        $taskWindow.Key
        Assert-WindowIcons $taskWindow.Value ([MkIconSmoke]::GetDpiForWindow($taskWindow.Value))
    }
    "PASS fixture=$taskRoot pid=$($taskProc.Id)"
    $taskSucceeded = $true
} finally {
    if ($taskProc -and -not $taskProc.HasExited -and (-not $KeepRunning -or -not $taskSucceeded)) {
        # Only the copied, disposable test process may be stopped here.
        $taskProc.Kill(); $taskProc.WaitForExit()
    }
}

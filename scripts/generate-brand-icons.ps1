param([string]$SourcePng = (Join-Path $PSScriptRoot '..\src\assets\brand\logo-transparent.png'))
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path $PSScriptRoot -Parent
$taskSource = (Resolve-Path -LiteralPath $SourcePng).Path
$taskStage = Join-Path $taskRoot '.codex-smoke\brand-icons'
$taskFrames = Join-Path $taskStage 'frames'
$taskSizes = @(16,20,24,30,32,36,40,48,60,64,72,96,128,256)

Push-Location $taskRoot
try {
    # Reuse Tauri's alpha-preserving exporter for platform images and each ICO frame.
    & npm.cmd run tauri -- icon $taskSource --output $taskStage
    if ($LASTEXITCODE -ne 0) { throw 'Tauri icon export failed' }
    $taskArguments = @('run','tauri','--','icon',$taskSource,'--output',$taskFrames)
    foreach ($taskSize in $taskSizes) { $taskArguments += @('--png', "$taskSize") }
    & npm.cmd @taskArguments
    if ($LASTEXITCODE -ne 0) { throw 'Windows frame export failed' }

    # ICO directory entries contain exact-size PNG frames; no background compositing.
    $taskImages = @($taskSizes | ForEach-Object { ,([System.IO.File]::ReadAllBytes((Join-Path $taskFrames "${_}x${_}.png"))) })
    $taskStream = [System.IO.File]::Create((Join-Path $taskStage 'icon.ico'))
    $taskWriter = [System.IO.BinaryWriter]::new($taskStream)
    try {
        $taskWriter.Write([uint16]0); $taskWriter.Write([uint16]1); $taskWriter.Write([uint16]$taskSizes.Count)
        $taskOffset = 6 + 16 * $taskSizes.Count
        for ($taskIndex = 0; $taskIndex -lt $taskSizes.Count; $taskIndex++) {
            $taskDimension = if ($taskSizes[$taskIndex] -eq 256) { 0 } else { $taskSizes[$taskIndex] }
            $taskWriter.Write([byte]$taskDimension); $taskWriter.Write([byte]$taskDimension)
            $taskWriter.Write([byte]0); $taskWriter.Write([byte]0)
            $taskWriter.Write([uint16]1); $taskWriter.Write([uint16]32)
            $taskWriter.Write([uint32]$taskImages[$taskIndex].Length); $taskWriter.Write([uint32]$taskOffset)
            $taskOffset += $taskImages[$taskIndex].Length
        }
        foreach ($taskImage in $taskImages) { $taskWriter.Write([byte[]]$taskImage) }
    } finally { $taskWriter.Dispose() }

    $taskNames = @('32x32.png','128x128.png','128x128@2x.png','icon.png','icon.ico','icon.icns',
        'StoreLogo.png','Square30x30Logo.png','Square44x44Logo.png','Square71x71Logo.png','Square89x89Logo.png',
        'Square107x107Logo.png','Square142x142Logo.png','Square150x150Logo.png','Square284x284Logo.png','Square310x310Logo.png')
    foreach ($taskName in $taskNames) {
        Copy-Item -LiteralPath (Join-Path $taskStage $taskName) -Destination (Join-Path $taskRoot "src-tauri\icons\$taskName") -Force
    }
    $taskEncoded = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($taskSource))
    $taskSvg = '<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><image width="24" height="24" href="data:image/png;base64,' + $taskEncoded + '"/></svg>'
    [System.IO.File]::WriteAllText((Join-Path $taskRoot 'src\assets\icons\logo.svg'), $taskSvg)
} finally { Pop-Location }

# Pack release exe into portable folder (no CLI / no install required)
# 本脚本请保存为 UTF-8 with BOM，避免中文文件名在 PowerShell 5 下乱码
$ErrorActionPreference = "Stop"
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$root = Split-Path $PSScriptRoot -Parent
$package = Get-Content (Join-Path $root "package.json") -Raw | ConvertFrom-Json
$version = $package.version
$srcExe = Join-Path $root "src-tauri\target\release\md-sticky-note.exe"
$distIndex = Join-Path $root "dist\index.html"
$outDir = Join-Path $root "portable"
$outExe = Join-Path $outDir "MarkdownStickyNote.exe"

if (-not (Test-Path $srcExe)) {
    Write-Error "Missing $srcExe — run: npm run build:green"
    exit 1
}

if (Test-Path $distIndex) {
    $exeTime = (Get-Item $srcExe).LastWriteTime
    $distTime = (Get-Item $distIndex).LastWriteTime
    if ($exeTime -lt $distTime) {
        Write-Error "Release exe is older than dist/ frontend ($exeTime < $distTime). Re-run npm run build:green."
        exit 1
    }
}

$exeText = [System.Text.Encoding]::UTF8.GetString([System.IO.File]::ReadAllBytes($srcExe))
$markers = @("set_message_hub_s3_config", "sync_tick", "delete_empty_note_if_needed", "get_quick_data_directories", "set_quick_data_directory", "quick_todo_open_work_source")
$missing = @($markers | Where-Object { -not $exeText.Contains($_) })
if ($missing.Count -gt 0) {
    Write-Error "Release exe missing expected features: $($missing -join ', '). Stale build — run npm run build:green."
    exit 1
}

New-Item -ItemType Directory -Force -Path $outDir | Out-Null
Copy-Item -Path $srcExe -Destination $outExe -Force

# 文件名仅用 ASCII，避免资源管理器/脚本编码不一致出现「浣跨敤璇存槑」类乱码
$readmePath = Join-Path $outDir "README.txt"

$readme = @"
MKnote Markdown 便签 — 绿色便携版
================================

【启动】
  双击本目录中的 MarkdownStickyNote.exe，无需命令行、无需安装 Node。
  若电脑上正在运行源码开发版或旧版 MKnote，请先退出旧实例；MKnote 使用单实例机制，
  否则新 EXE 的启动请求会被旧实例接管，看起来像 Todo/Pocket 无法打开。

【首次使用】
  解压后仅含 MarkdownStickyNote.exe 与 README.txt，不会附带示例便签。
  首次启动会在 exe 同级目录初始化应用数据与配置文件。
  普通便签需点击「新建便签」自行创建。

【配置】
  与本目录 MarkdownStickyNote.exe 同级的 config.json（随绿色版文件夹一起移动）

【系统】
  Windows 10/11，需 WebView2（多数系统已自带）。

【更新】
  在源码目录执行: npm run build:green

【说明文件编码】
  本文件为 UTF-8（带 BOM）。若用记事本打开仍乱码，请在编辑器中选择 UTF-8 编码打开。

"@

$utf8Bom = New-Object System.Text.UTF8Encoding $true
[System.IO.File]::WriteAllText($readmePath, $readme, $utf8Bom)

# 删除旧版乱码文件名的说明（若存在）
$legacyNames = @(
    (Join-Path $outDir "使用说明.txt"),
    (Join-Path $outDir "浣跨敤璇存槑.txt")
)
foreach ($p in $legacyNames) {
    if (Test-Path -LiteralPath $p) {
        Remove-Item -LiteralPath $p -Force
    }
}

Write-Host "Portable build: $outExe"
Write-Host "Readme: $readmePath (UTF-8 BOM)"

# 干净分发包：仅 exe + README，不含开发机遗留便签
$releaseDir = Join-Path $root "portable-release"
New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null
Copy-Item -Path $outExe -Destination (Join-Path $releaseDir "MarkdownStickyNote.exe") -Force
Copy-Item -Path $readmePath -Destination (Join-Path $releaseDir "README.txt") -Force
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$zipStamped = Join-Path $root "MKnote-portable-v$version-$stamp.zip"
if (Test-Path -LiteralPath $zipStamped) { Remove-Item -LiteralPath $zipStamped -Force }
Compress-Archive -Path (Join-Path $releaseDir "*") -DestinationPath $zipStamped -Force
Write-Host "Clean zip (timestamped): $zipStamped"

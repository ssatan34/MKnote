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
$exeWideText = [System.Text.Encoding]::Unicode.GetString([System.IO.File]::ReadAllBytes($srcExe))
foreach ($prefix in @($env:USERPROFILE, $root)) {
    foreach ($variant in @($prefix, $prefix.Replace('\', '/'))) {
        if ($variant -and ($exeText.Contains($variant) -or $exeWideText.Contains($variant))) {
            throw "EXE contains private build paths. Use CARGO_HOME at a neutral path (see scripts/licenses/README.md), then rebuild."
        }
    }
}
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
  解压后包含程序、README.txt、LICENSE、THIRD_PARTY_NOTICES.md 与 LICENSES/。
  LICENSES/ 内提供第三方许可证、版权声明和 MPL 依赖源码归档，不附带用户便签或配置。
  首次启动会在 exe 同级目录初始化应用数据与配置文件。
  普通便签需点击「新建便签」自行创建。

【配置】
  与本目录 MarkdownStickyNote.exe 同级的 config.json（随绿色版文件夹一起移动）

【系统】
  Windows 10/11 x64，需 Microsoft Edge WebView2 Runtime。
  若系统缺少 WebView2，请从微软官方下载 Evergreen Runtime：
  https://developer.microsoft.com/microsoft-edge/webview2/
  本程序不需要安装 Node.js 或 Rust。请勿从压缩包或只读目录运行。

【更新】
  下载新版本后，先从托盘退出旧实例，备份整个旧文件夹及自定义 Quick 数据目录。
  将新包解压至单独文件夹核对内容，再覆盖旧目录中的程序与许可证文件。
  保留原 config.json、File/、inbox/ 及自定义数据目录，不要用空目录覆盖已有数据。
  数据默认与 EXE 同级；WebView2 缓存及系统集成可能保存在当前 Windows 用户目录。

【下载与校验】
  官方发布：https://github.com/ssatan34/MKnote/releases/latest
  选择 MKnote-portable-v$version-windows-x64.zip，不要将 GitHub 自动生成的 Source code 当成程序。
  用 PowerShell 执行 Get-FileHash <下载的ZIP路径> -Algorithm SHA256，
  与同一 Release 的 SHA256SUMS.txt 比较。
  当前 EXE 未做代码签名；若 Windows 提示，请先核对来源及 SHA-256，再自行决定是否运行。

【许可证与反馈】
  MKnote 原创代码采用 MIT，第三方部分适用各自许可证，详见随包声明和 LICENSES/。
  MPL 2.0 依赖的未修改源码随 LICENSES/MPL-2.0-sources.zip 提供，解压后为标准 .crate 源码归档。
  问题反馈：https://github.com/ssatan34/MKnote/issues
  反馈时勿附真实笔记、服务凭据或未脱敏配置。

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

# Fresh staging directory and explicit allowlist prevent stale user data entering a release.
$releaseDir = Join-Path $root ("portable-release\" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $releaseDir | Out-Null
foreach ($required in @("LICENSE", "THIRD_PARTY_NOTICES.md", "LICENSES\npm-dependencies.txt", "LICENSES\rust-dependencies.txt", "LICENSES\binary-dependency-manifest.json", "LICENSES\Rust-Standard-Library.html", "LICENSES\mpl-sources.json", "LICENSES\MPL-2.0-sources.zip")) {
    if (-not (Test-Path -LiteralPath (Join-Path $root $required))) {
        throw "Missing redistribution notice/source file: $required"
    }
}
$licenseManifest = Get-Content (Join-Path $root "LICENSES\binary-dependency-manifest.json") -Raw | ConvertFrom-Json
foreach ($lockfile in $licenseManifest.lockfiles.PSObject.Properties) {
    $hasher = [System.Security.Cryptography.SHA256]::Create()
    try {
        $lockHash = [BitConverter]::ToString($hasher.ComputeHash([IO.File]::ReadAllBytes((Join-Path $root $lockfile.Name)))).Replace('-', '').ToLowerInvariant()
    } finally { $hasher.Dispose() }
    if ($lockHash -ne $lockfile.Value) {
        throw "Dependency lockfile changed; regenerate redistribution licenses: $($lockfile.Name)"
    }
}
Copy-Item -Path $outExe -Destination (Join-Path $releaseDir "MarkdownStickyNote.exe") -Force
Copy-Item -Path $readmePath -Destination (Join-Path $releaseDir "README.txt") -Force
Copy-Item -LiteralPath (Join-Path $root "LICENSE"), (Join-Path $root "THIRD_PARTY_NOTICES.md") -Destination $releaseDir
Copy-Item -LiteralPath (Join-Path $root "LICENSES") -Destination $releaseDir -Recurse
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$zipStamped = Join-Path $root "MKnote-portable-v$version-$stamp.zip"
if (Test-Path -LiteralPath $zipStamped) { Remove-Item -LiteralPath $zipStamped -Force }
Compress-Archive -Path (Join-Path $releaseDir "*") -DestinationPath $zipStamped -Force
Write-Host "Clean zip (timestamped): $zipStamped"

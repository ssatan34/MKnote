# Full green portable build: force local cargo target, then pack exe + zip.
$ErrorActionPreference = "Stop"
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$root = Split-Path $PSScriptRoot -Parent
$targetDir = Join-Path $root "src-tauri\target"
$env:CARGO_TARGET_DIR = $targetDir

Write-Host "CARGO_TARGET_DIR=$targetDir"
Push-Location $root
try {
    npm run tauri build
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & (Join-Path $PSScriptRoot "pack-green.ps1")
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
    Pop-Location
}

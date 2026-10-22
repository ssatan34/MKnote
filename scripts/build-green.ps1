# Full green portable build: force local cargo target, then pack exe + zip.
$ErrorActionPreference = "Stop"
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$root = Split-Path $PSScriptRoot -Parent
$targetDir = Join-Path $root "src-tauri\target"
$env:CARGO_TARGET_DIR = $targetDir
# Keep developer filesystem paths out of panic messages embedded in public binaries.
$oldRustFlags = $env:RUSTFLAGS
$oldEncodedRustFlags = $env:CARGO_ENCODED_RUSTFLAGS
$cargoHome = if ($env:CARGO_HOME) { $env:CARGO_HOME } else { Join-Path $env:USERPROFILE ".cargo" }
$rustupHome = if ($env:RUSTUP_HOME) { $env:RUSTUP_HOME } else { Join-Path $env:USERPROFILE ".rustup" }
$flags = if ($oldEncodedRustFlags) { @($oldEncodedRustFlags -split [char]31) } else { @($oldRustFlags -split '\s+' | Where-Object { $_ }) }
$flags += @("--remap-path-prefix=$root=/build/MKnote", "--remap-path-prefix=$cargoHome=/cargo", "--remap-path-prefix=$rustupHome=/rustup")
$env:CARGO_ENCODED_RUSTFLAGS = $flags -join [char]31

Write-Host "CARGO_TARGET_DIR=$targetDir"
Push-Location $root
try {
    npm run tauri build -- --no-bundle
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & (Join-Path $PSScriptRoot "pack-green.ps1")
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
    $env:RUSTFLAGS = $oldRustFlags
    $env:CARGO_ENCODED_RUSTFLAGS = $oldEncodedRustFlags
    Pop-Location
}

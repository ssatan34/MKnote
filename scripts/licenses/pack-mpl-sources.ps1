$ErrorActionPreference = 'Stop'
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$inventory = Get-Content (Join-Path $root 'LICENSES/dependency-inventory.json') -Raw | ConvertFrom-Json
$cargoCacheRoot = if ($env:CARGO_HOME) { $env:CARGO_HOME } else { Join-Path $env:USERPROFILE '.cargo' }
$staging = Join-Path $root ('.codex-smoke/mpl-sources-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $staging -Force | Out-Null
$lock = Get-Content (Join-Path $root 'src-tauri/Cargo.lock') -Raw
$manifest = @()
foreach ($crate in @($inventory.cargoWindows | Where-Object { $_.license -eq 'MPL-2.0' })) {
    $name = "$($crate.name)-$($crate.version).crate"
    $source = @(Get-ChildItem (Join-Path $cargoCacheRoot 'registry/cache') -Directory | ForEach-Object {
        $candidate = Join-Path $_.FullName $name
        if (Test-Path -LiteralPath $candidate) { Get-Item -LiteralPath $candidate }
    }) | Select-Object -First 1
    if (-not $source) { throw "Missing crate archive: $name (run cargo fetch --locked)" }
    $hash = (Get-FileHash -LiteralPath $source.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    $block = @($lock -split '\[\[package\]\]' | Where-Object {
        $_ -match ('(?m)^name = "' + [Regex]::Escape($crate.name) + '"') -and
        $_ -match ('(?m)^version = "' + [Regex]::Escape($crate.version) + '"')
    })
    if ($block.Count -ne 1 -or $block[0] -notmatch ('checksum = "' + $hash + '"')) { throw "Cargo.lock checksum mismatch: $name" }
    Copy-Item -LiteralPath $source.FullName -Destination $staging
    $manifest += [ordered]@{ name = $crate.name; version = $crate.version; license = 'MPL-2.0'; modified = $false; archive = $name; sha256 = $hash; source = "https://static.crates.io/crates/$($crate.name)/$name" }
}
if ($manifest.Count -eq 0) { throw 'No MPL sources collected; review dependency inventory' }
$manifest | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $root 'LICENSES/mpl-sources.json') -Encoding UTF8
@'
These unchanged third-party sources are available under Mozilla Public License 2.0.
Each .crate is the exact upstream gzip-compressed tar source archive verified against Cargo.lock.
Extract with: tar -xzf <name-version.crate>
Licenses and copyright headers are retained inside each archive.
See ../rust-dependencies.txt for the full MPL 2.0 text and ../mpl-sources.json for URLs and SHA-256.
These are dependency sources, not user notes or MKnote backups.
'@ | Set-Content (Join-Path $staging 'README.txt') -Encoding UTF8
Compress-Archive -Path (Join-Path $staging '*') -DestinationPath (Join-Path $root 'LICENSES/MPL-2.0-sources.zip') -Force
Write-Host "Verified and packaged $($manifest.Count) unchanged MPL source archives."

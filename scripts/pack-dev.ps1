# Pack tracked files and untracked source. Never alter source files or old archives.
$ErrorActionPreference = "Stop"
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$root = Split-Path $PSScriptRoot -Parent
$outZip = Join-Path $root ("MKnote-dev-{0}-{1}.zip" -f (Get-Date -Format "yyyyMMdd-HHmmss"), [Guid]::NewGuid().ToString("N").Substring(0, 8))

$devReadme = @'
MKnote - dev migration pack
===========================

New machine:
  Node.js 18.14+ or 20 LTS
  Rust (rustup)
  Windows: VS Build Tools (Desktop development with C++)
  WebView2

After extract:
  cd <project folder>
  npm install
  npm run tauri dev

Not included (rebuild on new machine):
  node_modules/
  src-tauri/target/
  dist/
  portable/

Optional user data:
  %AppData%\md-sticky-note\config.json
  your notes folder

Rebuild this zip:
  npm run pack:dev

Agent / handover (read first):
  docs/AGENT-HANDOVER.md
  docs/MKnote-UI-v2.md
  AGENTS.md

'@

# Read tracked paths without Git's non-ASCII quoting. Modified tracked files are
# read from the working tree; ignored files and untracked local data are excluded.
$tracked = @(& git -C $root -c core.quotepath=false ls-files)
if ($LASTEXITCODE -ne 0) { throw "Cannot enumerate tracked source files." }
$untracked = @(& git -C $root -c core.quotepath=false ls-files --others --exclude-standard)
if ($LASTEXITCODE -ne 0) { throw "Cannot enumerate untracked source files." }
# Restrict new files to source trees and source extensions; exclude local data.
$newSource = @($untracked | Where-Object {
    $_ -match '^(src/|src-tauri/src/|tests/|scripts/)' -and
    $_ -match '\.(ts|tsx|js|jsx|mjs|cjs|rs|css|ps1)$'
})
$files = @(($tracked + $newSource) | Sort-Object -Unique | Where-Object {
    $_ -notmatch '(^|/)(node_modules|target[^/]*|dist|dist-ssr|portable[^/]*|artifacts|test-results|gen|inbox|File|notes|\.git|\.codex-smoke)(/|$)' -and
    $_ -notmatch '(^|/)(\.env[^/]*|config\.json|credentials|mknote-manifest\.json|llms\.txt)$' -and
    $_ -notmatch '\.(zip|pem|key|pfx|log)$'
})
if ($files.Count -eq 0) { throw "No tracked source files found." }

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
# CreateNew prevents replacing an existing archive, even on a name collision.
$stream = [System.IO.File]::Open($outZip, [System.IO.FileMode]::CreateNew)
$archive = New-Object System.IO.Compression.ZipArchive($stream, [System.IO.Compression.ZipArchiveMode]::Create, $false)
$includedReadme = $false
try {
    foreach ($relative in $files) {
        if ($relative.StartsWith('/') -or $relative -match '(^|/)\.\.(/|$)' -or $relative.Contains('"')) {
            throw "Unsupported source path: $relative"
        }
        $source = Join-Path $root $relative
        if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { continue }
        # Reject links/junctions along the full path: never package external files.
        $item = Get-Item -LiteralPath $source -Force
        while ($item.FullName -ne $root) {
            if ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
                throw "Linked source path is not permitted: $relative"
            }
            if ($item -is [System.IO.FileInfo]) { $item = $item.Directory } else { $item = $item.Parent }
            if (-not $item) { throw "Source path escaped the project: $relative" }
        }
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, (Join-Path $root $relative), $relative, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
        if ($relative -eq 'DEV-README.txt') { $includedReadme = $true }
    }
    if (-not $includedReadme) {
        $entry = $archive.CreateEntry('DEV-README.txt')
        $writer = New-Object System.IO.StreamWriter($entry.Open(), (New-Object System.Text.UTF8Encoding($false)))
        try { $writer.Write($devReadme) } finally { $writer.Dispose() }
    }
} finally {
    $archive.Dispose()
    $stream.Dispose()
}
Write-Host "Dev pack: $outZip"
Write-Host "Included tracked files and $($newSource.Count) untracked source files; other untracked files are excluded."

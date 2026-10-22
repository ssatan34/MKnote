# 只读取显式提供的当前 ZIP 和基线 ZIP，生成 T4 collector 可消费的 machine-readable 指标。
# 本脚本不构建、不压缩、不删除旧产物，也不会自动选择目录中的“最新 ZIP”。
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$CurrentZip,

[Parameter(Mandatory = $true)]
[string]$BaselineZip,

    [Parameter(Mandatory = $true)]
    [string]$CurrentReleaseExe,

    [string]$OutputPath = "poc\visual-editor-phase1a\artifacts\phase1a-t4-package-metrics.json"
)

$ErrorActionPreference = "Stop"
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repositoryRoot = Split-Path $PSScriptRoot -Parent

function Resolve-ExistingFile([string]$PathValue, [string]$Label) {
    $resolved = Resolve-Path -LiteralPath $PathValue -ErrorAction Stop
    if (-not (Test-Path -LiteralPath $resolved.Path -PathType Leaf)) {
        throw "$Label is not a file: $PathValue"
    }
    return $resolved.Path
}

function Get-ZipEntries([string]$ZipPath) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [System.IO.Compression.ZipFile]::OpenRead($ZipPath)
    try {
        return @($archive.Entries | ForEach-Object { $_.FullName })
    } finally {
        $archive.Dispose()
    }
}

function Get-ZipEntrySha256([string]$ZipPath, [string]$EntryName) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [System.IO.Compression.ZipFile]::OpenRead($ZipPath)
    try {
        $entry = @($archive.Entries | Where-Object { $_.FullName -eq $EntryName }) | Select-Object -First 1
        if ($null -eq $entry) {
            throw "ZIP entry not found: $EntryName"
        }

        $stream = $entry.Open()
        $sha256 = [System.Security.Cryptography.SHA256]::Create()
        try {
            return (($sha256.ComputeHash($stream) | ForEach-Object { $_.ToString("x2") }) -join "").ToUpperInvariant()
        } finally {
            $sha256.Dispose()
            $stream.Dispose()
        }
    } finally {
        $archive.Dispose()
    }
}

$currentPath = Resolve-ExistingFile $CurrentZip "CurrentZip"
$baselinePath = Resolve-ExistingFile $BaselineZip "BaselineZip"
$currentReleasePath = Resolve-ExistingFile $CurrentReleaseExe "CurrentReleaseExe"
$outputAbsolutePath = if ([System.IO.Path]::IsPathRooted($OutputPath)) {
    $OutputPath
} else {
    Join-Path $repositoryRoot $OutputPath
}

$currentFile = Get-Item -LiteralPath $currentPath
$baselineFile = Get-Item -LiteralPath $baselinePath
$currentReleaseFile = Get-Item -LiteralPath $currentReleasePath
$currentHash = (Get-FileHash -LiteralPath $currentPath -Algorithm SHA256).Hash
$currentReleaseHash = (Get-FileHash -LiteralPath $currentReleasePath -Algorithm SHA256).Hash
$entries = Get-ZipEntries $currentPath
$packageExeHash = Get-ZipEntrySha256 $currentPath "MarkdownStickyNote.exe"

$payload = [ordered]@{
    schemaVersion = "mknote.visual-editor.t4-package-metrics.v1"
    generatedAt = (Get-Date).ToUniversalTime().ToString("o")
    metrics = [ordered]@{
        releasePackage = [ordered]@{
            currentBytes = [int64]$currentFile.Length
            baselineBytes = [int64]$baselineFile.Length
            currentPath = $currentPath
            baselinePath = $baselinePath
            currentReleaseExePath = $currentReleasePath
            currentReleaseExeBytes = [int64]$currentReleaseFile.Length
            sha256 = $currentHash
            currentReleaseExeSha256 = $currentReleaseHash
            packageExeSha256 = $packageExeHash
            entries = $entries
            command = "scripts/collect-visual-editor-t4-package-metrics.ps1"
        }
    }
}

$outputDirectory = Split-Path $outputAbsolutePath -Parent
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
$payload | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $outputAbsolutePath -Encoding UTF8

Write-Output ("output=" + $outputAbsolutePath)
Write-Output ("currentBytes=" + $currentFile.Length)
Write-Output ("baselineBytes=" + $baselineFile.Length)
Write-Output ("sha256=" + $currentHash)
Write-Output ("currentReleaseExeSha256=" + $currentReleaseHash)
Write-Output ("packageExeSha256=" + $packageExeHash)
Write-Output ("entries=" + ($entries -join ","))

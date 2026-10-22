# 只读取显式保存延迟样本报告，转换为 T4 collector 可消费的 metrics.saveCas。
# 不启动应用、不写入笔记、不从 inputSave.elapsedMs 推断主线程阻塞。

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$InputReportPath,

    [Parameter(Mandatory = $true)]
    [string]$OutputPath
)

$ErrorActionPreference = "Stop"
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$expectedSamples = 30
$targetP95Ms = 50
$sampleSchemaVersion = "mknote.visual-editor.t4-save-cas-samples.v1"
$metricsSchemaVersion = "mknote.visual-editor.t4-save-cas-metrics.v1"

function Resolve-RepositoryPath([string]$PathValue) {
    if ([System.IO.Path]::IsPathRooted($PathValue)) {
        return [System.IO.Path]::GetFullPath($PathValue)
    }
    return [System.IO.Path]::GetFullPath((Join-Path $repositoryRoot $PathValue))
}

function Get-PropertyValue([object]$Object, [string]$Name) {
    if ($null -eq $Object) {
        return $null
    }
    $property = $Object.PSObject.Properties[$Name]
    if ($null -eq $property) {
        return $null
    }
    return $property.Value
}

function Read-JsonFile([string]$PathValue) {
    if (-not (Test-Path -LiteralPath $PathValue -PathType Leaf)) {
        throw "输入报告不存在：$PathValue"
    }
    $raw = ([System.IO.File]::ReadAllText($PathValue, [System.Text.Encoding]::UTF8)).TrimStart([char[]](0xFEFF))
    try {
        return $raw | ConvertFrom-Json
    } catch {
        throw "输入报告不是有效 JSON：$PathValue；$($_.Exception.Message)"
    }
}

function Write-JsonFile([object]$Payload, [string]$PathValue) {
    $directory = Split-Path -Parent $PathValue
    if (-not [string]::IsNullOrWhiteSpace($directory)) {
        New-Item -ItemType Directory -Force -Path $directory | Out-Null
    }
    $Payload | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $PathValue -Encoding UTF8
}

function Convert-ToFiniteNonNegativeDouble([object]$Value) {
    if ($null -eq $Value -or $Value -is [bool]) {
        return $null
    }
    try {
        $number = [double]::Parse(
            [string]$Value,
            [System.Globalization.CultureInfo]::InvariantCulture
        )
    } catch {
        return $null
    }
    if ([double]::IsNaN($number) -or [double]::IsInfinity($number) -or $number -lt 0) {
        return $null
    }
    return $number
}

function Read-FailureEvidence([object]$Container, [string]$Name) {
    $entry = Get-PropertyValue $Container $Name
    if ($null -eq $entry) {
        return [ordered]@{
            status = "not-run"
            sourcePath = $null
            reason = "缺少 $Name 证据"
        }
    }

    $status = [string](Get-PropertyValue $entry "status")
    $sourcePath = [string](Get-PropertyValue $entry "sourcePath")
    $allowedStatuses = @("pass", "failed", "incomplete", "not-run")
    if ($allowedStatuses -notcontains $status) {
        return [ordered]@{
            status = "incomplete"
            sourcePath = if ([string]::IsNullOrWhiteSpace($sourcePath)) { $null } else { $sourcePath }
            reason = "$Name 证据 status 无效"
        }
    }

    if ($status -eq "pass" -and [string]::IsNullOrWhiteSpace($sourcePath)) {
        return [ordered]@{
            status = "incomplete"
            sourcePath = $null
            reason = "$Name 通过证据缺少 sourcePath"
        }
    }

    return [ordered]@{
        status = $status
        sourcePath = if ([string]::IsNullOrWhiteSpace($sourcePath)) { $null } else { $sourcePath }
        reason = $null
    }
}

$inputAbsolutePath = Resolve-RepositoryPath $InputReportPath
$outputAbsolutePath = Resolve-RepositoryPath $OutputPath
if ($inputAbsolutePath -eq $outputAbsolutePath) {
    throw "OutputPath 不能覆盖 InputReportPath"
}

$report = Read-JsonFile $inputAbsolutePath
if ((Get-PropertyValue $report "schemaVersion") -ne $sampleSchemaVersion) {
    throw "输入报告 schemaVersion 不匹配：要求 $sampleSchemaVersion"
}

$declaredExpectedSamples = Convert-ToFiniteNonNegativeDouble (Get-PropertyValue $report "expectedSamples")
if ($null -eq $declaredExpectedSamples -or $declaredExpectedSamples -ne $expectedSamples) {
    throw "输入报告必须声明 expectedSamples=$expectedSamples"
}

$rawSamples = Get-PropertyValue $report "samples"
$samples = if ($null -eq $rawSamples) { @() } else { @($rawSamples) }
$sampleValues = New-Object System.Collections.Generic.List[double]
$invalidSampleReasons = New-Object System.Collections.Generic.List[string]
for ($index = 0; $index -lt $samples.Count; $index++) {
    $blockingMs = Convert-ToFiniteNonNegativeDouble (Get-PropertyValue $samples[$index] "blockingMs")
    if ($null -eq $blockingMs) {
        [void]$invalidSampleReasons.Add("sample[$index] 缺少有效 blockingMs")
        continue
    }
    [void]$sampleValues.Add([double]$blockingMs)
}

$saveFailure = Read-FailureEvidence (Get-PropertyValue $report "failureEvidence") "saveFailure"
$casConflict = Read-FailureEvidence (Get-PropertyValue $report "failureEvidence") "casConflict"
$failureEvidence = [ordered]@{
    saveFailure = $saveFailure
    casConflict = $casConflict
}

$incompleteReasons = New-Object System.Collections.Generic.List[string]
if ($samples.Count -ne $expectedSamples) {
    [void]$incompleteReasons.Add("样本不足：$($samples.Count)/$expectedSamples")
}
foreach ($reason in @($invalidSampleReasons)) {
    [void]$incompleteReasons.Add($reason)
}
foreach ($evidence in @($saveFailure, $casConflict)) {
    if ($evidence.status -ne "pass") {
        [void]$incompleteReasons.Add($evidence.reason)
    }
}

$p95Ms = $null
if ($samples.Count -eq $expectedSamples -and $invalidSampleReasons.Count -eq 0) {
    $sortedValues = @($sampleValues | Sort-Object)
    $rank = [int][Math]::Ceiling($sortedValues.Count * 0.95)
    $p95Ms = [Math]::Round([double]$sortedValues[$rank - 1], 2)
}

$failedEvidence = @($saveFailure, $casConflict) | Where-Object { $_.status -eq "failed" }
$hasFailedThreshold = $null -ne $p95Ms -and $p95Ms -gt $targetP95Ms
$status = "pass"
if ($failedEvidence.Count -gt 0 -or $hasFailedThreshold) {
    $status = "failed"
} elseif ($incompleteReasons.Count -gt 0 -or $null -eq $p95Ms) {
    $status = "incomplete"
}

$thresholdSuffix = if ($hasFailedThreshold) {
    "；p95 ${p95Ms} ms 超过目标 ${targetP95Ms} ms"
} else {
    ""
}
if ($status -eq "pass") {
    $summary = "保存/CAS 阻塞 p95 " + $p95Ms + " ms，样本 " + $expectedSamples + "/" + $expectedSamples + "，故障与冲突证据齐全。"
} elseif ($status -eq "failed") {
    $summary = "保存/CAS T4 证据失败：" + ($incompleteReasons -join "；") + $thresholdSuffix + "。"
} else {
    $summary = "保存/CAS T4 证据不完整：" + ($incompleteReasons -join "；") + "。"
}

$payload = [ordered]@{
    schemaVersion = $metricsSchemaVersion
    generatedAt = (Get-Date).ToUniversalTime().ToString("o")
    metrics = [ordered]@{
        saveCas = [ordered]@{
            status = $status
            summary = $summary
            p95Ms = $p95Ms
            samples = $samples.Count
            validSamples = $sampleValues.Count
            expectedSamples = $expectedSamples
            targetP95Ms = $targetP95Ms
            sampleMinMs = if ($sampleValues.Count -gt 0) { [Math]::Round([double](($sampleValues | Measure-Object -Minimum).Minimum), 2) } else { $null }
            sampleMaxMs = if ($sampleValues.Count -gt 0) { [Math]::Round([double](($sampleValues | Measure-Object -Maximum).Maximum), 2) } else { $null }
            failureEvidence = $failureEvidence
            incompleteReasons = @($incompleteReasons)
            inputReportPath = $inputAbsolutePath
            sourcePath = $outputAbsolutePath
            command = "scripts/collect-visual-editor-t4-save-cas.ps1"
        }
    }
}

Write-JsonFile $payload $outputAbsolutePath
Write-Output ("output=" + $outputAbsolutePath)
Write-Output ("status=" + $status)
Write-Output ("samples=" + $samples.Count + "/" + $expectedSamples)
Write-Output ("p95Ms=" + $p95Ms)

exit 0

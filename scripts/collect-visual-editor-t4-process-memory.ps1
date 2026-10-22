# 只读采集显式 root PID 的 Win32_Process 进程树，并将两次快照合并为 T4 指标。
# Capture 模式只查询进程；Compare 模式只读取快照，不启动、停止或接管进程。
[CmdletBinding(DefaultParameterSetName = "Capture")]
param(
    [Parameter(Mandatory = $true, ParameterSetName = "Capture")]
    [ValidateRange(1, [int]::MaxValue)]
    [int]$RootPid,
    [Parameter(Mandatory = $true, ParameterSetName = "Capture")]
    [ValidateSet("baseline", "after", "closed", "tabs")]
    [string]$Phase,
    [Parameter(Mandatory = $true, ParameterSetName = "Capture")]
    [string]$SnapshotPath,
    [Parameter(Mandatory = $true, ParameterSetName = "Compare")]
    [string]$BaselineSnapshotPath,
    [Parameter(Mandatory = $true, ParameterSetName = "Compare")]
    [string]$AfterSnapshotPath,
    [Parameter(Mandatory = $true, ParameterSetName = "Compare")]
    [ValidateRange(0, [int]::MaxValue)]
    [int]$TabCount,
    [Parameter(Mandatory = $true, ParameterSetName = "Compare")]
    [ValidateRange(0, [int]::MaxValue)]
    [int]$PopoutCount,
    [Parameter(Mandatory = $false, ParameterSetName = "Compare")]
    [string]$ClosedSnapshotPath,
    [Parameter(Mandatory = $true, ParameterSetName = "Capture")]
    [Parameter(Mandatory = $true, ParameterSetName = "Compare")]
    [string]$OutputPath
)

$ErrorActionPreference = "Stop"
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$snapshotSchemaVersion = "mknote.visual-editor.t4-process-memory-snapshot.v1"
$metricsSchemaVersion = "mknote.visual-editor.t4-process-memory-metrics.v1"

function Resolve-RepositoryPath([string]$PathValue) {
    if ([System.IO.Path]::IsPathRooted($PathValue)) {
        return [System.IO.Path]::GetFullPath($PathValue)
    }

    return [System.IO.Path]::GetFullPath((Join-Path $repositoryRoot $PathValue))
}

function Convert-ToNonNegativeInt64($Value) {
    if ($null -eq $Value) { return $null }
    try {
        $number = [Convert]::ToInt64($Value)
        if ($number -lt 0) { return $null }
        return $number
    } catch {
        return $null
    }
}

function Write-JsonPayload([object]$Payload, [string]$PathValue) {
    $directory = Split-Path -Parent $PathValue
    if (-not [string]::IsNullOrWhiteSpace($directory)) {
        New-Item -ItemType Directory -Force -Path $directory | Out-Null
    }
    $Payload | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $PathValue -Encoding UTF8
}

function Get-ProcessSnapshot([int]$RootPidValue, [string]$PhaseValue) {
    $errors = New-Object System.Collections.Generic.List[string]
    $selected = New-Object System.Collections.Generic.List[object]
    try {
        # Win32_Process 同时提供父子关系和内存字段，避免通过窗口或句柄接管目标。
        $processTable = @(Get-CimInstance -ClassName Win32_Process -ErrorAction Stop)
    } catch {
        [void]$errors.Add("Win32_Process 查询失败：$($_.Exception.Message)")
        return [ordered]@{
            schemaVersion = $snapshotSchemaVersion
            generatedAt = (Get-Date).ToUniversalTime().ToString("o")
            phase = $PhaseValue
            rootPid = $RootPidValue
            snapshotComplete = $false
            incompleteReasons = @($errors)
            processCount = 0
            totalWorkingSetBytes = $null
            totalPrivateBytes = $null
            processes = @()
        }
    }

    $processById = @{}
    $childrenByParent = @{}
    foreach ($process in $processTable) {
        $processId = Convert-ToNonNegativeInt64 $process.ProcessId
        $parentProcessId = Convert-ToNonNegativeInt64 $process.ParentProcessId
        if ($null -eq $processId -or $null -eq $parentProcessId) {
            [void]$errors.Add("进程表存在无效 PID 或 ParentProcessId")
            continue
        }
        if ($processById.ContainsKey($processId)) {
            [void]$errors.Add("进程表包含重复 PID：$processId")
            continue
        }
        $processById[$processId] = $process
        if ($childrenByParent.ContainsKey($parentProcessId)) {
            $childrenByParent[$parentProcessId] += $processId
        } else {
            $childrenByParent[$parentProcessId] = @($processId)
        }
    }

    if (-not $processById.ContainsKey([int64]$RootPidValue)) {
        [void]$errors.Add("显式 root PID 不在 Win32_Process 快照中：$RootPidValue")
    } else {
        $queue = New-Object System.Collections.Generic.Queue[long]
        $queue.Enqueue([int64]$RootPidValue)
        $visited = @{}
        while ($queue.Count -gt 0) {
            $currentPid = $queue.Dequeue()
            if ($visited.ContainsKey($currentPid)) { continue }
            $visited[$currentPid] = $true
            if (-not $processById.ContainsKey($currentPid)) {
                [void]$errors.Add("子进程在遍历期间缺失：$currentPid")
                continue
            }
            $process = $processById[$currentPid]
            $workingSetBytes = Convert-ToNonNegativeInt64 $process.WorkingSetSize
            $privateBytes = Convert-ToNonNegativeInt64 $process.PrivatePageCount
            if ($null -eq $workingSetBytes -or $null -eq $privateBytes) {
                [void]$errors.Add("进程缺少有效内存字段：$currentPid")
                continue
            }
            [void]$selected.Add([ordered]@{
                processId = $currentPid
                parentProcessId = [int64]$process.ParentProcessId
                name = [string]$process.Name
                workingSetBytes = $workingSetBytes
                privateBytes = $privateBytes
            })
            if ($childrenByParent.ContainsKey($currentPid)) {
                foreach ($childPid in @($childrenByParent[$currentPid])) {
                    $queue.Enqueue([int64]$childPid)
                }
            }
        }
    }

    $snapshotComplete = $errors.Count -eq 0 -and $selected.Count -gt 0
    $totalWorkingSetBytes = [int64]0
    $totalPrivateBytes = [int64]0
    foreach ($process in $selected) {
        $totalWorkingSetBytes += [int64]$process.workingSetBytes
        $totalPrivateBytes += [int64]$process.privateBytes
    }
    $reportedWorkingSetBytes = $null
    $reportedPrivateBytes = $null
    if ($snapshotComplete) {
        $reportedWorkingSetBytes = $totalWorkingSetBytes
        $reportedPrivateBytes = $totalPrivateBytes
    }
    return [ordered]@{
        schemaVersion = $snapshotSchemaVersion
        generatedAt = (Get-Date).ToUniversalTime().ToString("o")
        phase = $PhaseValue
        rootPid = $RootPidValue
        snapshotComplete = $snapshotComplete
        incompleteReasons = @($errors)
        processCount = $selected.Count
        totalWorkingSetBytes = $reportedWorkingSetBytes
        totalPrivateBytes = $reportedPrivateBytes
        processes = @($selected | Sort-Object -Property processId)
    }
}

function Read-JsonFile([string]$PathValue, [string]$Label) {
    $resolvedPath = Resolve-RepositoryPath $PathValue
    if (-not (Test-Path -LiteralPath $resolvedPath -PathType Leaf)) {
        throw "$Label 不存在：$PathValue"
    }
    $raw = (Get-Content -LiteralPath $resolvedPath -Raw).TrimStart([char[]](0xFEFF))
    try {
        return [pscustomobject]@{
            path = $resolvedPath
            value = ($raw | ConvertFrom-Json)
        }
    } catch {
        throw "$Label 不是有效 JSON：$PathValue；$($_.Exception.Message)"
    }
}

function Validate-Snapshot([object]$SnapshotEnvelope, [string]$Label) {
    $reasons = New-Object System.Collections.Generic.List[string]
    $snapshot = $SnapshotEnvelope.value
    if ($snapshot.schemaVersion -ne $snapshotSchemaVersion) {
        [void]$reasons.Add("$Label schemaVersion 不匹配")
    }
    if ($snapshot.snapshotComplete -ne $true) {
        [void]$reasons.Add("$Label snapshotComplete 不是 true")
    }
    $rootPidValue = Convert-ToNonNegativeInt64 $snapshot.rootPid
    if ($null -eq $rootPidValue -or $rootPidValue -le 0) {
        [void]$reasons.Add("$Label 缺少有效 root PID")
    }
    $processes = @()
    if ($null -ne $snapshot.processes) {
        $processes = @($snapshot.processes)
    }
    $declaredCount = Convert-ToNonNegativeInt64 $snapshot.processCount
    if ($null -eq $declaredCount -or $declaredCount -ne $processes.Count) {
        [void]$reasons.Add("$Label processCount 与进程清单不一致")
    }

    $seen = @{}
    $parentById = @{}
    $workingSetSum = [int64]0
    $privateSum = [int64]0
    foreach ($process in $processes) {
        $processId = Convert-ToNonNegativeInt64 $process.processId
        $parentProcessId = Convert-ToNonNegativeInt64 $process.parentProcessId
        $workingSetBytes = Convert-ToNonNegativeInt64 $process.workingSetBytes
        $privateBytes = Convert-ToNonNegativeInt64 $process.privateBytes
        if ($null -eq $processId -or $null -eq $parentProcessId -or $null -eq $workingSetBytes -or $null -eq $privateBytes) {
            [void]$reasons.Add("$Label 包含缺少 PID、父 PID 或内存字段的进程")
            continue
        }
        if ($seen.ContainsKey($processId)) {
            [void]$reasons.Add("$Label 包含重复 PID：$processId")
            continue
        }
        $seen[$processId] = $true
        $parentById[$processId] = $parentProcessId
        $workingSetSum += $workingSetBytes
        $privateSum += $privateBytes
    }

    if ($null -ne $rootPidValue -and $seen.ContainsKey($rootPidValue)) {
        $reachable = @{}
        $queue = New-Object System.Collections.Generic.Queue[long]
        $queue.Enqueue([int64]$rootPidValue)
        while ($queue.Count -gt 0) {
            $currentPid = $queue.Dequeue()
            if ($reachable.ContainsKey($currentPid)) { continue }
            $reachable[$currentPid] = $true
            foreach ($candidatePid in @($parentById.Keys)) {
                if ($parentById[$candidatePid] -eq $currentPid) {
                    $queue.Enqueue([int64]$candidatePid)
                }
            }
        }
        if ($reachable.Count -ne $seen.Count) {
            [void]$reasons.Add("$Label 进程清单不是以 root PID 为根的完整树")
        }
    } else {
        [void]$reasons.Add("$Label 进程清单缺少 root PID")
    }

    $declaredWorkingSet = Convert-ToNonNegativeInt64 $snapshot.totalWorkingSetBytes
    if ($null -eq $declaredWorkingSet -or $declaredWorkingSet -ne $workingSetSum) {
        [void]$reasons.Add("$Label totalWorkingSetBytes 与进程清单不一致")
    }
    $declaredPrivate = Convert-ToNonNegativeInt64 $snapshot.totalPrivateBytes
    if ($null -eq $declaredPrivate -or $declaredPrivate -ne $privateSum) {
        [void]$reasons.Add("$Label totalPrivateBytes 与进程清单不一致")
    }

    $valid = $reasons.Count -eq 0
    $validatedProcessCount = $null
    $validatedWorkingSetBytes = $null
    if ($valid) {
        $validatedProcessCount = $processes.Count
        $validatedWorkingSetBytes = $workingSetSum
    }
    return [pscustomobject]@{
        valid = $valid
        rootPid = $rootPidValue
        processCount = $validatedProcessCount
        workingSetBytes = $validatedWorkingSetBytes
        reasons = @($reasons)
        processes = @($processes)
    }
}

function Get-ValidatedProcessMap([object]$ValidatedSnapshot) {
    $processById = @{}
    foreach ($process in @($ValidatedSnapshot.processes)) {
        $processId = Convert-ToNonNegativeInt64 $process.processId
        if ($null -ne $processId) {
            $processById[[int64]$processId] = $process
        }
    }
    return $processById
}

function Get-LifecycleDelta([object]$AfterSnapshot, [object]$ClosedSnapshot) {
    $afterById = Get-ValidatedProcessMap $AfterSnapshot
    $closedById = Get-ValidatedProcessMap $ClosedSnapshot
    $releasedProcesses = @(
        foreach ($processId in @($afterById.Keys)) {
            if (-not $closedById.ContainsKey($processId)) {
                $afterById[$processId]
            }
        }
    )
    $releasedWebView2Processes = @(
        $releasedProcesses | Where-Object { [string]$_.name -match "webview2" }
    )
    $complete =
        $AfterSnapshot.valid -and
        $ClosedSnapshot.valid -and
        $AfterSnapshot.rootPid -eq $ClosedSnapshot.rootPid
    $releasedWorkingSetBytes = $null
    if ($complete) {
        $releasedWorkingSetBytes = $AfterSnapshot.workingSetBytes - $ClosedSnapshot.workingSetBytes
    }
    return [ordered]@{
        snapshotComplete = $complete
        afterRootPid = $AfterSnapshot.rootPid
        closedRootPid = $ClosedSnapshot.rootPid
        afterBytes = $AfterSnapshot.workingSetBytes
        closedBytes = $ClosedSnapshot.workingSetBytes
        releasedWorkingSetBytes = $releasedWorkingSetBytes
        afterProcessCount = $AfterSnapshot.processCount
        closedProcessCount = $ClosedSnapshot.processCount
        releasedProcessCount = $releasedProcesses.Count
        releasedProcessIds = @(
            $releasedProcesses |
                ForEach-Object { Convert-ToNonNegativeInt64 $_.processId } |
                Where-Object { $null -ne $_ } |
                Sort-Object
        )
        releasedWebView2ProcessCount = $releasedWebView2Processes.Count
        releasedWebView2ProcessIds = @(
            $releasedWebView2Processes |
                ForEach-Object { Convert-ToNonNegativeInt64 $_.processId } |
                Where-Object { $null -ne $_ } |
                Sort-Object
        )
        releasedWebView2Processes = @(
            $releasedWebView2Processes |
                ForEach-Object {
                    [ordered]@{
                        processId = Convert-ToNonNegativeInt64 $_.processId
                        name = [string]$_.name
                        workingSetBytes = Convert-ToNonNegativeInt64 $_.workingSetBytes
                        privateBytes = Convert-ToNonNegativeInt64 $_.privateBytes
                    }
                }
        )
    }
}

if ($PSCmdlet.ParameterSetName -eq "Capture") {
    $outputAbsolutePath = Resolve-RepositoryPath $OutputPath
    $snapshotAbsolutePath = Resolve-RepositoryPath $SnapshotPath
    if ($outputAbsolutePath -eq $snapshotAbsolutePath) {
        throw "OutputPath 不能覆盖 SnapshotPath"
    }
    $payload = Get-ProcessSnapshot $RootPid $Phase
    Write-JsonPayload $payload $snapshotAbsolutePath
    Write-Output ("output=" + $snapshotAbsolutePath)
    Write-Output ("phase=" + $Phase)
    Write-Output ("rootPid=" + $RootPid)
    Write-Output ("snapshotComplete=" + $payload.snapshotComplete)
    Write-Output ("processCount=" + $payload.processCount)
    if (-not $payload.snapshotComplete) { exit 1 }
    exit 0
}

$outputAbsolutePath = Resolve-RepositoryPath $OutputPath
$baselineEnvelope = Read-JsonFile $BaselineSnapshotPath "BaselineSnapshot"
$afterEnvelope = Read-JsonFile $AfterSnapshotPath "AfterSnapshot"
$closedEnvelope = $null
if (-not [string]::IsNullOrWhiteSpace($ClosedSnapshotPath)) {
    $closedEnvelope = Read-JsonFile $ClosedSnapshotPath "ClosedSnapshot"
}
if (
    $outputAbsolutePath -eq $baselineEnvelope.path -or
    $outputAbsolutePath -eq $afterEnvelope.path -or
    ($null -ne $closedEnvelope -and $outputAbsolutePath -eq $closedEnvelope.path)
) {
    throw "OutputPath 不能覆盖输入快照"
}

$baseline = Validate-Snapshot $baselineEnvelope "baseline 快照"
$after = Validate-Snapshot $afterEnvelope "after 快照"
$closed = $null
$lifecycleIncompleteReasons = New-Object System.Collections.Generic.List[string]
$lifecycleSnapshotComplete = $false
$lifecycleDelta = $null
if ($null -ne $closedEnvelope) {
    $closed = Validate-Snapshot $closedEnvelope "closed 快照"
    foreach ($reason in @($closed.reasons)) {
        [void]$lifecycleIncompleteReasons.Add($reason)
    }
    $afterClosedRootPidMatches =
        $after.rootPid -ne $null -and
        $closed.rootPid -ne $null -and
        $after.rootPid -eq $closed.rootPid
    if (-not $afterClosedRootPidMatches) {
        [void]$lifecycleIncompleteReasons.Add("after/closed root PID 不一致")
    }
    $lifecycleSnapshotComplete =
        $after.valid -and
        $closed.valid -and
        $afterClosedRootPidMatches
    $lifecycleDelta = Get-LifecycleDelta $after $closed
}
$incompleteReasons = New-Object System.Collections.Generic.List[string]
foreach ($reason in @($baseline.reasons)) {
    [void]$incompleteReasons.Add($reason)
}
foreach ($reason in @($after.reasons)) {
    [void]$incompleteReasons.Add($reason)
}
$rootPidMatches =
    $baseline.rootPid -ne $null -and
    $after.rootPid -ne $null -and
    $baseline.rootPid -eq $after.rootPid
if (-not $rootPidMatches) {
    [void]$incompleteReasons.Add("baseline/after root PID 不一致")
}
$snapshotComplete = $baseline.valid -and $after.valid -and $rootPidMatches
$reportedBaselineBytes = $null
$reportedAfterBytes = $null
$reportedRootPid = $null
if ($baseline.valid) { $reportedBaselineBytes = $baseline.workingSetBytes }
if ($after.valid) { $reportedAfterBytes = $after.workingSetBytes }
if ($rootPidMatches) { $reportedRootPid = $baseline.rootPid }
$lifecycleReport = [ordered]@{
    enabled = $null -ne $closedEnvelope
    snapshotComplete = if ($null -ne $closedEnvelope) { $lifecycleSnapshotComplete } else { $null }
    closedSnapshotPath = if ($null -ne $closedEnvelope) { $closedEnvelope.path } else { $null }
    incompleteReasons = @($lifecycleIncompleteReasons)
}
if ($null -ne $lifecycleDelta) {
    foreach ($propertyName in $lifecycleDelta.Keys) {
        $lifecycleReport[$propertyName] = $lifecycleDelta[$propertyName]
    }
}
$metrics = [ordered]@{
    schemaVersion = $metricsSchemaVersion
    generatedAt = (Get-Date).ToUniversalTime().ToString("o")
    metrics = [ordered]@{
        processMemory = [ordered]@{
            baselineBytes = $reportedBaselineBytes
            afterBytes = $reportedAfterBytes
            tabCount = $TabCount
            popoutCount = $PopoutCount
            snapshotComplete = $snapshotComplete
            rootPid = $reportedRootPid
            baselineRootPid = $baseline.rootPid
            afterRootPid = $after.rootPid
            baselineProcessCount = $baseline.processCount
            afterProcessCount = $after.processCount
            baselineSnapshotPath = $baselineEnvelope.path
            afterSnapshotPath = $afterEnvelope.path
            incompleteReasons = @($incompleteReasons)
            lifecycle = $lifecycleReport
            sourcePath = $outputAbsolutePath
            command = "scripts/collect-visual-editor-t4-process-memory.ps1"
        }
    }
}

Write-JsonPayload $metrics $outputAbsolutePath
Write-Output ("output=" + $outputAbsolutePath)
Write-Output ("snapshotComplete=" + $snapshotComplete)
Write-Output ("rootPid=" + $metrics.metrics.processMemory.rootPid)
Write-Output ("baselineBytes=" + $metrics.metrics.processMemory.baselineBytes)
Write-Output ("afterBytes=" + $metrics.metrics.processMemory.afterBytes)
Write-Output ("tabCount=" + $TabCount)
Write-Output ("popoutCount=" + $PopoutCount)
if (-not $snapshotComplete) { exit 1 }
if ($null -ne $closedEnvelope -and -not $lifecycleSnapshotComplete) { exit 1 }
exit 0

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateRange(1, [int]::MaxValue)]
    [int]$ProcessId,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$ExpectedStartTimeUtc,

    [ValidateNotNullOrEmpty()]
    [string]$ExpectedProcessName = "quota-float",

    [switch]$ConfirmIsolatedE2EProcess,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$JsonPath,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$CsvPath,

    [ValidateRange(5, 600)]
    [int]$DurationSeconds = 45,

    [ValidateRange(0.25, 60)]
    [double]$SampleIntervalSeconds = 1,

    [ValidateSet("idle", "refresh", "multi-window", "custom")]
    [string]$Scenario = "idle",

    [ValidateLength(0, 200)]
    [string]$ScenarioNote = "",

    [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-MeasurementOutputPath {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Extension
    )

    $resolved = [System.IO.Path]::GetFullPath($Path)
    if ($resolved.StartsWith("\\", [System.StringComparison]::Ordinal)) {
        throw "Measurement output must be a local filesystem path."
    }
    if ([System.IO.Path]::GetExtension($resolved) -ine $Extension) {
        throw "Measurement output '$resolved' must use the $Extension extension."
    }
    $parent = [System.IO.Path]::GetDirectoryName($resolved)
    if ([string]::IsNullOrWhiteSpace($parent) -or -not [System.IO.Directory]::Exists($parent)) {
        throw "Measurement output directory must already exist: '$parent'."
    }
    return $resolved
}

function Get-TargetProcessSample {
    param(
        [Parameter(Mandatory = $true)][int]$Id,
        [Parameter(Mandatory = $true)][long]$StartTimeUtcTicks
    )

    $process = Get-Process -Id $Id -ErrorAction Stop
    $process.Refresh()
    if ($process.HasExited) {
        throw "Target process exited."
    }
    $startTimeUtc = $process.StartTime.ToUniversalTime()
    if ($startTimeUtc.Ticks -ne $StartTimeUtcTicks) {
        throw "Target PID was reused by a different process."
    }

    $workingSetBytes = $null
    $privateBytes = $null
    $cpuSeconds = $null
    try { $workingSetBytes = [long]$process.WorkingSet64 } catch { }
    try { $privateBytes = [long]$process.PrivateMemorySize64 } catch { }
    try { $cpuSeconds = [double]$process.TotalProcessorTime.TotalSeconds } catch { }

    return [pscustomobject]@{
        timestampUtc = [DateTimeOffset]::UtcNow.ToString("o")
        processStartTimeUtc = $startTimeUtc.ToString("o")
        cpuSeconds = $cpuSeconds
        workingSetBytes = $workingSetBytes
        privateBytes = $privateBytes
    }
}

if ($SampleIntervalSeconds -gt $DurationSeconds) {
    throw "SampleIntervalSeconds cannot exceed DurationSeconds."
}
if (-not $ConfirmIsolatedE2EProcess) {
    throw "Pass -ConfirmIsolatedE2EProcess only after verifying the PID belongs to the isolated E2E app."
}

$jsonOutputPath = Resolve-MeasurementOutputPath -Path $JsonPath -Extension ".json"
$csvOutputPath = Resolve-MeasurementOutputPath -Path $CsvPath -Extension ".csv"
if ($jsonOutputPath -ieq $csvOutputPath) {
    throw "JsonPath and CsvPath must be different files."
}
if (-not $Force -and ([System.IO.File]::Exists($jsonOutputPath) -or [System.IO.File]::Exists($csvOutputPath))) {
    throw "An output file already exists. Pass -Force to overwrite both requested outputs."
}

$parsedExpectedStart = [DateTimeOffset]::MinValue
if (-not [DateTimeOffset]::TryParse(
    $ExpectedStartTimeUtc,
    [System.Globalization.CultureInfo]::InvariantCulture,
    [System.Globalization.DateTimeStyles]::AssumeUniversal,
    [ref]$parsedExpectedStart
)) {
    throw "ExpectedStartTimeUtc must be an ISO-8601 timestamp."
}
$expectedStartUtc = $parsedExpectedStart.ToUniversalTime()

try {
    $initialProcess = Get-Process -Id $ProcessId -ErrorAction Stop
    $initialProcess.Refresh()
    if ($initialProcess.HasExited) { throw "Target process exited." }
    $initialStartUtc = $initialProcess.StartTime.ToUniversalTime()
} catch {
    throw "Target PID $ProcessId is not an accessible running process."
}

$normalizedExpectedName = [System.IO.Path]::GetFileNameWithoutExtension($ExpectedProcessName)
if ($initialProcess.ProcessName -ine $normalizedExpectedName) {
    throw "Target PID $ProcessId is '$($initialProcess.ProcessName)', not expected process '$normalizedExpectedName'."
}
if ($initialStartUtc.Ticks -ne $expectedStartUtc.UtcDateTime.Ticks) {
    throw "Target PID $ProcessId start time does not match ExpectedStartTimeUtc; refuse possible PID reuse."
}

$logicalProcessorCount = [Environment]::ProcessorCount
$samples = [System.Collections.Generic.List[object]]::new()
$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
$initial = Get-TargetProcessSample -Id $ProcessId -StartTimeUtcTicks $initialStartUtc.Ticks
$samples.Add([pscustomobject]@{
    timestampUtc = $initial.timestampUtc
    elapsedSeconds = 0.0
    processId = $ProcessId
    processStartTimeUtc = $initial.processStartTimeUtc
    cpuMeasurementStatus = "baseline-no-delta"
    cpuDeltaSeconds = $null
    wallDeltaSeconds = $null
    cpuPercentSingleCoreEquivalent = $null
    cpuPercentNormalizedHostCapacity = $null
    workingSetBytes = $initial.workingSetBytes
    privateBytes = $initial.privateBytes
    memoryMeasurementStatus = if ($null -ne $initial.workingSetBytes -and $null -ne $initial.privateBytes) { "measured" } else { "partially-unavailable" }
})

$previousElapsed = 0.0
$previousCpuSeconds = $initial.cpuSeconds
$captureStatus = "completed"
$captureError = $null
$sampleSlots = [int][Math]::Ceiling($DurationSeconds / $SampleIntervalSeconds)

for ($slot = 1; $slot -le $sampleSlots; $slot += 1) {
    $targetElapsed = [Math]::Min($DurationSeconds, $slot * $SampleIntervalSeconds)
    $remainingMilliseconds = [int][Math]::Ceiling(($targetElapsed - $stopwatch.Elapsed.TotalSeconds) * 1000)
    if ($remainingMilliseconds -gt 0) {
        Start-Sleep -Milliseconds $remainingMilliseconds
    }

    try {
        $current = Get-TargetProcessSample -Id $ProcessId -StartTimeUtcTicks $initialStartUtc.Ticks
    } catch {
        $captureStatus = "target-unavailable-before-deadline"
        $captureError = "The target exited, became inaccessible, or its PID was reused."
        break
    }

    $elapsed = $stopwatch.Elapsed.TotalSeconds
    $wallDelta = $elapsed - $previousElapsed
    $cpuDelta = if ($null -ne $current.cpuSeconds -and $null -ne $previousCpuSeconds) {
        [Math]::Max(0.0, $current.cpuSeconds - $previousCpuSeconds)
    } else {
        $null
    }
    $singleCorePercent = if ($null -ne $cpuDelta -and $wallDelta -gt 0) { 100.0 * $cpuDelta / $wallDelta } else { $null }
    $normalizedPercent = if ($null -ne $singleCorePercent) { $singleCorePercent / $logicalProcessorCount } else { $null }

    $samples.Add([pscustomobject]@{
        timestampUtc = $current.timestampUtc
        elapsedSeconds = [Math]::Round($elapsed, 6)
        processId = $ProcessId
        processStartTimeUtc = $current.processStartTimeUtc
        cpuMeasurementStatus = if ($null -ne $cpuDelta) { "measured" } else { "unavailable" }
        cpuDeltaSeconds = if ($null -ne $cpuDelta) { [Math]::Round($cpuDelta, 6) } else { $null }
        wallDeltaSeconds = [Math]::Round($wallDelta, 6)
        cpuPercentSingleCoreEquivalent = if ($null -ne $singleCorePercent) { [Math]::Round($singleCorePercent, 3) } else { $null }
        cpuPercentNormalizedHostCapacity = if ($null -ne $normalizedPercent) { [Math]::Round($normalizedPercent, 3) } else { $null }
        workingSetBytes = $current.workingSetBytes
        privateBytes = $current.privateBytes
        memoryMeasurementStatus = if ($null -ne $current.workingSetBytes -and $null -ne $current.privateBytes) { "measured" } else { "partially-unavailable" }
    })

    $previousElapsed = $elapsed
    $previousCpuSeconds = $current.cpuSeconds
}

$stopwatch.Stop()
$captureEndedUtc = [DateTimeOffset]::UtcNow
$report = [ordered]@{
    schemaVersion = 1
    measurementScope = "Single identified process only; excludes WebView2, GPU, and other child processes. Not total application resource use."
    captureStatus = $captureStatus
    captureError = $captureError
    scenario = [ordered]@{ name = $Scenario; note = $ScenarioNote }
    target = [ordered]@{
        processId = $ProcessId
        processName = $initialProcess.ProcessName
        processStartTimeUtc = $initialStartUtc.ToString("o")
    }
    capture = [ordered]@{
        requestedDurationSeconds = $DurationSeconds
        sampleIntervalSeconds = $SampleIntervalSeconds
        actualDurationSeconds = [Math]::Round($stopwatch.Elapsed.TotalSeconds, 6)
        captureStartedAtUtc = $initial.timestampUtc
        captureEndedAtUtc = $captureEndedUtc.ToString("o")
        logicalProcessorCount = $logicalProcessorCount
        cpuSingleCoreEquivalentDefinition = "100 * process CPU-time delta / wall-time delta; may exceed 100 when multiple logical processors are used."
        cpuNormalizedHostCapacityDefinition = "single-core-equivalent percent / logicalProcessorCount; percentage of total host logical-processor capacity."
        sampleCount = $samples.Count
    }
    unavailableMetrics = @(
        [ordered]@{ name = "startupDuration"; status = "not-measured"; reason = "The tool attaches to an already-running process and cannot reconstruct startup timing." },
        [ordered]@{ name = "diskIoBytes"; status = "not-measured"; reason = "No portable, process-scoped disk-I/O counter is collected by this script." }
    )
    samples = $samples
}

$samples | Export-Csv -LiteralPath $csvOutputPath -NoTypeInformation -Encoding UTF8
$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $jsonOutputPath -Encoding UTF8

if ($captureStatus -ne "completed") {
    throw "Capture stopped before the requested deadline; partial samples were written with captureStatus '$captureStatus'."
}

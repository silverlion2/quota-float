# Native desktop process measurement

`scripts/measure-desktop-process.ps1` attaches to one explicitly identified, already-running isolated E2E process. It never launches, installs, refreshes, or stops an application, and it does not read Quota Float configuration, provider data, or credentials. It writes only the requested local JSON and CSV files; their parent directories must already exist.

Use the PID and UTC start time recorded for the isolated E2E process:

```powershell
./scripts/measure-desktop-process.ps1 `
  -ProcessId 12345 `
  -ExpectedStartTimeUtc "2026-09-08T02:15:30.1234567Z" `
  -ExpectedProcessName "quota-float" `
  -ConfirmIsolatedE2EProcess `
  -Scenario idle `
  -DurationSeconds 45 `
  -SampleIntervalSeconds 1 `
  -JsonPath "$env:TEMP/quota-float-idle.json" `
  -CsvPath "$env:TEMP/quota-float-idle.csv"
```

Pass `-ConfirmIsolatedE2EProcess` only after confirming that the PID belongs to the synthetic-data E2E app, never an installed or production instance. The start time is checked before capture and on every sample to reject PID reuse. Existing outputs are preserved unless `-Force` is explicit. Duration is limited to 5–600 seconds, the interval to 0.25–60 seconds, and the loop uses a finite sample count. Keep `-ScenarioNote` free of credentials, account details, and local paths.

## Fixed scenarios

Use the same E2E binary, machine power state, display configuration, duration, interval, and synthetic fixture for comparisons:

- `idle`: prepare the main widget in the agreed layout, make no input during the capture, and use 45 seconds by default.
- `refresh`: use 60 seconds; record the exact fixed manual refresh offset in `-ScenarioNote` and perform only that action while capture is running.
- `multi-window`: open the agreed number and regions of detached synthetic-data windows before capture, record them in `-ScenarioNote`, then leave the UI idle for 45 seconds.

The scenario fields are labels, not claims that the script verified UI state. JSON contains timestamps, process start time, CPU-time/wall-time deltas, working set, private bytes, logical processor count, status, and definitions. `cpuPercentSingleCoreEquivalent` is `100 × CPU delta / wall delta` and can exceed 100%; `cpuPercentNormalizedHostCapacity` divides that value by the host logical processor count.

The initial row is explicitly `baseline-no-delta`. Unavailable CPU or memory values are null with a status. Startup duration and process disk I/O are always reported as `not-measured`: attachment cannot reconstruct startup, and this script deliberately does not substitute unreliable disk counters.

These counters cover only the identified PID. A Tauri application also uses WebView2 renderer/GPU processes on Windows; they are excluded here. Do not report the Rust host's working set or CPU as total application use. A full application budget needs a separately identified process tree and repeatable native measurements.

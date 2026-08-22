# v0.3.0 QA Report

Date: 2026-08-22  
Candidate: `59e71e65689f9b9a495fbe1438b76a9a98da82c8` on `main` before the version-only release commit

## Result

Automated release gates pass. No critical or high-severity product defect remains open in the tested scope.

| Gate | Result |
| --- | --- |
| Frontend/unit/component/release tests | 165 passed across 22 files |
| Rust unit tests | 58 passed; 0 failed |
| Native compiled-app E2E | 3 passed; real Windows Tauri process and Edge WebView |
| Production build | Passed |
| Bundle budgets | Entry JS 360,418 B; total JS 505,496 B; gzip JS 153,465 B; CSS 132,653 B — all under limits |
| Rust formatting/check/strict Clippy | Passed |
| npm advisory audit | 0 vulnerabilities |
| RustSec vulnerability audit | 0 vulnerabilities; 18 allowed transitive warnings reviewed |
| Release readiness audit | Tauri stack recognized, version sources synchronized, workflows and guarded release CLI present |
| Guarded `0.3.0` dry run | Passed from clean `main` after fetching `origin/main` |

## Coverage

- Provider registry ordering, finite time budgets, targeted transient retry, and per-adapter synthetic parsers.
- Claude credential extraction and utilization-to-remaining conversion without real credentials.
- Preference migrations, provider ordering, activity/history, exports, quota pace, alerts, update logic, dialogs, accessibility, and release automation.
- Compiled desktop bridge availability, expansion, Control Center open/close, and updater-dialog behavior.
- Production code splitting and hard bundle ceilings.
- Windows/macOS provider fixture CI definition and release artifact/signing gates.

## Observations

The WebdriverIO service emits a diagnostic that `tauri-driver` is not globally installed and a cleanup warning after the session closes. The service successfully uses the configured driver path, all three assertions pass, and the command exits zero. A sandboxed first attempt could not download the newly matching Edge driver; the approved network-enabled rerun downloaded it and passed.

## Remaining platform smoke responsibilities

Automation does not replace the documented Windows 100/125/150% multi-monitor visual matrix, real provider-login checks, or real Intel/Apple-silicon macOS transparency, menu-bar, Gatekeeper, and update checks. The tag-triggered release workflow builds the exact `0.3.0` Windows and macOS packages, scans Windows artifacts with Defender, verifies the complete updater asset set, and runs the previous-to-current Windows upgrade smoke before handoff is considered complete.

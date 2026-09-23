# Release cache follow-up — 2026-09-23

## Baseline

The successful [v0.3.22 release run](https://github.com/silverlion2/quota-float/actions/runs/35869569014) took **15m 35s** from the first job starting to the final job completing (13:47:47–14:03:22 UTC). GitHub job/step timestamps give this breakdown:

| Stage | Duration |
| --- | ---: |
| Linux verification | 2m 15s |
| Windows job | 11m 25s |
| Windows native tests + strict Clippy, within that job | 7m 03s |
| Windows build/upload, within that job | 2m 27s |
| macOS job, parallel with Windows | 7m 48s |
| macOS native tests + strict Clippy, within that job | 3m 45s |
| Windows lifecycle smoke | 1m 11s |

The native tests and Clippy were added to release builders in v0.3.22. Keeping the earlier packaging-only cache namespace can restore dependencies without the debug/check artifacts needed by those new commands.

The run logs confirm both builders restored exact `publish-draft` cache keys created on September 14, before the September 23 native gates were added. Windows restored `v0-rust-publish-draft-Windows_NT-x64-2113753f-778daec0` (551.9 MB), and macOS restored `v0-rust-publish-draft-Darwin-arm64-2eab217e-778daec0` (816.2 MB). Both post actions reported `Cache up-to-date.` despite compiling the newly required debug/check dependencies, so the old exact keys were not updated.

## Change

CI's desktop job and both release builders now use `shared-key: desktop-native-v1`. CI already executes native tests, Clippy and packaging, so a successful main run can warm dependencies for the release. The new generation also prevents an exact hit on the older packaging-only cache from suppressing a save of the newly compiled dependencies. Future additions of Cargo profiles or features should consider bumping this generation in all three locations together.

Only main saves this shared cache. Pull requests and externally pushed tags can restore it but cannot populate it. The cache action retains its automatic OS, toolchain, environment and dependency keys. Workspace crates are not enabled for caching. Cargo still checks its fingerprints, compiles the versioned application, and executes every test and warning gate; cached dependency bytes are never treated as release verification evidence. See the [cache action's documented shared keys and dependency caching](https://github.com/Swatinem/rust-cache).

Linux verification, both platform tests/Clippy, native CI UI smoke, Defender, optional OS signing checks, updater signatures, unique draft identity, upgrade/rollback/uninstall, cancellation guards and public asset verification remain required as before. Windows/macOS builds and public downloads were already parallel; they remain so.

## Verification and limits

The workflow regression verifies the shared namespace, main-only writes, dependency-only caching, and unconditional native tests/Clippy. No application version, tag or public release is needed for this workflow-only change.

Local validation passed: 424 frontend/workflow tests in 51 files, 123 Rust tests (one existing opt-in test ignored), production build and unchanged bundle budgets, Rust fmt/check/strict all-target Clippy, version sync and diff checks. Actionlint 1.7.12 accepted both workflows (ShellCheck integration disabled because it is unavailable locally); release shell bodies were unchanged.

The first run must warm the new cache. There is no measured new release duration yet: compare subsequent release reports against the baseline above, including cache restore/save time. Do not report all seven minutes of the Windows native gate as saved, since application compilation, test execution and linting remain.

## Second simplification: seven jobs

The manifest assembly and post-publication distribution checks now run as steps in `finalize`, reducing the workflow from nine jobs to seven. One runner checks out the exact release commit, assembles the updater manifest, verifies the gated assets and publishes, then performs the same non-blocking public distribution check. Native builders, Windows upgrade overlap, environment approval and cancellation guards stay intact.

The assembly and publication steps use default success conditions with no `continue-on-error`; either failure stops the following publication path. Only the already-public distribution check retains its previous non-blocking behavior. This removes two runner allocations, not two verification gates. Assembly now waits for the required upgrade smoke as well as both platform builds; therefore net time savings depend on runner queue time and must be measured, not assumed.

The local publishing helper accepts either a successful legacy `assemble-updater` job or the new successful assembly step. Missing, skipped, failed or cancelled assembly evidence still rejects verification, and old run recovery stays compatible.

Second-pass validation: 425 frontend/workflow tests, 123 Rust tests with one existing opt-in test ignored, production build/budgets, fmt/check/Clippy and version checks passed. Actionlint accepted the seven-job workflow. The three moved JavaScript step bodies match the previous revision exactly; regression coverage checks ordering, failure blocking, exact checkout and legacy/new run evidence. This reorganization has not yet been exercised in a new public release.

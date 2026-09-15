# Quota Float v0.3.16 — reset evidence and consumption planning

Published Stable, non-draft: [v0.3.16](https://github.com/silverlion2/quota-float/releases/tag/v0.3.16).

- Application commit: `1df07464ef5508cc32800fa8d0cd43ea74b43b8e`.
- Release commit and dereferenced tag: `843c5f3b6fef2684487c9f920e1e0fcb185a3193`.
- [Source CI](https://github.com/silverlion2/quota-float/actions/runs/34986807665): success on the exact application commit, including Windows and macOS builds.
- [Release workflow](https://github.com/silverlion2/quota-float/actions/runs/34986942471): success; verification, ref creation, both draft builds, upgrade smoke, finalization and public distribution all passed.

## What changed

Public reset trackers now expose their last-reset history, missing baselines, conflicting scores and excluded obsolete sources. The consumption plan separately calculates the weekly percentage points/hour needed until the provider's personal reset and compares it with recent continuous local quota consumption. It shows projected unused quota or exhaustion before reset when enough valid history is available.

See [implementation, live source findings and precision limits](RESET-PREDICTION-2026-09-15.md). Two bounded `gpt-5.6-luna` subagents handled backend/helper work and review; the main agent integrated, tested and published. No historical ground-truth backtest of the new policy was completed, so no calibrated reset probability or measured accuracy improvement is claimed.

## Validation

- Local frontend: 334 tests / 43 files passed; 58 affected components passed after the minute-clock correction.
- Local Windows Rust: 108 full-suite tests passed, then 14 final forecast regressions passed. Exact-source Windows CI subsequently passed all 109 Rust tests; macOS passed its 98 platform-applicable tests.
- Final production build, bundle budget, fmt, cargo check, strict all-targets Clippy, version and diff checks passed. JS 578,776 B / gzip 181,402 B; CSS 152,595 B. Existing budgets were preserved.
- Native Windows: 11 E2E tests passed locally and on source CI, including the new plan, bounded scrolling, provider/settings interactions, detached windows and updates. The existing standalone-driver diagnostic and mock cleanup warning did not fail the embedded-driver run.
- Linux frontend CI: 333 tests passed, one Windows PowerShell test skipped; that test passed locally on Windows. Platform-conditioned steps are not counted as executed on the other OS.

## Exact public artifact checks

The Windows executable and installer passed the release Defender scan. While still a draft, installer asset **565951640** passed v0.3.15 → v0.3.16 installation/upgrade, launch, rollback to v0.3.15, reinstall and uninstall. Before and after publication, the pipeline checked that the public installer was the same tested asset and digest.

All six public assets were downloaded independently. Their SHA-256 digests matched the Release API. `latest.json` version, URLs and signature text matched the distributed platform artifacts. Both updater signatures verified against the application's embedded public key; altered in-memory copies were rejected.

| Public asset | SHA-256 |
| --- | --- |
| latest.json | d7852fa08033a74789e47ff30c99c777b69cb634ad68efc9a8d73a2b61995125 |
| Quota.Float_0.3.16_universal.dmg | f2310854b2ff640bd59c7c7f432a5a236509e49c8f5c8668bfa47be2332d0eaa |
| Quota.Float_0.3.16_x64-setup.exe | 2ae68d087b3d11f15eb452d165726c5b1519b06fbca010d3f81f1d98f2a0a25f |
| Quota.Float_0.3.16_x64-setup.exe.sig | b1cce69dfe9815c798a06d3575d233f3c91c392b5efec4b029ff6a88536b877d |
| Quota.Float_universal.app.tar.gz | d44f98759911bc4983cfb5bce34e41a865c1209eb0893fa531e4822843604f65 |
| Quota.Float_universal.app.tar.gz.sig | 9c0273ce12c1d2afad720086438fba88ace8b350254c9a9f9852ef21bfabc3f7 |

At independent artifact verification, HEAD, origin/main, dereferenced tag and public Release target all equaled `843c5f3b6fef2684487c9f920e1e0fcb185a3193`. Only six version/Changelog files differ from the tested application commit. This subsequent release-record commit changes documentation only; it does not move the tag or replace published binaries.

## Remaining limits

Windows Authenticode, macOS Developer ID and notarization are not configured. Tauri updater integrity signatures are verified separately. Physical multi-monitor/DPI combinations and real Mac UI were not tested by this work. The pipeline's github-script Node 20 deprecation notice did not prevent successful execution under the runner's enforced Node 24 runtime.

Release/source JSON, logs, downloaded assets and independent verification tools are retained locally under `output/review-reset-2026-09-15`. Initial GitHub API EOF errors were retried without duplicate workflow creation. No provider credentials or raw private provider responses are included in the records.

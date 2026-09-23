# Quota Float v0.3.22 — stable details and desktop readability

Published Stable, non-draft: [v0.3.22](https://github.com/silverlion2/quota-float/releases/tag/v0.3.22).

- UI source commit: `0060cf6507dd811133cbd747a828ebb4bd732044`.
- Release gate and fixture fixes: `8861bffc3a4184255e447483072165a0a1f34ecd`.
- Release commit and tag: `428e89d76cf2237cd31e143bf10d431fd995d3ae`.
- [Source CI](https://github.com/silverlion2/quota-float/actions/runs/35869483735) and [provider compatibility](https://github.com/silverlion2/quota-float/actions/runs/35869483757): success.
- [Release workflow](https://github.com/silverlion2/quota-float/actions/runs/35869569014): all nine jobs succeeded.

## Changes and evidence

The edge bar's details panel now waits for native expansion before measuring and widens before remeasuring height. Request identity prevents a late result from an earlier open-close-open sequence from unlocking a newer request. Windows updates position and size together and rejects expanded-size requests after collapse.

Expanded views have larger text and controls, clearer secondary colors, two-line provider labels, consistent drag handles, and a stable scrolling Insights panel. Settings survive pointer leave; keyboard focus holds the panel open without latching ordinary mouse clicks.

The old native executable reproduced an erroneous 588px peak followed by a 370px final height. With the revised content, all nine Top/Left/Right openings reached a 434px peak and final height with no oversized-then-shrink phase. Full reproduction, screenshots, and limits are in [the detail expansion audit](DETAILS-UX-2026-09-23.md).

## Validation

- Local frontend and workflow tests: 423 passed; Windows Rust: 123 passed, one opt-in real-account probe ignored. Build, unchanged bundle budgets, format/check, strict all-target Clippy, version consistency and diff checks passed.
- Source CI: frontend 420 passed / three platform-specific tests skipped; Windows Rust 123 passed / one ignored; macOS Rust 112 passed / one ignored. Windows native E2E: 13 passed. macOS native UI E2E remains OS-skipped.
- Both release builders passed their own native tests and strict Clippy before packaging. The exact Windows executable and installer passed the Defender gate.
- The draft candidate passed install, launch, previous-public-to-candidate upgrade, rollback, reinstall and uninstall. Finalization and public distribution checked the tested installer identity.
- All six public assets matched their Release API SHA-256. The update manifest and both updater signatures passed independent verification using the release commit's public key.
- Bundle sizes: 590,705 B JavaScript, 183,775 B gzip JavaScript, 153,300 B CSS; no budget was increased.

## Public assets

| Asset | SHA-256 |
| --- | --- |
| latest.json | a2998506c5f064a06ee4572a36cab5ae75bdd13c20c836168475fabbf7fc9e7b |
| Quota.Float_0.3.22_x64-setup.exe | 065a7ef7ac8f3a210a7c1ba5d989f83b65ce203fc4038f6db027b56f62534100 |
| Quota.Float_0.3.22_x64-setup.exe.sig | 64ea0bf6c48464edf7b799afc57984087b61b765939ee204a55fd667b55571b0 |
| Quota.Float_0.3.22_universal.dmg | 6defaba0dad62e1bcfdd75ac72efbc94bf116b543fc66f729c98990280290d97 |
| Quota.Float_universal.app.tar.gz | 77639f6002dc2c1109a193dcba116df9304235cbebafcd08a79945668116b2bb |
| Quota.Float_universal.app.tar.gz.sig | 9617b4975edcd5f817a7a029b8ccb3ebc7a944fc751becfa6223bbd41e7d289d |

## Release follow-up and limits

v0.3.21 became public despite a cancellation request because its continuation jobs used `always()` without a cancellation guard. Its workflow conclusion is canceled, so it is not recorded as a successful overall gate. v0.3.22 supersedes it, adds cancellation guards throughout the chain and platform-native tests before upload, and fixes the Rust 1.98 test lint plus parallel macOS fixture isolation. Static workflow contracts cover the new guards; this task did not deliberately cancel another public release to test them.

The downloaded Windows installer is Authenticode `NotSigned`; updater integrity signatures are separate and verified. Physical-pointer/mixed-DPI/multi-monitor and real macOS UI acceptance are not covered by the automated Windows results. The user's installed production application was not replaced during this task.

At verification on 2026-09-23 14:04 UTC, main, tag and Release target matched the release commit. This subsequent documentation commit does not move the tag or replace binaries. Raw evidence and downloaded public artifacts are under ignored `output/release-runs/35869569014*`.

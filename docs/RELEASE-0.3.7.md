# Quota Float v0.3.7 Release Record

Date: 2026-09-05

## Publication

- Version: `0.3.7`
- Feature commits: `4b30bfb` (`feat: add billing-cycle value guidance and quota history`) and `697a28e` (`feat: add complete usage history`)
- Release commit: `13d0836054093743b4f34e065214769b5e3f94c2` (`release: v0.3.7`)
- Branch and tag: `main`, `v0.3.7`
- Published: 2026-09-05 14:28 UTC / 2026-09-05 22:28 Asia/Shanghai
- GitHub Release: <https://github.com/silverlion2/quota-float/releases/tag/v0.3.7>
- Release workflow: <https://github.com/silverlion2/quota-float/actions/runs/33971616121>
- Release state: public, non-draft, non-prerelease

## Delivered scope

- Added billing-cycle value guidance and longer-lived quota history for evaluating Codex plan upgrades.
- Added a complete-history range to Codex usage insights while keeping the default curve at 24 hours.
- Indexed every retained local Codex session metadata file, exposed the earliest available coverage date, and grouped the complete Token history by month.
- Kept recorded quota history for the lifetime of the local installation: the latest 90 days retain full samples and older days retain endpoints and extrema through bounded daily compaction.
- Kept every recorded quota point available to pointer and keyboard inspection while bounding the number of SVG samples rendered for long histories.
- Preserved the local-first privacy boundary: prompt and response content is not parsed or stored, and provider access remains read-only inside `src-tauri`.

## Verification evidence

- The complete local desktop gate passed 212 frontend tests across 29 files, the production frontend build, bundle-budget and version checks, 72 Rust tests, Rust formatting, `cargo check`, strict Clippy, and `git diff --check`.
- The release helper dry run repeated the frontend tests, production build, and Rust tests before reporting `v0.3.7` ready.
- The formal Release workflow completed successfully: `verify`, Windows publish, macOS Universal publish, `finalize`, and stable `upgrade-smoke` all passed.
- Microsoft Defender accepted the exact Windows executable and NSIS installer uploaded to the Release.
- `finalize` verified all six required updater assets before changing the Release from draft to public.
- The previous-to-current per-user Windows `v0.3.6 -> v0.3.7` upgrade smoke passed.
- The tag-triggered workflow correctly skipped `create-release-ref` because the annotated release tag already existed.
- At publication, local `main`, `origin/main`, the release commit, and `v0.3.7` all aligned at `13d0836054093743b4f34e065214769b5e3f94c2` before this evidence record was added.

## Published artifacts

| Artifact | Bytes | SHA-256 | Purpose |
| --- | ---: | --- | --- |
| [`latest.json`](https://github.com/silverlion2/quota-float/releases/download/v0.3.7/latest.json) | 4,121 | `c10b4a933fb4bfc79de6a32cac83333834216448a4069dd9d0185161471ea563` | Stable updater manifest |
| [`Quota.Float_0.3.7_x64-setup.exe`](https://github.com/silverlion2/quota-float/releases/download/v0.3.7/Quota.Float_0.3.7_x64-setup.exe) | 4,607,151 | `88b1ce7e84ad8654bbef039bc17545dab0129c2b61b97e12a653c3c49b79ce82` | Windows x64 NSIS installer/updater |
| [`Quota.Float_0.3.7_x64-setup.exe.sig`](https://github.com/silverlion2/quota-float/releases/download/v0.3.7/Quota.Float_0.3.7_x64-setup.exe.sig) | 424 | `066d4211fe75d6ed21f65877adc1e71b34585526ae8c436bd82a766c03c2d76e` | Tauri updater signature for Windows |
| [`Quota.Float_0.3.7_universal.dmg`](https://github.com/silverlion2/quota-float/releases/download/v0.3.7/Quota.Float_0.3.7_universal.dmg) | 11,706,151 | `3562d49a5ae2bb8c27f11ec92e7a45ec90d60d48a94120e764d96f0eac943e22` | Universal macOS disk image |
| [`Quota.Float_universal.app.tar.gz`](https://github.com/silverlion2/quota-float/releases/download/v0.3.7/Quota.Float_universal.app.tar.gz) | 11,974,993 | `43d92ff6b68f64e95355c4675d295de272313fdb24d2e8f3642a457e83538c59` | Universal macOS updater archive |
| [`Quota.Float_universal.app.tar.gz.sig`](https://github.com/silverlion2/quota-float/releases/download/v0.3.7/Quota.Float_universal.app.tar.gz.sig) | 412 | `df5cb338ae34919f59a9bc65b8908a98ece09d8e7cffeaaf9b02c24c6af0329d` | Tauri updater signature for macOS |

## Signing and remaining manual validation

Tauri updater signatures were generated for Windows and macOS. Windows Authenticode, macOS Developer ID signing, and macOS notarization are not configured, so SmartScreen or Gatekeeper may still warn. Defender accepted both unsigned Windows release artifacts. The annotated Git tag is not GPG-signed.

Automation does not replace the documented Windows multi-monitor/DPI matrix, real-provider login checks, or real Intel/Apple-silicon macOS installation and visual/runtime validation. The Release workflow emitted non-blocking notices that its unchanged `actions/checkout@v4`, `actions/setup-node@v4`, and `actions/github-script@v7` declarations target Node.js 20 and are being forced to Node.js 24 by hosted runners.

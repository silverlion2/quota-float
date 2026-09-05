# Quota Float v0.3.8 Release Record

Date: 2026-09-06

## Publication

- Version: `0.3.8`
- Feature commit: `86ce2f2` (`fix: compact lifetime history during startup`)
- Release commit: `bb33f023d917de89aef28d8d2e0035dbd5b1d7c9` (`release: v0.3.8`)
- Branch and tag: `main`, `v0.3.8`
- Published: 2026-09-05 16:55 UTC / 2026-09-06 00:55 Asia/Shanghai
- GitHub Release: <https://github.com/silverlion2/quota-float/releases/tag/v0.3.8>
- Release workflow: <https://github.com/silverlion2/quota-float/actions/runs/33978969819>
- Release state: public, non-draft, non-prerelease

## Delivered scope

- Compacts retained quota history during startup normalization before applying the explicit safety cap, preventing a large legacy history from losing its earliest useful daily samples before the next refresh.
- Preserves each older provider-day's first, last, minimum, and maximum quota points while retaining full samples for the latest 90 days.
- Synchronizes the English and Chinese README, architecture, project summary, and test matrix with lifetime quota retention, complete retained Codex metadata history, and the `v0.3.7` release baseline.
- Preserves the local-first privacy boundary: prompt and response content is not parsed or stored, and provider access remains read-only inside `src-tauri`.

## Verification evidence

- The complete local desktop gate passed 212 frontend tests across 29 files, the production frontend build, bundle-budget and version checks, 72 Rust tests, Rust formatting, `cargo check`, strict Clippy, and `git diff --check`.
- The release helper dry run repeated the frontend tests, production build, and Rust tests before reporting `v0.3.8` ready.
- The formal Release workflow completed successfully: `verify`, Windows publish, macOS Universal publish, `finalize`, and stable `upgrade-smoke` all passed.
- Microsoft Defender accepted the exact Windows executable and NSIS installer uploaded to the Release.
- `finalize` verified all six required updater assets before changing the Release from draft to public.
- The previous-to-current per-user Windows `v0.3.7 -> v0.3.8` upgrade smoke passed.
- The tag-triggered workflow correctly skipped `create-release-ref` because the annotated release tag already existed.
- At publication, local `main`, `origin/main`, the release commit, and `v0.3.8` all aligned at `bb33f023d917de89aef28d8d2e0035dbd5b1d7c9` before this evidence record was added.

## Published artifacts

| Artifact | Bytes | SHA-256 | Purpose |
| --- | ---: | --- | --- |
| [`latest.json`](https://github.com/silverlion2/quota-float/releases/download/v0.3.8/latest.json) | 4,121 | `08fbab3b5a5907b4feec4420782870aa5ffe3400c28d16a26f775711418a26c5` | Stable updater manifest |
| [`Quota.Float_0.3.8_x64-setup.exe`](https://github.com/silverlion2/quota-float/releases/download/v0.3.8/Quota.Float_0.3.8_x64-setup.exe) | 4,611,122 | `e546def780256cc2241da4f7987fe24c3d635e0d3bc42aa7ff7ab576a3f72ae2` | Windows x64 NSIS installer/updater |
| [`Quota.Float_0.3.8_x64-setup.exe.sig`](https://github.com/silverlion2/quota-float/releases/download/v0.3.8/Quota.Float_0.3.8_x64-setup.exe.sig) | 424 | `965976280d426bfbee387bdef640d5b3f16cbad252ff7387274bbdf072e57f6b` | Tauri updater signature for Windows |
| [`Quota.Float_0.3.8_universal.dmg`](https://github.com/silverlion2/quota-float/releases/download/v0.3.8/Quota.Float_0.3.8_universal.dmg) | 11,706,021 | `1f1eec6abc81b603f3fd231b8847dc8e6eabfe18368b5ab42485c80d4e655b3b` | Universal macOS disk image |
| [`Quota.Float_universal.app.tar.gz`](https://github.com/silverlion2/quota-float/releases/download/v0.3.8/Quota.Float_universal.app.tar.gz) | 11,975,039 | `ef6cac7fd172c44c879dbd945815c5078ab57dc18dd3a9f7d2058253039d9783` | Universal macOS updater archive |
| [`Quota.Float_universal.app.tar.gz.sig`](https://github.com/silverlion2/quota-float/releases/download/v0.3.8/Quota.Float_universal.app.tar.gz.sig) | 412 | `b7790099282c402a982d96dcc784d8176c13155d4af97cb237fd50cbe966ce57` | Tauri updater signature for macOS |

## Signing and remaining manual validation

Tauri updater signatures were generated for Windows and macOS. Windows Authenticode, macOS Developer ID signing, and macOS notarization are not configured, so SmartScreen or Gatekeeper may still warn. Defender accepted both unsigned Windows release artifacts. The annotated Git tag is not GPG-signed.

Automation does not replace the documented Windows multi-monitor/DPI matrix, real-provider login checks, or real Intel/Apple-silicon macOS installation and visual/runtime validation. The Release workflow emitted non-blocking notices that its unchanged `actions/checkout@v4`, `actions/setup-node@v4`, and `actions/github-script@v7` declarations target Node.js 20 and are being forced to Node.js 24 by hosted runners.

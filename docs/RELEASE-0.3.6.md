# Quota Float v0.3.6 Release Record

Date: 2026-09-04

## Publication

- Version: `0.3.6`
- Security remediation commit: `f78c15eee4a2c67eb27c837098806dc29d7aedd2` (`fix: repair dependency security workflow`)
- Release commit: `10ea185638e8049b425834667cb16fa55a2887e1` (`release: v0.3.6`)
- Branch and tag: `main`, `v0.3.6`
- Published: 2026-09-04 15:29 UTC / 2026-09-04 23:29 Asia/Shanghai
- GitHub Release: <https://github.com/silverlion2/quota-float/releases/tag/v0.3.6>
- Cloud dry run: <https://github.com/silverlion2/quota-float/actions/runs/33887422871>
- Release workflow: <https://github.com/silverlion2/quota-float/actions/runs/33887869016>
- Release state: public, non-draft, non-prerelease

## Delivered scope

- Replaced the legacy `rustsec/audit-check` wrapper with a direct, pinned `cargo-audit 0.22.2` invocation against `src-tauri/Cargo.lock`. The Security workflow no longer requests issue/check write permissions or passes a GitHub token to RustSec.
- Updated the Security workflow to the Node 24 action generation (`actions/checkout@v7`, `actions/setup-node@v7`, and `actions/dependency-review-action@v5`) and disabled checkout credential persistence in every job.
- Added a focused workflow-policy regression suite that preserves read-only permissions, all four trigger families, direct blocking RustSec semantics, supported action majors, and job-boundary isolation.
- Updated the compatible npm lock graph to `browserslist 4.28.9` and current companion metadata packages, clearing `GHSA-c83g-rgw3-j3cx` and `GHSA-73wf-gq98-2v4g` without changing `package.json`.
- Updated `chacha20 0.10.1 -> 0.10.2` and `event-listener 5.4.1 -> 5.4.2` in the Cargo lockfile, removing the yanked-package warning and `RUSTSEC-2026-0221` without changing `Cargo.toml`.

The local-first credential boundary is unchanged. Provider access remains read-only and inside `src-tauri`; the workflow remediation reduces GitHub job authority and does not add runtime provider access.

## Verification evidence

- The exact pre-release diff passed the focused Security workflow tests (5/5), YAML parsing, `git diff --check`, npm audit with zero vulnerabilities, and Cargo audit with zero vulnerabilities.
- The complete local desktop gate passed 198 frontend tests across 27 files, the production frontend build, bundle-budget and version checks, 69 Rust tests, Rust formatting, `cargo check`, and strict Clippy.
- A synthetic vulnerable Cargo lockfile produced a nonzero `cargo audit` status, confirming vulnerability results remain blocking.
- A complete Codex Security diff scan covered the workflow, policy test, npm lock update, and Cargo lock update with zero reportable findings.
- The cloud dry run completed its full `verify` job successfully before any release write occurred.
- The formal workflow's `verify`, release-ref creation, Windows publish, macOS Universal publish, `finalize`, and stable `upgrade-smoke` jobs all passed.
- Microsoft Defender accepted the exact Windows executable and NSIS installer uploaded to the Release.
- `finalize` verified all six required assets before changing the Release from draft to public; the previous-to-current per-user Windows `v0.3.5 -> v0.3.6` upgrade smoke then passed.
- The post-release version audit reports every authoritative source synchronized at `0.3.6`; `main`, the release commit, and `v0.3.6` aligned before this evidence record was added.

Cargo audit still reports 17 informational ecosystem warnings: the GTK3 and UNIC crates are unmaintained, and `glib 0.18.5` is covered by `RUSTSEC-2024-0429`. Removing them requires a broader Tauri/GTK dependency migration and Linux/platform validation rather than a safe lockfile-only patch.

## Published artifacts

| Artifact | Bytes | SHA-256 | Purpose |
| --- | ---: | --- | --- |
| [`latest.json`](https://github.com/silverlion2/quota-float/releases/download/v0.3.6/latest.json) | 4,121 | `461393a0575fee250d573d0cd1d3e5a6b2c4420e0b856b753da104b80900684f` | Stable updater manifest |
| [`Quota.Float_0.3.6_x64-setup.exe`](https://github.com/silverlion2/quota-float/releases/download/v0.3.6/Quota.Float_0.3.6_x64-setup.exe) | 4,599,466 | `9769199e716c9e7e2dcf9325f7edc8eef8ae1b6a36e8e78f5401aa5a71d51c68` | Windows x64 NSIS installer/updater |
| [`Quota.Float_0.3.6_x64-setup.exe.sig`](https://github.com/silverlion2/quota-float/releases/download/v0.3.6/Quota.Float_0.3.6_x64-setup.exe.sig) | 424 | `fa014e173746d0be5e67f6e9423747011c18f8887f01f29316eee78912a43d75` | Tauri updater signature for Windows |
| [`Quota.Float_0.3.6_universal.dmg`](https://github.com/silverlion2/quota-float/releases/download/v0.3.6/Quota.Float_0.3.6_universal.dmg) | 11,673,840 | `e0794d629c8dda1ff52f05564ee89606c8a81577b9ed611af2d3c3e7689b7a33` | Universal macOS disk image |
| [`Quota.Float_universal.app.tar.gz`](https://github.com/silverlion2/quota-float/releases/download/v0.3.6/Quota.Float_universal.app.tar.gz) | 11,949,077 | `4879987762e620a8b939452eb71df4105687b9db5ed422c2b952feee564ab668` | Universal macOS updater archive |
| [`Quota.Float_universal.app.tar.gz.sig`](https://github.com/silverlion2/quota-float/releases/download/v0.3.6/Quota.Float_universal.app.tar.gz.sig) | 412 | `bece9458686c57ccd8801270a1ae23d7c16efea10043f59acafc64a9ca4da48f` | Tauri updater signature for macOS |

## Signing and remaining manual validation

Tauri updater signatures were generated for Windows and macOS. Windows Authenticode, macOS Developer ID signing, and macOS notarization are not configured, so SmartScreen or Gatekeeper may still warn. Defender accepted both unsigned Windows release artifacts. The annotated Git tag is not GPG-signed.

Automation does not replace the documented Windows multi-monitor/DPI matrix, real-provider login checks, or real Intel/Apple-silicon macOS installation and visual/runtime validation. The Release workflow emitted non-blocking notices that its unchanged `actions/checkout@v4` and `actions/setup-node@v4` declarations target Node.js 20 and are being forced to Node.js 24 by hosted runners.

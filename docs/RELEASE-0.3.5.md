# Quota Float v0.3.5 Release Record

Date: 2026-08-30

## Publication

- Version: `0.3.5`
- Feature commit: `d74edcfac3997360bf2592549e204c0f0b35015b` (`feat: harden imports and provider snapshots`)
- Release commit: `d14735a35d4e584d97942006eb9332f8f0c43b16` (`release: v0.3.5`)
- Branch and tag: `main`, `v0.3.5`
- Published: 2026-08-29 17:32 UTC / 2026-08-30 01:32 Asia/Shanghai
- GitHub Release: <https://github.com/silverlion2/quota-float/releases/tag/v0.3.5>
- Cloud dry run: <https://github.com/silverlion2/quota-float/actions/runs/33265460630>
- Release workflow: <https://github.com/silverlion2/quota-float/actions/runs/33265571042>
- Release state: public, non-draft, non-prerelease

## Delivered scope

- Added schema-aware backup envelope validation. Current and schema-less legacy backups remain recoverable, while arrays, missing sections, invalid schema values, and future schemas are rejected before local state is changed.
- Added privacy-safe layout import diagnostics that report migrated, clamped, repaired, dropped, truncated, and ignored fields without exposing layout names, IDs, provider values, unknown-field values, or local paths.
- Added a shared provider-registry conformance boundary across all seven adapters: descriptor-owned identity, valid status values, finite and bounded quota payloads, bounded strings/lists, timestamp validation, safe failure payloads, and redaction of tokens, auth headers, raw JSON, and user paths.
- Added a continuous window-lifecycle fixture covering a negative-coordinate secondary display, top-taskbar relocation, display removal, and differently scaled primary-display takeover.
- Updated architecture, project summary, roadmap, and test-matrix documentation for the new import, provider, and display-lifecycle contracts.

The local-first credential boundary is unchanged. Provider credential access remains read-only and inside `src-tauri`; the new registry boundary removes unsafe diagnostics before snapshots cross into the frontend.

## Verification evidence

- The release audit recognized the Tauri stack, synchronized version sources, guarded release CLI, changelog, and release workflow.
- The local release orchestrator confirmed the `0.3.4 -> 0.3.5` target and included commits. Its default parallel Vitest run was stopped after the shared Windows host could not schedule workers; it made no version or remote mutation. The isolated cloud dry run then completed the full release gate successfully.
- The formal cloud `verify` job passed 193 frontend tests across 26 files, the production frontend build, 57 platform-applicable Linux Rust tests, and the non-mutating release dry run.
- Local Windows verification passed 69 Rust tests, the production build, bundle budgets, Rust formatting/check/strict Clippy, version synchronization, and Git diff checks. The production bundle remained within budget: entry JavaScript 388,554 bytes, total JavaScript 536,575 bytes, gzip JavaScript 162,490 bytes, and CSS 153,553 bytes.
- GitHub Actions `verify`, release-ref creation, Windows publish, macOS Universal publish, `finalize`, and stable `upgrade-smoke` jobs all passed.
- Microsoft Defender accepted the exact Windows executable and NSIS installer that were uploaded to the Release.
- `finalize` verified all six required assets before changing the Release from draft to public; the previous-to-current per-user Windows upgrade smoke then passed.
- The post-release version audit reports every authoritative source synchronized at `0.3.5`.

## Published artifacts

| Artifact | Bytes | SHA-256 | Purpose |
| --- | ---: | --- | --- |
| [`latest.json`](https://github.com/silverlion2/quota-float/releases/download/v0.3.5/latest.json) | 4,121 | `725fb59a8a540f3981fea6333ad82e7dda29f6717e8c4586994837806b6a3755` | Stable updater manifest |
| [`Quota.Float_0.3.5_x64-setup.exe`](https://github.com/silverlion2/quota-float/releases/download/v0.3.5/Quota.Float_0.3.5_x64-setup.exe) | 4,599,442 | `c3d5fda30e3381180f7a989f6cbf2056e11ff575491611e641f3322b0b7c46a4` | Windows x64 NSIS installer/updater |
| [`Quota.Float_0.3.5_x64-setup.exe.sig`](https://github.com/silverlion2/quota-float/releases/download/v0.3.5/Quota.Float_0.3.5_x64-setup.exe.sig) | 424 | `f0098cdf0d75475ec03779f3b4dcd9b22d36ebeb4c1fd56d6f9aae29575a5660` | Tauri updater signature for Windows |
| [`Quota.Float_0.3.5_universal.dmg`](https://github.com/silverlion2/quota-float/releases/download/v0.3.5/Quota.Float_0.3.5_universal.dmg) | 11,674,839 | `c635cca8dcbe76b6e8494e8cc938c71615be7246e39725956715e3cbb64113ec` | Universal macOS disk image |
| [`Quota.Float_universal.app.tar.gz`](https://github.com/silverlion2/quota-float/releases/download/v0.3.5/Quota.Float_universal.app.tar.gz) | 11,949,044 | `ee3cc4995dc38d91d5206094c19592b26bdfd9e8a31a8c862624e6750d7f5b61` | Universal macOS updater archive |
| [`Quota.Float_universal.app.tar.gz.sig`](https://github.com/silverlion2/quota-float/releases/download/v0.3.5/Quota.Float_universal.app.tar.gz.sig) | 412 | `22d2908dcbc3e85c3fc9c1001b43bc2a0ef5d95b328328c5deb7d19a779d9775` | Tauri updater signature for macOS |

## Signing and remaining manual validation

Tauri updater signatures were generated for Windows and macOS. Windows Authenticode, macOS Developer ID signing, and macOS notarization are not configured, so SmartScreen or Gatekeeper may still warn. Defender accepted both unsigned Windows release artifacts.

Automation does not replace the documented Windows multi-monitor/DPI matrix, real-provider login checks, or real Intel/Apple-silicon macOS installation and visual/runtime validation. The workflow emitted non-blocking notices that older GitHub actions targeting Node.js 20 were forced to run on Node.js 24.

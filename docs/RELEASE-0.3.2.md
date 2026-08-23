# Quota Float v0.3.2 Release Record

Date: 2026-08-23

## Publication

- Version: `0.3.2`
- Feature commit: `8c97035` (`feat: refine desktop layouts and add multi-source reset forecasting`)
- Release commit: `b150889a2103dc51182248a0411c33d8af1b14db` (`release: v0.3.2`)
- Branch and tag: `main`, `v0.3.2`
- Published: 2026-08-23 11:48 UTC / 2026-08-23 19:48 Asia/Shanghai
- GitHub Release: <https://github.com/silverlion2/quota-float/releases/tag/v0.3.2>
- Release workflow: <https://github.com/silverlion2/quota-float/actions/runs/32636990895>
- Release state: public, non-draft, non-prerelease

## Delivered scope

- Clarified Dashboard, Provider Bar, Stacked, Insights, Control Center, update, diagnostics, and compact Bar layouts.
- Added dynamic seven-provider switching, roving keyboard focus, responsive density improvements, and supporting component tests.
- Expanded the unofficial Codex reset outlook to three fixed public sources with freshness checks, bounded responses, median consensus, confidence reporting, and planning safeguards.
- Updated privacy, security, capability allowlists, copy, types, preview fixtures, and quota pace coverage.

The local-first credential boundary is unchanged. Provider credential access remains read-only and inside `src-tauri`.

## Verification evidence

- Release audit recognized the Tauri stack, synchronized version sources, guarded release CLI, changelog, and release workflow.
- Local release dry run passed from clean, synchronized `main`.
- Frontend/unit/component/release tests: 182 passed across 24 files.
- Rust unit tests: 64 passed; 0 failed.
- Production frontend build and bundle budget check passed.
- Rust formatting, check, strict Clippy, version synchronization, and Git diff checks passed.
- GitHub Actions `verify`, Windows publish, macOS Universal publish, `finalize`, and stable upgrade smoke jobs all passed.
- Microsoft Defender accepted the Windows executable and NSIS installer.
- The final public Release contains the complete updater artifact set and is not a draft.

## Published artifacts

| Artifact | Bytes | Purpose |
| --- | ---: | --- |
| `latest.json` | 4,121 | Stable updater manifest |
| `Quota.Float_0.3.2_x64-setup.exe` | 4,583,337 | Windows x64 NSIS installer/updater |
| `Quota.Float_0.3.2_x64-setup.exe.sig` | 424 | Tauri updater signature for Windows |
| `Quota.Float_0.3.2_universal.dmg` | 11,648,470 | Universal macOS disk image |
| `Quota.Float_universal.app.tar.gz` | 11,917,475 | Universal macOS updater archive |
| `Quota.Float_universal.app.tar.gz.sig` | 412 | Tauri updater signature for macOS |

## Signing and remaining manual validation

Tauri updater signatures were generated for Windows and macOS. Windows Authenticode, macOS Developer ID signing, and macOS notarization are not configured, so SmartScreen or Gatekeeper may still warn. Defender accepted both unsigned Windows release artifacts.

Automation does not replace the documented Windows multi-monitor/DPI matrix, real-provider login checks, or real Intel/Apple-silicon macOS installation and visual/runtime validation. The workflow emitted a non-blocking notice that older GitHub actions targeting Node.js 20 were forced to run on Node.js 24.

# Quota Float v0.2.20 Release Record

This file preserves the implementation, verification, and publication evidence for the magnetic Bar release. It records automated evidence separately from manual platform validation.

## Publication

- Version: `0.2.20`
- Feature commit: `25c3edc` (`feat: add magnetic side bar`)
- Release commit: `eb275ec1dfd703befccd96f3f6d0a3db6cdf760d` (`release: v0.2.20`)
- Branch and tag: `main`, `v0.2.20`
- Published: 2026-08-13 16:11 UTC / 2026-08-14 00:11 Asia/Shanghai
- GitHub Release: <https://github.com/silverlion2/quota-float/releases/tag/v0.2.20>
- Release workflow: <https://github.com/silverlion2/quota-float/actions/runs/31717283990>
- Release state: public, non-draft, non-prerelease

## Delivered scope

- Magnetic Top/Left/Right Bar placement with normalized `0…1` along-edge offsets.
- Horizontal `400×38` Top Bar and upright `64×320` Left/Right rails.
- Bar-edge controls, saved-layout persistence, import/export, recovery, and legacy migration.
- Work-area-aware magnetic dragging, corner tie retention, inward expansion, content-resize anchoring, and multi-monitor/DPI geometry.
- Regression coverage for preferences, bridge persistence, themes, accessibility, taskbars, negative monitor origins, and scaling.
- Updated project summary, architecture, roadmap, READMEs, test matrix, known limitations, feedback tracker, and changelog.

The local-first provider boundary did not change. Provider credential access remains read-only and inside `src-tauri`.

## Verification evidence

The local guarded release dry run and the actual release preparation both passed:

- 132 frontend tests.
- 45 Rust tests.
- Production frontend build.
- Rust formatting, `cargo check`, and strict `cargo clippy`.
- Git diff validation and synchronized version checks.

GitHub Actions run `31717283990` completed successfully with:

- `verify`: success.
- `defender-preflight`: success, including Windows bundle build and Microsoft Defender scan.
- `publish (windows-latest, --bundles nsis)`: success.
- `publish (macos-latest, --target universal-apple-darwin --bundles app,dmg)`: success.
- `upgrade-smoke`: success.

At final verification, local `HEAD`, `origin/main`, and tag `v0.2.20` all resolved to `eb275ec1dfd703befccd96f3f6d0a3db6cdf760d`, and the worktree was clean.

## Published artifacts

| Artifact | Bytes | Purpose |
| --- | ---: | --- |
| [`latest.json`](https://github.com/silverlion2/quota-float/releases/download/v0.2.20/latest.json) | 3,915 | Stable updater manifest |
| [`Quota.Float_0.2.20_x64-setup.exe`](https://github.com/silverlion2/quota-float/releases/download/v0.2.20/Quota.Float_0.2.20_x64-setup.exe) | 4,449,076 | Windows x64 NSIS installer/updater |
| [`Quota.Float_0.2.20_x64-setup.exe.sig`](https://github.com/silverlion2/quota-float/releases/download/v0.2.20/Quota.Float_0.2.20_x64-setup.exe.sig) | 424 | Tauri updater signature for Windows |
| [`Quota.Float_0.2.20_universal.dmg`](https://github.com/silverlion2/quota-float/releases/download/v0.2.20/Quota.Float_0.2.20_universal.dmg) | 11,179,434 | Universal macOS disk image |
| [`Quota.Float_universal.app.tar.gz`](https://github.com/silverlion2/quota-float/releases/download/v0.2.20/Quota.Float_universal.app.tar.gz) | 11,435,409 | Universal macOS updater archive |
| [`Quota.Float_universal.app.tar.gz.sig`](https://github.com/silverlion2/quota-float/releases/download/v0.2.20/Quota.Float_universal.app.tar.gz.sig) | 412 | Tauri updater signature for macOS |

## Remaining manual validation

Automated release success does not replace native visual/runtime validation:

- Windows Top/Left/Right Bar behavior still needs the full 100%/125%/150% multi-monitor matrix, including negative origins, taskbar boundaries, locking, always-on-top, white-edge, clipping, and hover-expansion checks.
- The Universal macOS artifact still needs installation and visual/runtime testing on a real Mac for transparency, menu-bar behavior, dragging, edge expansion, locking, and updates.
- Public artifacts have Tauri updater signatures. Windows Authenticode and macOS Developer ID/notarization remain separate and may still cause SmartScreen or Gatekeeper warnings.

See [TEST-MATRIX.md](TEST-MATRIX.md), [KNOWN-LIMITATIONS.md](KNOWN-LIMITATIONS.md), and [USER-FEEDBACK-TRACKER.md](USER-FEEDBACK-TRACKER.md) for the pending manual checks.

# Quota Float v0.3.4 Release Record

Date: 2026-08-28

## Publication

- Version: `0.3.4`
- Fix commit: `73711162adf4e6e0604f896e8526cecc13476f89` (`fix: keep vertical provider list in provider bar`)
- Release commit: `a444303005b2b0a62745303635746bfbff25f97a` (`release: v0.3.4`)
- Branch and tag: `main`, `v0.3.4`
- Published: 2026-08-28 01:52 UTC / 2026-08-28 09:52 Asia/Shanghai
- GitHub Release: <https://github.com/silverlion2/quota-float/releases/tag/v0.3.4>
- Cloud dry run: <https://github.com/silverlion2/quota-float/actions/runs/33133254659>
- Release workflow: <https://github.com/silverlion2/quota-float/actions/runs/33133458179>
- Release state: public, non-draft, non-prerelease

## Delivered scope

- Removed the horizontal provider quick-switch strip from the Provider Bar expanded layout.
- Restored the right-side vertical provider ledger, including provider status, quota values, history, selection, and reorder controls.
- Kept the Cockpit layout's single horizontal provider navigator unchanged.
- Removed obsolete Provider Bar CSS selectors while preserving the production CSS budget.
- Added a component regression test that requires the horizontal strip to be absent and the vertical provider ledger to remain present.

The local-first credential boundary is unchanged. Provider credential access remains read-only and inside `src-tauri`.

## Verification evidence

- Release audit recognized the Tauri stack, synchronized version sources, guarded release CLI, changelog, and release workflow.
- Local release dry run passed from clean, synchronized `main` for target `v0.3.4`.
- Frontend/unit/component/release tests: 186 passed across 24 files.
- Rust unit tests: 65 passed; 0 failed.
- Production frontend build passed; total CSS was 153,553 bytes against the 153,600-byte budget.
- Rust formatting, check, strict Clippy, version synchronization, and Git diff checks passed.
- GitHub Actions `verify`, release-ref creation, Windows publish, macOS Universal publish, `finalize`, and stable upgrade-smoke jobs all passed.
- Microsoft Defender accepted the Windows executable and NSIS installer.
- The final public Release contains the complete updater artifact set and is not a draft.

## Published artifacts

| Artifact | Bytes | SHA-256 | Purpose |
| --- | ---: | --- | --- |
| `latest.json` | 4,121 | `683db47d8b9fa76352b36cc19ebae79de33eac3fb90938642f8328fbf8076227` | Stable updater manifest |
| `Quota.Float_0.3.4_x64-setup.exe` | 4,602,166 | `0f23f2a600b754eccb73182aa2a7501879902b60dde9ab6ab46d7a19365b5084` | Windows x64 NSIS installer/updater |
| `Quota.Float_0.3.4_x64-setup.exe.sig` | 424 | `aa435433b505e34666ac9df6a27bed3061a0cfcec292c221739d126858b1152a` | Tauri updater signature for Windows |
| `Quota.Float_0.3.4_universal.dmg` | 11,666,705 | `94e8450f47e8132fd894eb179ac9ec616cba409969e65c2cf7cdf81c40634f24` | Universal macOS disk image |
| `Quota.Float_universal.app.tar.gz` | 11,937,489 | `82751055ad6f0b969b408e6fa1f2ea852a8c752d351d347ffbaa40dfae621a28` | Universal macOS updater archive |
| `Quota.Float_universal.app.tar.gz.sig` | 412 | `86c73b83a45f20ca1eab53c200464aee34d7d3fa6a5c2ad7f340bac3e6fed071` | Tauri updater signature for macOS |

## Signing and remaining manual validation

Tauri updater signatures were generated for Windows and macOS. Windows Authenticode, macOS Developer ID signing, and macOS notarization are not configured, so SmartScreen or Gatekeeper may still warn. Defender accepted both unsigned Windows release artifacts.

Automation does not replace the documented Windows multi-monitor/DPI matrix, real-provider login checks, or real Intel/Apple-silicon macOS installation and visual/runtime validation. The workflow emitted a non-blocking notice that older GitHub actions targeting Node.js 20 were forced to run on Node.js 24.

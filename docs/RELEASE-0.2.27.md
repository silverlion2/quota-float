# Quota Float v0.2.27 Release Record

This file preserves the implementation, verification, and publication evidence for the compact update and diagnostics overlays release. Automated evidence is recorded separately from manual platform validation.

## Publication

- Version: `0.2.27`
- Feature commit: `2a5990fdf46ab7f55f9d003d54837c07fa0d4e82` (`fix: compact update and diagnostics overlays`)
- Release commit: `59b48771a9b81bf5a12624f50d7910ae8d195687` (`release: v0.2.27`)
- Branch and tag: `main`, `v0.2.27`
- Published: 2026-08-22 01:16 UTC / 2026-08-22 09:16 Asia/Shanghai
- GitHub Release: <https://github.com/silverlion2/quota-float/releases/tag/v0.2.27>
- Release workflow: <https://github.com/silverlion2/quota-float/actions/runs/32542655080>
- Trigger: push of tag `v0.2.27`
- Release state: public, non-draft, non-prerelease

## Delivered scope

- Update Center and provider diagnostics now hide the inactive card content while their overlay is open, so overlay height is determined by the active task instead of the underlying dashboard.
- Update Center uses a 232-logical-pixel compact baseline; provider diagnostics uses a 270-logical-pixel baseline.
- Panel padding, grid gaps, diagnostic cards, notes, and action rows were tightened while retaining 28-logical-pixel close and footer controls.
- Update states now have dedicated coverage for idle, checking, available, downloading, ready, installing, current, and error phases.
- Diagnostics coverage now includes loading, unavailable, attention, overlay-class, hidden-content, and inert-background behavior.
- The idle update title no longer renders an empty version placeholder.

Provider access remains read-only and inside `src-tauri`. The changes do not broaden credential access or persist provider credentials, prompts, chats, or raw quota responses.

## Verification evidence

The guarded local dry run `npm run release -- patch --dry-run --yes` completed successfully before publication and planned `0.2.26 -> 0.2.27` without modifying release refs. Local verification included:

- Frontend tests: 165 passed across 22 files.
- Rust tests: 52 passed.
- Production frontend build: passed with 4,617 transformed modules.
- Rust format, check, and strict Clippy gates: passed.
- Version synchronization, cached-diff, and clean-diff checks: passed.
- Browser layout inspection confirmed a 232-by-552 logical-pixel update card, hidden inactive content, 28-logical-pixel action buttons, and no overflow.

The release workflow `32542655080` completed successfully with:

- `verify`: success.
- `publish-draft (windows-latest, --bundles nsis)`: success.
- Exact Windows release-artifact Microsoft Defender scan: success.
- `publish-draft (macos-latest, --target universal-apple-darwin --bundles app,dmg)`: success.
- Six-asset completeness check and public Release finalization: success.
- Stable previous-to-current Windows per-user `upgrade-smoke`: success.

Immediately after publication, local `HEAD`, `origin/main`, and tag `v0.2.27` resolved to release commit `59b48771a9b81bf5a12624f50d7910ae8d195687` before this evidence record was added. Public API verification confirmed the release state and all six required assets.

## Published artifacts

| Artifact | Bytes | SHA-256 | Purpose |
| --- | ---: | --- | --- |
| [`latest.json`](https://github.com/silverlion2/quota-float/releases/download/v0.2.27/latest.json) | 4,048 | `8823e3187b2a557abd46e4e8b23caa7aae88e9f4cb545b33003a404e247f16ae` | Stable updater manifest |
| [`Quota.Float_0.2.27_x64-setup.exe`](https://github.com/silverlion2/quota-float/releases/download/v0.2.27/Quota.Float_0.2.27_x64-setup.exe) | 4,537,886 | `bd189a4bb57a86ff17bb00d11ae3fb9cd6fe8588bb7a4e261f754524777706d4` | Windows x64 NSIS installer/updater |
| [`Quota.Float_0.2.27_x64-setup.exe.sig`](https://github.com/silverlion2/quota-float/releases/download/v0.2.27/Quota.Float_0.2.27_x64-setup.exe.sig) | 424 | `7336b2c292e26633ae7132bb4719a974dbcc2f9c518ab150f1a3820f5de4e111` | Tauri updater signature for Windows |
| [`Quota.Float_0.2.27_universal.dmg`](https://github.com/silverlion2/quota-float/releases/download/v0.2.27/Quota.Float_0.2.27_universal.dmg) | 11,412,252 | `4fc7da52606a16d0dd0ee794778262d06f58e6df5684d0ba21814c8e13efba08` | Universal macOS disk image |
| [`Quota.Float_universal.app.tar.gz`](https://github.com/silverlion2/quota-float/releases/download/v0.2.27/Quota.Float_universal.app.tar.gz) | 11,676,241 | `9405ed5c0a4d9314cd35da13745ff52b13d869b9cde385c6f16c3421ff742746` | Universal macOS updater archive |
| [`Quota.Float_universal.app.tar.gz.sig`](https://github.com/silverlion2/quota-float/releases/download/v0.2.27/Quota.Float_universal.app.tar.gz.sig) | 412 | `360d26647dd9c3dd87208e56c671412dd355bdd36b067d3f409afb1be2dc1542` | Tauri updater signature for macOS |

## Remaining manual validation

Automated release success does not replace native visual/runtime validation:

- Install the public Windows package and verify Update Center and diagnostics sizing at supported scaling levels, keyboard focus, download progress, restart flow, and multi-monitor positioning.
- Install the Universal macOS DMG on real Apple Silicon and Intel Macs and verify the same overlay behavior plus transparency and menu-bar behavior.
- Public artifacts have Tauri updater signatures. Windows Authenticode and macOS Developer ID/notarization remain separate and may still cause SmartScreen or Gatekeeper warnings.
- GitHub Actions emitted Node.js 20 deprecation annotations for `actions/checkout@v4` and `actions/setup-node@v4`; upgrading those action dependencies is a follow-up maintenance item.

See [TEST-MATRIX.md](TEST-MATRIX.md) and [KNOWN-LIMITATIONS.md](KNOWN-LIMITATIONS.md) for the pending manual checks.

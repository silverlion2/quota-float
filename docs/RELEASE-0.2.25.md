# Quota Float v0.2.25 Release Record

This file preserves the implementation, verification, and publication evidence for the unified theme and retained quota-history release. Automated evidence is recorded separately from manual platform validation.

## Publication

- Version: `0.2.25`
- Feature commit: `969dabab7466fb304935d33ae06ce341fa9d3eb0` (`feat: unify themes and retain usage history`)
- Release commit: `07ed0c18448f290fafe2a6bf26fb49eea4f08537` (`release: v0.2.25`)
- Branch and tag: `main`, `v0.2.25`
- Published: 2026-08-20 16:42 UTC / 2026-08-21 00:42 Asia/Shanghai
- GitHub Release: <https://github.com/silverlion2/quota-float/releases/tag/v0.2.25>
- Release workflow: <https://github.com/silverlion2/quota-float/actions/runs/32392946458>
- Trigger: external `v0.2.25` tag push from the guarded local release command
- Release state: public, non-draft, non-prerelease

## Delivered scope

- A shared semantic palette now drives Aurora, Graphite, and Paper in both light and dark mode across the control center, diagnostics, updater, activity, and usage-insights surfaces.
- Runtime history schema v2 retains detailed quota samples for 90 days and compact daily summaries for 365 days.
- Numeric quota samples are bounded to one per provider and quota window every 30 minutes, while lifetime sample metadata remains available after detailed records age out.
- Existing local history migrates in place, and the Activity view reports the retained-memory span and lifetime sample count.
- Tests and architecture/user documentation cover the new theme contract, migration, retention, sampling, summaries, and privacy behavior.

Provider access remains read-only and inside `src-tauri`. Retained usage memory stays local and does not store provider credentials, prompts, chats, or raw quota responses.

## Verification evidence

The guarded local dry run `npm run release -- 0.2.25 --dry-run --yes` completed successfully before publication. The guarded publish command repeated the release gates and completed successfully with:

- Frontend tests: 146 passed.
- Rust tests: 49 passed.
- Production frontend build: passed.
- Post-version `cargo check` and synchronized version check: passed.

The release workflow `32392946458` completed successfully with:

- `verify`: success.
- `publish-draft (windows-latest, --bundles nsis)`: success.
- Exact Windows release-artifact Microsoft Defender scan: success.
- `publish-draft (macos-latest, --target universal-apple-darwin --bundles app,dmg)`: success.
- Artifact completeness check and public Release finalization: success.
- Stable previous-to-current Windows per-user `upgrade-smoke`: success.

Immediately after publication, local `HEAD`, `origin/main`, and tag `v0.2.25` resolved to the expected release history before this evidence record was added. Public API verification confirmed the release state and all six required assets.

## Published artifacts

| Artifact | Bytes | SHA-256 | Purpose |
| --- | ---: | --- | --- |
| [`latest.json`](https://github.com/silverlion2/quota-float/releases/download/v0.2.25/latest.json) | 3,915 | `d090d099bae1ec25da344b611d56492dd6690fffcd8b65a34fbdacfe17e73374` | Stable updater manifest |
| [`Quota.Float_0.2.25_x64-setup.exe`](https://github.com/silverlion2/quota-float/releases/download/v0.2.25/Quota.Float_0.2.25_x64-setup.exe) | 4,533,278 | `e268eb41b6ee64d0f61a5017f6108f13ac1c71a241bc8b5f8c7e8124443a0c4a` | Windows x64 NSIS installer/updater |
| [`Quota.Float_0.2.25_x64-setup.exe.sig`](https://github.com/silverlion2/quota-float/releases/download/v0.2.25/Quota.Float_0.2.25_x64-setup.exe.sig) | 424 | `8dcbbdd0bc3f7d9158fab80b24bfd072f952cc5a142a8bf28394842cca9e46db` | Tauri updater signature for Windows |
| [`Quota.Float_0.2.25_universal.dmg`](https://github.com/silverlion2/quota-float/releases/download/v0.2.25/Quota.Float_0.2.25_universal.dmg) | 11,423,169 | `80d0ea820ce0097cc1b8b28493f82998c84622aa57c7c80cb80483ad908d2c80` | Universal macOS disk image |
| [`Quota.Float_universal.app.tar.gz`](https://github.com/silverlion2/quota-float/releases/download/v0.2.25/Quota.Float_universal.app.tar.gz) | 11,681,047 | `89427a6f21e5d4e1368899b85e722b11f069dd1a69edefab11018be34090c919` | Universal macOS updater archive |
| [`Quota.Float_universal.app.tar.gz.sig`](https://github.com/silverlion2/quota-float/releases/download/v0.2.25/Quota.Float_universal.app.tar.gz.sig) | 412 | `aaaa4dc3bcea884b4182d2c093caef6aef10ae09f3792c0878230b7ed9cb8169` | Tauri updater signature for macOS |

## Remaining manual validation

Automated release success does not replace native visual/runtime validation:

- Install the public Windows package and verify all six theme combinations, retained-memory reporting, scaling, and multi-monitor positioning.
- Install the Universal macOS DMG on real Apple Silicon and Intel Macs and verify transparency, menu-bar behavior, theme rendering, retained history, and updating.
- Public artifacts have Tauri updater signatures. Windows Authenticode and macOS Developer ID/notarization remain separate and may still cause SmartScreen or Gatekeeper warnings.

See [TEST-MATRIX.md](TEST-MATRIX.md) and [KNOWN-LIMITATIONS.md](KNOWN-LIMITATIONS.md) for the pending manual checks.

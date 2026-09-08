# Quota Float v0.3.11 release evidence

- Public release: https://github.com/silverlion2/quota-float/releases/tag/v0.3.11
- Published: 2026-09-08 18:24:09 UTC / 2026-09-09 02:24:09 Asia/Shanghai.
- Release commit: `6def7ef1fb83e2cbe9416d98854568665e77ddcf` (peeled annotated tag `v0.3.11`).
- Preflight: https://github.com/silverlion2/quota-float/actions/runs/34261666483 — success.
- Formal release: https://github.com/silverlion2/quota-float/actions/runs/34261988819 — success.
- Application changes and specialist provenance: [systematic review](REVIEW-2026-09-09.md).

## Gates and artifact binding

Windows and Universal macOS builds passed. Microsoft Defender scanned the exact Windows release artifacts successfully. The Windows lifecycle job passed installation from public v0.3.9, upgrade to draft v0.3.11, eight-second candidate startup, rollback/startup, reinstall/startup, and uninstall on an ephemeral GitHub-hosted runner. The tested installer asset ID was `551049061`; its SHA-256 is listed below. The finalizer rechecked the tested asset digest before publication, and the distribution job passed afterward.

The coordinator downloaded all six public assets and verified their SHA-256 values against the GitHub API. Both the Windows installer and macOS updater archive passed independent minisign verification with the application's configured public key; a modified copy of each artifact was rejected. All six updater platform aliases in `latest.json` use this release's asset URLs and matching signature text. Version files are synchronized at 0.3.11.

The local publish wrapper initially reported a post-publication metadata mismatch: GitHub's Release target was the dispatch commit `261bf61`, while the tag and built source correctly referenced `6def7ef`. Only Release target metadata was corrected. HEAD, origin/main, tag commit, and Release target were then independently verified equal. A subsequent archival/workflow commit on main explicitly sets this field for future releases and includes an executable finalizer regression. It does not replace published binaries or move tags.

## SHA-256

| Asset | SHA-256 |
| --- | --- |
| `latest.json` | `aabc9624aef346e7220bcb24f50c2e005f6187566e7350854222e5e19a9110b0` |
| `Quota.Float_0.3.11_universal.dmg` | `f98a648dbc8b9bd4644d80f80a1e89a2323f35885b8702d8e30c68f9e9c7e4e1` |
| `Quota.Float_0.3.11_x64-setup.exe` | `3faab656d8b2a1488b5ab1638f50469748bdf85697e60207fa97c28badbac807` |
| `Quota.Float_0.3.11_x64-setup.exe.sig` | `d607e95e3a3062503abeaeaf6b2cb69738a20e9762db58110af5d072ed2bff29` |
| `Quota.Float_universal.app.tar.gz` | `59f89b4d70c2720df6b374defd01f14f16b95a3cde63535702b3a8a9efbd73e0` |
| `Quota.Float_universal.app.tar.gz.sig` | `a5be607de05d325ec1390cf3bdf99ca03ca8209ab713a25f7147711fb55b2b95` |

## Validation scope and signing

Integrated application validation passed 270 frontend tests, 93 Rust tests, formatting, strict Clippy, cargo check, production build, and bundle budgets. Following CSS cleanup, 72 component/appearance tests passed. [Six native E2E scenarios](NATIVE-E2E-2026-09-09.md) ran against an isolated synthetic Windows build before the mechanical version bumps and release-script-only changes. Final release-helper validation passes 17 tests, including Windows PowerShell 5.1 list enumeration and built-commit publication metadata.

Windows Authenticode, macOS Developer ID signing, and macOS notarization were **not configured** in this run. Tauri updater integrity signatures are present and verified separately. Real Mac runtime, Windows multi-monitor/DPI visual acceptance, and live revalidation of every provider account remain outstanding. Public reset signal scores are uncalibrated; this release does not claim a measured prediction-accuracy improvement.

v0.3.10 remains draft/unpublished after its PowerShell candidate-selection gate failure. Its tag and assets were retained; v0.3.11 contains its application improvements plus the release-script correction. Public Release notes were expanded after verification; the originally built updater manifest retains its generated notes and verified digest.

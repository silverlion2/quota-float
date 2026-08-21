# Quota Float v0.2.26 Release Record

This file preserves the implementation, verification, and publication evidence for the widget reliability release. Automated evidence is recorded separately from manual platform validation.

## Publication

- Version: `0.2.26`
- Feature commit: `eb98a2916f6dbdf022bb1d750fdfbcd113c4c4e1` (`fix: harden widget state and notifications`)
- Release commit: `ddcff3db9ce0dfeb71c549c9c5cd7f604cdf6dc9` (`release: v0.2.26`)
- Branch and tag: `main`, `v0.2.26`
- Published: 2026-08-21 18:32 UTC / 2026-08-22 02:32 Asia/Shanghai
- GitHub Release: <https://github.com/silverlion2/quota-float/releases/tag/v0.2.26>
- Release workflow: <https://github.com/silverlion2/quota-float/actions/runs/32512452983>
- Trigger: GitHub Actions `workflow_dispatch` with `version=patch` and `publish=true`
- Release state: public, non-draft, non-prerelease

## Delivered scope

- Expanded widgets now use a stable 260-logical-pixel baseline and return to that standard size when content is empty or undersized, while retaining work-area and taskbar bounds.
- Concurrent refresh requests share one in-flight operation, preventing stale refresh completions from suppressing newer success notifications.
- Budget notifications are acknowledged only after successful desktop delivery; failed delivery remains retryable and concurrent attempts are deduplicated.
- Hidden providers cannot remain pinned, and provider rotation uses only the visible ordered provider set.
- Backup restore applies preferences and runtime data transactionally and rolls back settings if the runtime write fails.
- Expanded-height accounting now keeps the full window within the 1,200-pixel cap, including transparent safe insets.
- Activity-event identifiers include transition discriminators so simultaneous threshold/reset events do not collide.
- WorkBuddy request helpers box large error snapshots, satisfying the Rust 1.98 Windows Clippy gate without changing provider behavior.

Provider access remains read-only and inside `src-tauri`. The changes do not broaden credential access or persist provider credentials, prompts, chats, or raw quota responses.

## Verification evidence

The guarded local dry run `npm run release -- patch --dry-run --yes` completed successfully before publication and planned `0.2.25 -> 0.2.26` without modifying release refs. Verification included:

- Frontend tests: 154 passed across 21 files.
- Rust tests: 52 passed.
- Production frontend build: passed with 4,617 transformed modules.
- Rust format, check, and strict Clippy gates: passed.
- Version synchronization and clean-diff checks: passed.

PR #1 completed duplicate push and pull-request CI matrices on the release feature commit:

- Frontend verification: success on both event runs.
- Windows desktop build, strict Clippy, installer packaging, Microsoft Defender scan, and artifact upload: success on both event runs.
- Universal macOS desktop build and artifact upload: success on both event runs.

The release workflow `32512452983` completed successfully with:

- `verify`: success.
- `create-release-ref`: success; release commit and annotated tag were pushed atomically.
- `publish-draft (windows-latest, --bundles nsis)`: success.
- Exact Windows release-artifact Microsoft Defender scan: success.
- `publish-draft (macos-latest, --target universal-apple-darwin --bundles app,dmg)`: success.
- Six-asset completeness check and public Release finalization: success.
- Stable previous-to-current Windows per-user `upgrade-smoke`: success.

Immediately after publication, local `HEAD`, `origin/main`, and tag `v0.2.26` resolved to release commit `ddcff3db9ce0dfeb71c549c9c5cd7f604cdf6dc9` before this evidence record was added. Public API verification confirmed the release state and all six required assets.

## Published artifacts

| Artifact | Bytes | SHA-256 | Purpose |
| --- | ---: | --- | --- |
| [`latest.json`](https://github.com/silverlion2/quota-float/releases/download/v0.2.26/latest.json) | 4,173 | `9d236bfb57372ee3a99295ca0dc385dcd0e6c666865af93e47a203e3d3ddb662` | Stable updater manifest |
| [`Quota.Float_0.2.26_x64-setup.exe`](https://github.com/silverlion2/quota-float/releases/download/v0.2.26/Quota.Float_0.2.26_x64-setup.exe) | 4,536,382 | `47f10fb533b4527e82002b5bdf7ddcc32fe6af5ddb7d6d965bb34d9c89c7b3a2` | Windows x64 NSIS installer/updater |
| [`Quota.Float_0.2.26_x64-setup.exe.sig`](https://github.com/silverlion2/quota-float/releases/download/v0.2.26/Quota.Float_0.2.26_x64-setup.exe.sig) | 424 | `dc7d19f7617c67598603edc334b2f716e4ad9e31e2d84b037c98c1641d9624d2` | Tauri updater signature for Windows |
| [`Quota.Float_0.2.26_universal.dmg`](https://github.com/silverlion2/quota-float/releases/download/v0.2.26/Quota.Float_0.2.26_universal.dmg) | 11,412,430 | `fafe4de552ca1df0329795065251018cbeb90a08d7791b61df6f400d8301257f` | Universal macOS disk image |
| [`Quota.Float_universal.app.tar.gz`](https://github.com/silverlion2/quota-float/releases/download/v0.2.26/Quota.Float_universal.app.tar.gz) | 11,676,412 | `81b37850fdc86e8412071c622a79ce2b0ed09f60bf61a9f0bed5155a994f5783` | Universal macOS updater archive |
| [`Quota.Float_universal.app.tar.gz.sig`](https://github.com/silverlion2/quota-float/releases/download/v0.2.26/Quota.Float_universal.app.tar.gz.sig) | 412 | `51684d025eb78a1493ecd96740558f31ff705211e51f9fdd87c59070524261ba` | Tauri updater signature for macOS |

## Remaining manual validation

Automated release success does not replace native visual/runtime validation:

- Install the public Windows package and verify expanded/empty widget sizing, taskbar bounds, scaling, multi-monitor positioning, refresh notifications, hidden-provider rotation, and backup restore.
- Install the Universal macOS DMG on real Apple Silicon and Intel Macs and verify the same widget/notification behavior plus transparency and menu-bar behavior.
- Public artifacts have Tauri updater signatures. Windows Authenticode and macOS Developer ID/notarization remain separate and may still cause SmartScreen or Gatekeeper warnings.

See [TEST-MATRIX.md](TEST-MATRIX.md) and [KNOWN-LIMITATIONS.md](KNOWN-LIMITATIONS.md) for the pending manual checks.

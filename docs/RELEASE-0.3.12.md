# Quota Float v0.3.12 release evidence

- Public release: https://github.com/silverlion2/quota-float/releases/tag/v0.3.12
- Release workflow: https://github.com/silverlion2/quota-float/actions/runs/34679110377 — success.
- Release commit: `40157589203abb1ec63b4474685bf9ef0ce4aea5` (tag `v0.3.12`).
- Application review: [REVIEW-2026-09-12.md](REVIEW-2026-09-12.md).

## Gates and artifact identity

The source passed 289 frontend tests, 93 Rust tests, formatting, strict Clippy, production build and bundle budgets. Eight isolated synthetic Windows native E2E scenarios passed after correcting focus restoration timing.

Windows and Universal macOS release builds passed. Microsoft Defender scanned the exact Windows executable and installer. Installation from public v0.3.11, upgrade to draft v0.3.12, candidate startup, rollback/startup, reinstall/startup and uninstall all passed on a GitHub-hosted Windows runner. The tested installer asset ID was `558788784`; the finalizer verified its digest before publication. Public distribution checks passed.

All six public assets were downloaded and their SHA-256 values matched the GitHub API. Windows and macOS updater signatures were independently verified against the application's public key; modified artifacts were rejected. Every platform alias in `latest.json` references the correct release URL and matching signature. HEAD, origin/main, the release tag and Release target were equal at verification.

## SHA-256

| Asset | SHA-256 |
| --- | --- |
| `latest.json` | `1ef3d4164917e9d92c569216f200bed5026812a6a07dd8a4807e0207d5050e76` |
| `Quota.Float_0.3.12_universal.dmg` | `75af22fc9301146a9de96f852b6b12bb77df8d8d45aefa3c424ea6cac81a3a71` |
| `Quota.Float_0.3.12_x64-setup.exe` | `9256869ca5bd34e12d06976d46afe9693b68b17b8dffe8fa9578cab809878f1c` |
| `Quota.Float_0.3.12_x64-setup.exe.sig` | `bcc43ffe6c4043717577442d653b1c65bf7e66dc204da83cc1ee85c3bf3598d9` |
| `Quota.Float_universal.app.tar.gz` | `8dd308b84ce91c2daaaf74ccb8f1f4a41edee3a3c3e93fd663173472459a5347` |
| `Quota.Float_universal.app.tar.gz.sig` | `c628886245fc96e0993d7584749fc64dbbc8626ca355eee26385d22f7fd968a1` |

## CI follow-up and limitations

The parallel [initial source CI](https://github.com/silverlion2/quota-float/actions/runs/34679102414) passed frontend and macOS jobs. Its Windows E2E job reached the light/dark screenshot test but failed to save an image because the ignored `output/handoff` directory did not exist on the fresh runner. The preceding seven scenarios, including repeated modal timing and focus restoration, passed. The follow-up test setup explicitly creates this directory; all eight scenarios passed locally again. The subsequent [main CI](https://github.com/silverlion2/quota-float/actions/workflows/ci.yml) verifies that fresh-checkout path. This follow-up changes only test setup and evidence documentation, so it does not replace the published application or move its tag.

The next CI run exposed a separate measurement race: DOM visibility was checked before the serialized native resize IPC completed (dialog bottom 444px against the previous 268px viewport). The layout test now waits up to two seconds for the actual native viewport to fit, then executes the original boundary and overflow assertions. It retains a failure on a stalled resize, without changing application code or published artifacts. CI also archives native screenshots for seven days on both success and failure, so future visual failures retain reviewable evidence.

Windows Authenticode, macOS Developer ID and notarization were not configured. Tauri updater signatures provide update integrity independently of operating-system trust. Real Mac runtime, multi-monitor/DPI visual acceptance, and current real-account checks across all providers still need corresponding hardware and account access. Public Release notes were expanded after download verification; the generated updater manifest and all artifact digests remain unchanged.

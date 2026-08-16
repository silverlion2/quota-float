# Quota Float v0.2.24 Release Record

This file preserves the implementation, verification, recovery, and publication evidence for the expanded local Codex usage insights release. Automated evidence is recorded separately from manual platform validation.

## Publication

- Version: `0.2.24`
- Feature commit: `16d6b39` (`feat: expand local Codex usage insights`)
- Release-workflow fix: `9618d1c` (`ci: install release preparation dependencies`)
- Release commit: `4336d22c9b650847ea15197db50714cd6819b50f` (`release: v0.2.24`)
- Branch and tag: `main`, `v0.2.24`
- Published: 2026-08-16 22:48 UTC / 2026-08-17 06:48 Asia/Shanghai
- GitHub Release: <https://github.com/silverlion2/quota-float/releases/tag/v0.2.24>
- Cloud dry run: <https://github.com/silverlion2/quota-float/actions/runs/31976390581>
- Push CI: <https://github.com/silverlion2/quota-float/actions/runs/31976383694>
- Release workflow: <https://github.com/silverlion2/quota-float/actions/runs/31976483645>
- Release state: public, non-draft, non-prerelease

## Delivered scope

- Bounded 90-day local Codex JSONL usage scanner with an incremental, schema-versioned index and explicit rebuild support.
- Numeric token aggregation by day, hour, model, project, terminal, and session without storing prompts, messages, raw responses, or local source paths in the index.
- Expanded Vibe Usage dashboard with model/project/terminal filters, token and session metrics, activity heatmap, cost estimates, budget state, and local threshold alerts.
- Versioned OpenAI API price snapshot (`2026-08-16.1`) for input, cached-input, and output token cost estimates.
- Local CSV, JSON, and SVG share-card exports with bounded output size.
- Privacy, security, architecture, test matrix, limitation, README, and collaboration memo updates.

Provider access remains read-only and inside `src-tauri`. Usage analysis reads the existing local Codex session corpus and does not upload it.

## Verification evidence

The final cloud dry run `31976390581` completed successfully before publication. The push CI run `31976383694` also completed successfully with:

- Frontend tests, production build, synchronized version check, and high-severity npm audit gate.
- Windows and macOS Rust tests plus strict clippy.
- Windows desktop build and Microsoft Defender scan.
- macOS Universal desktop build.

The final release workflow `31976483645` completed successfully with:

- `verify`: success.
- `create-release-ref`: success, including synchronized version update, `cargo check`, and atomic release commit/tag push.
- `publish-draft (windows-latest, --bundles nsis)`: success.
- Exact Windows executable and installer Microsoft Defender scan: success.
- `publish-draft (macos-latest, --target universal-apple-darwin --bundles app,dmg)`: success.
- Artifact completeness check and public Release finalization: success.
- Stable previous-to-current Windows per-user `upgrade-smoke`: success.

Immediately after publication, local `HEAD`, `origin/main`, and tag `v0.2.24` were synchronized to `4336d22c9b650847ea15197db50714cd6819b50f` before this evidence record was added.

## Recovery evidence

The first guarded publication attempt `31976216174` failed safely before creating a release commit, tag, draft, or public Release. The release preparation job ran the version helper's `cargo check` without the Linux GLib/WebKit development packages used by the verification job.

Commit `9618d1c` added the same Linux desktop dependency installation to `create-release-ref` and added a regression assertion in `scripts/release.test.mjs`. The focused release automation tests passed 8/8. Because `main` changed, the cloud dry run was repeated and passed before the successful publication workflow was started. No protection, test, signing, Defender, or artifact gate was bypassed.

## Published artifacts

| Artifact | Bytes | SHA-256 | Purpose |
| --- | ---: | --- | --- |
| [`latest.json`](https://github.com/silverlion2/quota-float/releases/download/v0.2.24/latest.json) | 3,915 | `d5a0e69341360391949354fd610112fc5704387ff7081d7a7adedf549bc9ee38` | Stable updater manifest |
| [`Quota.Float_0.2.24_x64-setup.exe`](https://github.com/silverlion2/quota-float/releases/download/v0.2.24/Quota.Float_0.2.24_x64-setup.exe) | 4,537,733 | `67133ffbb0806f2f3fd8696f8f07938ea477b02a3242365e2075744eaede9fe7` | Windows x64 NSIS installer/updater |
| [`Quota.Float_0.2.24_x64-setup.exe.sig`](https://github.com/silverlion2/quota-float/releases/download/v0.2.24/Quota.Float_0.2.24_x64-setup.exe.sig) | 424 | `7cb0893363a7e51c908dcfb1de165fac7eaa63dcdfc5b1a8be0d8d08d3ec50be` | Tauri updater signature for Windows |
| [`Quota.Float_0.2.24_universal.dmg`](https://github.com/silverlion2/quota-float/releases/download/v0.2.24/Quota.Float_0.2.24_universal.dmg) | 11,421,477 | `e75f746f10bdcc8203a190dc47f95ab7ad1da3ba1e6245f68796897a5d7a356c` | Universal macOS disk image |
| [`Quota.Float_universal.app.tar.gz`](https://github.com/silverlion2/quota-float/releases/download/v0.2.24/Quota.Float_universal.app.tar.gz) | 11,678,102 | `39937e03d22a37ff10ae4adc6622e692c44d550cbdc0efb2edef40311943e431` | Universal macOS updater archive |
| [`Quota.Float_universal.app.tar.gz.sig`](https://github.com/silverlion2/quota-float/releases/download/v0.2.24/Quota.Float_universal.app.tar.gz.sig) | 412 | `6f61629bb35c5a66db27f316a13ca2f265aa4b35e229ae4037abb7d26855741c` | Tauri updater signature for macOS |

## Remaining manual validation

Automated release success does not replace native visual/runtime validation:

- Install the public Windows package and verify the expanded dashboard, filtering, export, local budget alert, rebuild flow, and performance against representative session histories.
- Install the Universal macOS DMG on a real Apple Silicon and Intel Mac and verify transparency, menu-bar behavior, local usage scanning, exports, and updating.
- Recheck the price snapshot when OpenAI changes API pricing or new model aliases are added; displayed costs are estimates, not billing statements.
- Public artifacts have Tauri updater signatures. Windows Authenticode and macOS Developer ID/notarization remain separate and may still cause SmartScreen or Gatekeeper warnings.

See [TEST-MATRIX.md](TEST-MATRIX.md) and [KNOWN-LIMITATIONS.md](KNOWN-LIMITATIONS.md) for the pending manual checks.

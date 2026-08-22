# v0.3.0 Improvement Set

This release completes the eight-item improvement set selected from the project audit, GitHub comparison study, and current Tauri distribution guidance.

| # | Improvement | Delivered evidence |
| --- | --- | --- |
| 1 | Deterministic native desktop testing | WebdriverIO launches the compiled Tauri Windows application and exercises the native bridge, expansion, control center, accessibility, and updater dialog. |
| 2 | Provider registry | A typed registry provides stable ordering, isolated adapters, bounded concurrent collection, and descriptor-owned behavior. |
| 3 | Targeted resilience | Provider groups have bounded timeouts; only transiently failed groups are retried, so healthy providers are not requested twice. |
| 4 | Claude quota support | A read-only Claude Code OAuth adapter reads supported local credential sources, calls Anthropic's usage endpoint, and maps synthetic response fixtures without refreshing or persisting credentials. |
| 5 | Cold-start and bundle performance | Control Center and Insights are lazy-loaded; CI enforces entry, total JavaScript, gzip, and CSS budgets. |
| 6 | Native and supply-chain security | File pickers moved behind native commands, Tauri permissions were narrowed, npm/Rust advisory gates were added, and Dependabot/security workflows keep dependencies visible. |
| 7 | Provider compatibility and feedback loop | A scheduled Windows/macOS fixture workflow plus dedicated provider request and compatibility issue templates make upstream format changes actionable without collecting credentials. |
| 8 | Distribution and signing readiness | Release CI supports optional Authenticode, Developer ID, and notarization credentials, verifies configured platform signatures, discloses signing state, scans Windows artifacts, and refuses incomplete release assets. |

## Research basis

- Tauri's official [WebDriver testing guide](https://v2.tauri.app/develop/tests/webdriver/) defines the native-driver boundary used by the smoke suite.
- Tauri's official [GitHub release pipeline](https://v2.tauri.app/distribute/pipelines/github/) and [Windows](https://v2.tauri.app/distribute/sign/windows/)/[macOS](https://v2.tauri.app/distribute/sign/macos/) signing guides define the independent updater, Authenticode, Developer ID, and notarization paths.
- The repository's [competitive study](COMPETITIVE-STUDY.md) records the provider-registry, health, history, and portability patterns reviewed in comparable open-source projects.

Real provider logins, Windows display/scaling combinations, and macOS visual behavior remain platform smoke responsibilities documented in [TEST-MATRIX.md](TEST-MATRIX.md); synthetic automation must not be represented as live-account evidence.

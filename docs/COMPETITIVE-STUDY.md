# Competitive study: AI coding quota monitors

Study date: 2026-07-26

## Product question

What should Quota Float improve next while preserving its local-first, no-sidecar desktop model?

## Repositories reviewed

| Project | Relevant strengths | Boundary for Quota Float |
| --- | --- | --- |
| [CodexBar](https://github.com/steipete/CodexBar) | Mature provider registry, adaptive refresh, source fallbacks, status awareness, multi-account views, cost/history views | macOS-native Swift; breadth should not come at the cost of opaque credential access |
| [ZeroLimit](https://github.com/0xtbug/zero-limit) | Tauri dashboard, account-oriented quota cards, charts, multilingual onboarding | Depends on CLIProxyAPI; Quota Float should remain directly local-first without managing a proxy sidecar |
| [Claude Code Usage Monitor](https://github.com/CodeZeno/Claude-Code-Usage-Monitor) | Windows taskbar placement, WSL discovery, provider-specific tray badges, diagnose mode | Windows-only; platform behavior is useful, but the shared Tauri UI remains Quota Float's portability advantage |
| [usage](https://github.com/aqua5230/usage) | Offline history analysis, cost reports, burn-rate nudges, clear source disclosure | AGPL-3.0 and log-oriented; concepts only, with no source copied into this MIT project |
| [coding_agent_usage_tracker](https://github.com/Dicklesworthstone/coding_agent_usage_tracker) | Provider descriptors, source selection, doctor checks, partial-result contracts, schema tests | License includes an additional rider; architecture concepts only |

## Product review

- User truth: quota numbers are only useful when users can tell whether they are fresh, where they came from, and how to recover a failed provider.
- Existing strength: Quota Float already has adaptive refresh, last-known-good snapshots, pacing, alerts, activity history, and direct local provider adapters.
- Highest-value gap: provider-level health and source transparency are buried in individual error cards or available only for Volcengine diagnostics.
- Narrow release: add a Provider Health Center that shows every provider's state, local source, last check, history count, safe error context, and a refresh action.
- Excluded from this slice: new credential sources, a proxy sidecar, account switching, taskbar embedding, Claude support, and platform signing.
- Success: a user can diagnose every provider from one screen without exposing credentials or leaving the app.

## Engineering review

- Input: existing redacted `ProviderSnapshot[]` and bounded local history.
- UI: a new Control Center tab; no new Tauri command or network request.
- Trust boundary: messages remain the already-sanitized provider messages. Tokens, paths, account IDs, and raw responses are not added.
- Failure states: healthy, stale, checking, unavailable, sign-in required, and not-yet-checked all render explicitly.
- Recovery: one action invokes the existing forced refresh path.
- Regression coverage: component tests verify status/source rendering and the refresh callback.

## Design review

- Information hierarchy: aggregate health first, then one compact row per provider.
- State encoding: text label plus color dot; color is never the only signal.
- Accessibility: the summary uses a status role, tabs and refresh remain native buttons, and every state has readable text.
- Desktop constraint: the sixth provider row fits the existing 620x280 expanded-widget limit without adopting mobile or website navigation rules.

## Follow-up priorities

1. Authenticode signing and macOS notarization.
2. Opt-in Claude adapter with explicit source diagnostics and fixture-based parser tests.
3. Windows WSL credential discovery where it can remain read-only.
4. Provider status-page integration, only for providers with stable official endpoints.

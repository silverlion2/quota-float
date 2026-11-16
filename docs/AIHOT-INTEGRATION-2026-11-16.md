# AIHOT public quota tools

Control center -> AIHOT adds public reset reports for Codex, Claude, Antigravity and Grok Bot, plus an explicit link to AIHOT's free-credit offers. Users load reports on demand and can filter providers. No AIHOT request occurs merely by opening the application or panel.

This integrates the hosted quota tools selected by the user, without importing the unrelated AIHOT news server, database or branding. The open-source news repository excludes the hosted reset monitor. There is no documented stable free-credit catalogue API in the reviewed OpenAPI contract, so offers and claims open on the source website instead of being scraped or represented as personal balances.

## Contract and privacy

- Rust reads only four fixed `https://aihot.news/api/v1/{provider}-resets/recent` URLs with redirects disabled. No provider credentials, local paths, account values or analytics identifiers are sent.
- The command is restricted to the widget window. Responses are bounded to 256 KiB; bounded text renders as plain text. The opener capability permits only exact source page URLs.
- Cache is in memory. Requests are at least ten minutes apart and honor longer Cache-Control and Retry-After values. Conditional ETag reads reduce transfers. Sources fail independently and retain stale last-known data.
- Source verification time differs from local request time. Confirmed events retain confirmation-post time, never inferred account-reset time. Announced, in-progress, inferred completion and expired-unconfirmed reports stay distinct. Unknown scope remains unknown.
- Public events do not modify balances, reset timers, reminders or forecast probabilities. Source links preserve attribution.
- Development and UI fixtures are synthetic; live AIHOT responses are not checked into this repository or bundled in releases.

Official references checked November 16, 2026: [API contract](https://aihot.news/openapi-v1.json), [agent guide](https://aihot.news/api/v1/agent), [usage terms](https://aihot.news/terms), [credit offers](https://aihot.news/free-tokens). Terms permit noncommercial personal tools, nonprofit open-source projects and necessary private caching. This direct client is not a hosted proxy or redistributed data mirror. Code licenses do not license AIHOT's hosted data.

## Performance and validation

No runtime dependencies added. The panel stays in the existing lazy Control Center chunk. Measured growth over v0.3.36: 5,949 bytes total JS, 1,720 bytes gzip JS, 197 bytes CSS; entry JS unchanged at 234,161 bytes. Feature budgets become 628 KiB total JS, 195 KiB gzip JS, 158 KiB CSS; the 430 KiB entry limit stays unchanged.

Regression coverage includes explicit request initiation, duplicate suppression, filtering, stale/unavailable/empty states, failure retention, safe link failures, unknown eligibility, confirmation versus inference, bounded parsing, request caching, timestamps, and real WebView rendering/overflow. Execution results belong in the release receipt; this list does not imply they have run.

Rollback: reinstall v0.3.36. No persisted-state migration or account changes.

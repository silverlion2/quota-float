# AIHOT linked public information

The expanded quota view now contains a visible AIHOT entry. Control center -> AIHOT offers independent manual loading, an opt-in for linking public reports to enabled platforms, and a separate opt-in for desktop notifications. Both switches default off for existing and new installations. Once enabled, the running app checks public feeds every fifteen minutes; native ten-minute minimum caching and server backoff still apply. No provider credentials, account identifiers, quota values or local paths are sent.

## Linked behavior

- Enabled means neither hidden nor paused in platform settings. Codex, Claude and Antigravity public reset sources map directly to existing providers. Grok Bot remains available in the all-public view because the app has no personal Grok adapter.
- Fresh, actionable public messages appear as unread counts on the compact widget and as public-report items in the existing reminder center. The compact Bar/Bottleneck badge opens AIHOT directly. Expanded layouts show current-provider relevance and an entry to the full catalogue.
- Public reports have their own category and evidence text. They never modify account balances, personal reset dates, quota history or forecast probabilities. Unknown eligibility remains unknown.
- Only source-confirmed reports can produce desktop notifications. Integration, the AIHOT notification switch and the global notification switch must all be enabled; quiet hours, hidden/paused providers, read state, freshness and delivery receipts are rechecked before submission. Pending announcements remain in-app only.
- A stable event identity suppresses repeated notifications on refresh or text edits. A transition to confirmed is a new public phase. Marking reports read is persisted locally and removes their reminder/badge. Failed or expired sources stop generating signals; previously fetched messages remain visibly stale in the source panel.
- Badges/reminders track the latest 128 eligible deduplicated signals before unread filtering, so marking them read cannot expose another older batch. The source panel still displays all fetched reports. Read keys retain 256 entries; public and personal delivery receipts have separate 256-entry limits so personal activity cannot rearm a delivered public report.
- Source freshness is six hours; event/confirmation relevance is at most seven days. These are public-information validity limits, not personal quota deadlines. A source editing an old confirmation does not make it new again.

## In-app free-credit catalogue

The officially documented [free-tokens.md reader](https://aihot.news/free-tokens.md), listed by AIHOT's [agent guide](https://aihot.news/api/v1/agent), supplies in-app offer cards. The [OpenAPI contract](https://aihot.news/openapi-v1.json) did not list a JSON credit catalogue endpoint when reviewed on November 17, 2026. This replaces the link-only implementation; it does not scrape private pages or embed remote scripts.

Cards display provider, source-listed amount, cadence, instructions, supported models, eligibility, verification time and any explicit validity/deadline. Amounts remain text, with no currency conversion or addition to personal balances. Platform filtering is brand relevance only, never proof of eligibility; users can browse all catalogue providers.

Rust reads only the fixed anonymous HTTPS reader URL, without redirects, with a ten-second timeout, 512 KiB response limit and 200-offer limit. The parser checks canonical source, headings, offer counts and required fields; a format change fails visibly instead of dropping conditions. Untrusted strings render as plain text. The cache retains stale data after failure, supports ETag revalidation and respects backoff.

External claims are explicit user actions. The frontend passes an opaque offer ID to the native command, which resolves it from the current healthy cache, rejects expired offers and validates an HTTPS public-host URL. There is no arbitrary frontend URL opening capability and no automated signup or redemption. Source links retain attribution. [AIHOT terms](https://aihot.news/terms) allow noncommercial personal/open-source use and necessary private caching; this app is not a hosted redistribution proxy. Actual catalogue records are neither bundled nor checked into source control.

## Verification and rollback

Tests cover opt-in scheduling, single-flight loading, stale preservation, independent source failures, time expiry, platform mapping, read-state persistence, per-phase deduplication, notification delivery boundaries, untrusted catalogue parsing and external navigation. Native WebView tests use synthetic records, not real account data. Current execution counts, screenshots and release artifact verification belong in the release receipt.

Rollback uses the preceding public installer. New preferences and read keys are additive; no account/storage migration is performed. Older versions ignore the new fields. OS-level signing limitations remain unchanged.

## Bundle allocation

No runtime dependencies were added. The catalogue stays in the lazy control-center chunk; shared signal/refresher logic is available to compact and expanded views. The first production measurement grew total JS by 16,856 B, gzip JS by 5,263 B and CSS by 4,517 B against v0.3.37; entry JS grew 8,254 B. The deliberately allocated feature limits are 650 KiB total JS, 202 KiB gzip JS and 164 KiB CSS; the entry limit remains 430 KiB. Final measured sizes belong in the release receipt.

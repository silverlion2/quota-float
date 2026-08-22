# Privacy

Quota Float is designed to be local-first and minimal.

## What It Reads

- Codex quota: reads the local Codex Desktop login file and sends the existing credential only to Codex quota endpoints.
- Claude quota: reads the existing Claude Code OAuth credential from the supported local credential store and sends it only to Anthropic's usage endpoint. Quota Float never refreshes or rewrites that credential.
- Codex Token insights: scans bounded local Codex session JSONL files but deserializes only session metadata needed for a project basename and normalized terminal category, `turn_context` model names, and numeric `token_count` metadata. Prompt, response, tool payload, full working-directory, account, and raw session identifiers are not retained or returned to the UI. Oversized and non-metadata records are discarded.
- Qoder: decrypts the existing Electron account cache for the current Windows user and reads its cached remaining quota.
- TRAE: decrypts the existing local TRAE login state for the current Windows user and sends the token only to TRAE's quota endpoint.
- WorkBuddy: decrypts the existing Electron login state for the current Windows user and sends it only to WorkBuddy's quota endpoint.
- Volcengine: invokes the installed Ark CLI in read-only mode with `arkcli usage plan --product coding-plan --format json`; Ark CLI retains control of its authentication.
- Antigravity: discovers the running local Antigravity language server and reads its CSRF-protected quota status over loopback. Quota Float does not read or store the Google OAuth token.

## What It Stores

Quota Float stores only local application state in its own application config directory:

- locked state
- always-on-top state
- pinned provider
- auto-rotate interval
- provider ordering, visibility, condensed rows, colors, and saved layout profiles
- notification thresholds, quiet hours, cooldowns, and update-channel preferences
- a bounded timeline of quota percentages or balances, provider status changes, and detected reset/recovery events
- rotating settings/history recovery points created before updates
- a versioned incremental Codex usage index containing SHA-256 file identities and cursors, hourly numeric aggregates, project basenames, normalized terminal categories, and one-way hashed session keys

The Codex Token index is stored separately in Quota Float's application config directory so unchanged files do not need to be reread after restart. It contains no prompt/response text, tool names or payloads, full working directories, raw session IDs, account data, or raw JSONL records. It is not included in runtime-state recovery backups, diagnostics, or logs. A manual rebuild replaces it from the bounded local source scan.

Backups exported by the user contain the same local application state. They do not contain provider tokens, account IDs, raw quota responses, user prompts, chat history, or provider authentication paths.

Usage exports are explicit user actions. CSV and JSON aggregate data without exporting hashed session keys and replace project labels with `Project N`; the SVG card contains only summary metrics. None of these exports include prompts, responses, tool names, paths, account data, or raw records.

## What It Sends

The app only calls these quota-related HTTPS endpoints from the local desktop process:

- `https://chatgpt.com/backend-api/wham/usage`
- `https://chatgpt.com/backend-api/wham/rate-limit-reset-credits`
- `https://api.anthropic.com/api/oauth/usage`
- `https://api.trae.cn/trae/api/v2/pay/ide_user_ent_usage`
- `https://copilot.tencent.com/v2/billing/meter/get-user-resource`
- `https://copilot.tencent.com/v2/billing/meter/get-enterprise-user-usage`

Qoder and Antigravity collection are local-only. Volcengine network requests are made by the user's installed Ark CLI.

No telemetry, analytics, crash reporting, or third-party tracking is included.

Token cost estimates use a versioned offline price catalog with a visible source date. Monthly budget forecasts and alerts are calculated locally. Quota Float does not call a billing API or send local Token counts anywhere. Opening the pricing-source link is an explicit user action.

## Logging

Logs are intentionally generic. They must not include tokens, account IDs, raw backend responses, request headers, local auth paths, or personal file paths.

## Accuracy Boundary

Quota Float displays quota returned by provider services, local account caches, or Ark CLI. It does not estimate quota from local Token usage and does not fabricate values when the response shape is unknown.

Token counts are available only when Codex exposes supported numeric metadata. The displayed cost is an API-equivalent estimate, not a Codex subscription bill or proof of actual API charges. Unknown models remain unpriced and reduce the displayed pricing coverage instead of inheriting a guessed rate.

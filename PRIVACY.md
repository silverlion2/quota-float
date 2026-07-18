# Privacy

Quota Float is designed to be local-first and minimal.

## What It Reads

- Codex: reads the local Codex Desktop login file and sends the existing token only to Codex quota endpoints.
- Qoder: decrypts the existing Electron account cache for the current Windows user and reads its cached remaining quota.
- TRAE: decrypts the existing local TRAE login state for the current Windows user and sends the token only to TRAE's quota endpoint.
- WorkBuddy: decrypts the existing Electron login state for the current Windows user and sends it only to WorkBuddy's quota endpoint.
- Volcengine: invokes the installed Ark CLI in read-only mode with `arkcli usage plan --product coding-plan --format json`; Ark CLI retains control of its authentication.

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

Backups exported by the user contain the same local application state. They do not contain provider tokens, account IDs, raw quota responses, user prompts, chat history, or provider authentication paths.

## What It Sends

The app only calls these quota-related HTTPS endpoints from the local desktop process:

- `https://chatgpt.com/backend-api/wham/usage`
- `https://chatgpt.com/backend-api/wham/rate-limit-reset-credits`
- `https://api.trae.cn/trae/api/v2/pay/ide_user_ent_usage`
- `https://copilot.tencent.com/v2/billing/meter/get-user-resource`
- `https://copilot.tencent.com/v2/billing/meter/get-enterprise-user-usage`

Qoder collection is local-only. Volcengine network requests are made by the user's installed Ark CLI.

No telemetry, analytics, crash reporting, or third-party tracking is included.

## Logging

Logs are intentionally generic. They must not include tokens, account IDs, raw backend responses, request headers, local auth paths, or personal file paths.

## Accuracy Boundary

Quota Float displays quota returned by provider services, local account caches, or Ark CLI. It does not estimate quota from local token usage and does not fabricate values when the response shape is unknown.

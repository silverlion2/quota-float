# Actionable reminders — 2026-10-31

Quota Float now keeps a priority action queue instead of relying only on threshold-crossing events. A fresh observation already below the quota threshold is eligible on launch. Expiring reset cards and known credit grants are checked on snapshot changes, every 30 seconds, and when the app regains focus or visibility.

## What to do next

- Expiry stages: 7 days / 24 hours / 6 hours / 1 hour / 15 minutes. Their repeat intervals are 24 hours / 6 hours / 2 hours / 30 minutes / 10 minutes. Stage identity includes provider, pool and normalized deadline, so escalation bypasses an earlier stage's receipt or snooze.
- The main panel shows the most urgent unsnoozed action across all monitored providers, with an expandable bounded queue. Compact Float/Ring/Bar/Bottleneck views mark pending warning/critical actions even when a different provider is selected.
- Codex actions open the exact allowlisted `https://chatgpt.com/settings/usage` URL. Other providers show their next steps in the health panel. Refresh-only stale expiry actions request a new snapshot.
- “Remind later” lasts at most 15 minutes and at most half the remaining time. Snoozes survive restarts and do not remove the action from the full queue. “Action taken · refresh to confirm” fetches current provider data; opening settings does not claim success or spend a reset.
- Reset/recovery and pace notifications retain their existing controls. Persistent low-quota delivery replaces duplicate crossing-only desktop notifications, while crossings remain in local history.

## Source and eligibility boundaries

The [official reset instructions](https://help.openai.com/en/articles/20001498-how-resets-work-in-codex), checked 2026-10-31, say to review available banked resets in desktop Settings → Usage & billing, web Usage settings, or CLI `/usage` → Redeem reset. A covered allowance must be below 80% for manual redemption; coverage varies by plan. Therefore alerts direct users to review eligibility rather than infer it from any one low window. The app never invokes redemption, purchases or account mutations.

The current usage URL follows [OpenAI's merged URL update](https://github.com/openai/codex/pull/49874). No wildcard opener permission or paid-credit modal was added.

Only provider-reported future expiry timestamps are used. Unknown expiry remains unknown; a quota reset is not credit expiry. A dated grant with unknown balance is explicitly a verification task, because positive aggregate credits do not prove that particular grant still holds funds. Zero/invalid amounts, expired deadlines and unlimited balances do not generate funded-expiry claims.

Healthy numeric advice requires data no older than 20 minutes. When retained data is stale, a known upcoming expiry remains a refresh-first verification reminder, without implying the reset or balance is still available. Paused providers are excluded. Hiding a provider does not pause its reminders.

## Delivery and controls

- Desktop notifications respect the master switch and app quiet hours. The separate expiry switch affects desktop delivery; visible action items remain.
- A new, default-off option permits final-hour expiry reminders during app quiet hours. It cannot override the operating system's Do Not Disturb.
- Permission failures keep the action visible and do not write a delivery receipt. The Alerts tab includes a test button that requests permission and reports submission status. “Submitted” is not proof a banner was displayed or read.
- Delivery attempts are deduplicated in flight, failed attempts retry with a bounded delay, and completion merges current runtime state to preserve concurrent history/snooze updates. Delivery receipts and snoozes are locally bounded.
- The app must be running. No promise is made of notifications after exit, shutdown, or while the OS suspends execution. Reopening evaluates still-valid actions from available data.
- Synthetic browser/native E2E fixtures never send real system notifications.

## Acceptance

No runtime dependencies were added. The new queue, timer and delivery policy deliberately change the total JavaScript budget from 600 to 620 KiB, gzip JavaScript from 182 to 190 KiB and CSS from 150 to 154 KiB. The 430 KiB entry budget remains unchanged; measured output is checked by the existing bundle gate.

Unit coverage includes stage boundaries, unknown grant balances, stale refresh-only actions, startup without previous samples, quiet hours, permission failure/retry, configured cooldown, concurrent runtime updates, consumed-card removal and restart-safe bounded snoozes. UI coverage includes queue controls, three compact attention markers and native scroll/persistence checks. Native screenshots and final gate results are recorded under `output/action-alerts-20261031/` after completion.

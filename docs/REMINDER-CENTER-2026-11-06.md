# Reminder center — 2026-11-06

This iteration deepens the existing quota, reset-card and credits workflow. It adds no provider, account write API, telemetry, dependency or external notification service.

## External references checked

These are observable product implementations, not claims about revenue or commercial success.

- [OpenUsage settings](https://github.com/robinebers/openusage/blob/main/docs/settings.md): its Use It or Lose It reminder highlights long quota windows resetting within 24 hours with more than half remaining, once per metric/cycle. Quota Float adopts a conservative version for explicitly reported weekly/monthly windows longer than a day. A reset timestamp does not establish a provider's rollover rules; the UI invites planning existing tasks, never manufacturing consumption.
- [CodexBar UI](https://github.com/steipete/CodexBar/blob/main/docs/ui.md) and [pace warning request](https://github.com/steipete/CodexBar/issues/1299): compare actionable, proactive guidance and evidence-aware pace. Quota Float retains its existing sample/freshness gates rather than presenting a new estimate as official quota.
- [Claude Code Usage Monitor](https://github.com/Maciek-roboblog/Claude-Code-Usage-Monitor): distinguish fresh reported limits from local observations and estimates. Our action cards expose amount, exact date, and expandable evidence; unknown grant balances remain unknown.
- [ccusage live monitoring](https://ccusage.com/guide/live-monitoring): explicitly removed in v18; its old live screen is historical reference, not evidence of a current maintained capability.

## User-visible behavior

- The action center separates urgent, pending and snoozed items, with All / Expiry / Quota / Later filters. Primary action, amount and exact deadline stay visible; longer evidence is expandable. Snoozed items can resume immediately.
- Every distinct known expiry within seven days appears. Equal deadlines are grouped within a provider and resource type. Only known positive credits for that date contribute to the amount; unknown parts are disclosed. Reset count is not assigned to individual dates without source evidence.
- A fresh weekly/monthly quota above 50%, resetting within 24 hours, creates a planning opportunity. It sends once per cycle, has its own notification switch, and never bypasses quiet hours. Short session windows are excluded. User-requested snooze/resume can request another reminder.
- Due reminders arriving together are submitted as one prioritized OS summary, showing the total and up to three titles with a View all prompt for the remainder. Each included candidate receives a receipt only after successful native submission. A newly due candidate during an in-flight submission is rechecked immediately when it finishes, instead of waiting until its deadline. Failed submissions retain their retry backoff.
- Local observation history is independent of native notifications: at most 128 records, with the latest 20 closed items visible. Escalation and stale/fresh transitions keep a stable batch identity. Clock passage says the recorded deadline passed and use needs checking. Only a newer healthy snapshot can mark a missing candidate no longer observed; this does not prove redemption or consumption. Missing/stale/paused sources cannot prove resolution.

## Boundaries and compatibility

Provider credentials remain read-only inside Rust. Native submission success does not prove a visible OS banner or user acknowledgement. App shutdown and OS quiet settings still limit delivery. Synthetic browser and native E2E fixtures never submit real notifications.

Runtime schema 2 accepts the optional bounded history, preserving older state. Old preferences default the planning reminder on, while retaining the user's existing master switch and quiet settings. No observation heartbeat is written every 30 seconds. Records store only existing sanitized reminder content, not auth material.

The application currently observes one active account per provider. Provider switches between accounts do not yet partition quota history, snoozes and receipts by account identity. This release does not claim multi-account isolation; implementing that requires a stable privacy-preserving identity across adapters and history migration.

## Verification and release

The entry JavaScript budget remains 430 KiB and total JavaScript remains 620 KiB. After merging duplicate styles, the independent reminder history, grouped delivery and filtered action center require a small explicit budget change: gzip JavaScript 190 → 193 KiB, CSS 154 → 157 KiB. No dependencies were added; the final production measurements are checked against these limits.

Targeted tests cover distinct/duplicate deadlines, partial grant amounts, invalid dates/numbers, the 24h and >50% boundaries, short-window exclusion, batch failures, two resources expiring in 15 seconds, candidates arriving during native submission, snooze/resume, independent settings, history bounds and old-state normalization. Native tests verify filtered queues, restored reminders and persisted observation history. Exact full gate results and public release identity are recorded in `output/deep-reminders-20261106/FINAL-REPORT.md` after release verification.

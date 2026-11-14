# Provider health and recovery — 2026-11-15

This update makes provider recovery actionable in the control center and keeps frontend and native last-known-good behavior consistent. It preserves the existing React/Tauri architecture and adds no application dependencies.

## User-visible changes

- Filter all providers, providers needing attention, or paused providers. Counts are based on provider identity; an in-flight check is neither a success nor a failure.
- Check one provider, retry affected active providers, or refresh all. A full manual refresh requested during a targeted check is queued after it. Paused providers are excluded from requests.
- Resume monitoring directly from a paused provider card. Resuming clears that source's old cooldown so the scheduler can check it promptly.
- Show the next automatic check, current progress, last attempt time, and original quota-data time separately. Guidance wraps instead of disappearing behind an ellipsis.
- Transient network-provider failures retry after 1, 2, 4, 8, 16, then 30 minutes in Balanced mode. Focus uses 5, 10, 20, 40, then 60 minutes. Success resets the streak. Signed-out and never-detected sources keep their existing attention intervals; process-backed Qoder, Ark CLI and Antigravity retain conservative polling.

## Native and data boundaries

- Coordinated Tauri API/CLI/runtime and updater upgrades remove the old vulnerable ZIP dependency. SQLite, TLS, certificate roots and QUIC dependencies are refreshed against RustSec. The release workflow audits the native lockfile before creating a release. See [dependency policy](DEPENDENCY-POLICY.md) for versions and retained upstream warnings.

- Each provider has a 20-second total collection budget including same-cycle retries, in addition to its existing per-attempt timeout. Other providers publish their results independently.
- If a previously detected source disappears, valid old data remains visibly stale in both the main window and native cache. Zero balances count as valid data. Neither quota timestamps nor native cache age are advanced by a failed check.
- An explicit signed-out response clears retained quota. A transport failure cannot turn an existing signed-out state into a stale-success display. A first failure without quota is unavailable, not stale.
- Progressive results with mismatched provider identity are rejected before consuming the completion slot. Late/duplicate results retain the existing request-identity protection.
- Credentials remain read-only inside `src-tauri`. Health UI receives only existing sanitized snapshots and in-memory scheduling metadata. No new endpoint, credential export, account mutation, or persistent schema is introduced.

## Verification and rollback

Regression coverage includes targeted/full request ordering, pause/resume, identity validation, disappearing sources, zero balances, sign-out boundaries, independent retry clocks, total native time budgets, and accessible health controls. The native E2E flow checks health filtering, per-provider actions, guidance wrapping and horizontal overflow using synthetic data.

Exact publication status and artifact evidence are owned by [GitHub Releases](https://github.com/silverlion2/quota-float/releases) and [Release Actions](https://github.com/silverlion2/quota-float/actions/workflows/release.yml). The local receipt is retained under `output/release-v0.3.35/`. Browser fixtures do not validate live provider accounts. Windows automation and macOS CI packaging do not prove the full real-Mac or multi-monitor manual matrix.

The development/release checkout is on E: because D: was below the 10 GiB native-build threshold. Existing D: workspace edits and caches remain intact. No destructive cleanup was performed.

Rollback: reinstall the previous published v0.3.34 installer. This change adds no persisted data migration; existing settings, layouts and history stay compatible. Retry streaks reset on app restart.

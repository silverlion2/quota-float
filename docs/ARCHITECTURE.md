# Quota Float Architecture

## System boundary

Quota Float is a local-first Tauri desktop application. React renders the widget and owns presentation state; Rust owns provider credential access, persistence, native window geometry, tray behavior, notifications, and update integration. Browser development uses synthetic snapshots and never reads a real provider session.

## Runtime layers

| Layer | Primary files | Responsibility |
| --- | --- | --- |
| Presentation | `src/App.tsx`, `src/components/*`, `src/styles.css` | Distinct compact/expanded layouts, full-catalog provider selection, alerts, status center, accessibility, responsive themes |
| Frontend domain | `src/lib/*` | Preference/runtime normalization, quota pace, forecast planning safeguards, reset detection, history, update state, last-known-good merging |
| Desktop bridge | `src/lib/bridge.ts` | Typed Tauri commands/events, serialized writes, drag stability detection, browser mocks |
| Native orchestration | `src-tauri/src/lib.rs`, `src-tauri/src/models.rs`, `src-tauri/src/codex_usage.rs` | Commands, window state, physical-pixel geometry, persistence, bounded local Token aggregation, backups, tray, lifecycle |
| Provider registry | `src-tauri/src/provider_registry.rs` | Stable ordering, selected-provider collection, adapter timeouts, bounded transient retries, and the shared outbound snapshot conformance boundary |
| Provider adapters | `src-tauri/src/{codex,claude,qoder,trae,workbuddy,volcengine,antigravity}.rs` | Read-only discovery, request/parsing, provider-specific error isolation |
| Public reset outlook | `src-tauri/src/reset_forecast.rs`, `src/lib/quotaPace.ts`, `src-tauri/capabilities/default.json` | Fixed-origin public forecast collection, freshness/schema validation, robust consensus, timed-announcement handling, conservative planning integration, and source-link allowlisting |

## Repository structure

| Path | Ownership and contents |
| --- | --- |
| `src/components/` | React surfaces and interaction boundaries: compact/expanded quota cards, full provider switcher, Control Center tabs, Insights, diagnostics, and update UI |
| `src/lib/` | Browser-safe domain logic, typed bridge calls, refresh/pace policy, history, preferences, pricing, exports, and synthetic preview data |
| `src-tauri/src/` | Native-only credential access, provider adapters, public reset aggregation, persistence, geometry, notifications, tray, updater, and sanitized Codex indexing |
| `src-tauri/capabilities/` and `src-tauri/gen/schemas/` | Auditable Tauri permission source plus generated capability schema; capability changes must keep these synchronized |
| `scripts/` | Version/release helpers, bundle budgets, compatibility checks, Windows Defender verification, and release automation tests |
| `.github/workflows/` | CI, provider compatibility, security, release/publish, signing, and upgrade-smoke orchestration |
| `docs/` | Desktop SOP, architecture, project baseline/history, test matrix, distribution guidance, and immutable per-version release evidence |
| `assets/` and `docs/images/` | Application icons and user-facing documentation screenshots |

## Data flow

1. React computes which unpaused providers are due from independent attempt clocks, health state, and the selected resource mode, then requests only that subset through `bridge.ts`.
2. A Tauri command asks the provider registry to refresh the selected isolated Rust adapters concurrently under a shared refresh lock and bounded cache. Transiently failed network/file adapters receive bounded same-cycle retries; Volcengine and Antigravity do not, because their probes spawn external processes.
3. The provider registry normalizes every outbound `ProviderSnapshot`: descriptor-owned identity, allowlisted status, finite/clamped quota values, bounded text/list payloads, parseable timestamps, empty failure payloads and redacted diagnostics. Rust returns only those conformed values without exposing credentials or raw provider payloads.
4. React merges partial results with last-known-good values, derives pace/reset events, and persists bounded runtime history only when the persistable state changes. Detailed quota samples use a rolling 90-day local memory; daily usage summaries retain 365 days, with lifetime sample metadata surviving pruning.
5. Rendering selects Float, Ring, or Bar for compact mode and one of three expanded layouts.

Balanced mode refreshes healthy providers on a five-minute cadence, fast-reset or critical providers every minute, and unavailable providers with a thirty-minute cooldown. Project Focus mode stretches those intervals to fifteen, five, and sixty minutes, disables provider auto-rotation and ambient infinite animation, while manual refresh remains available.

The Insights tab lazily requests a separate 90-day Codex Token report. Rust streams bounded local session files, skips oversized/content records without deserializing them, and persists a sanitized, versioned per-file cursor index in the application config directory. Index entries use full SHA-256 file identities rather than relative paths or raw filenames. Unchanged files reuse indexed aggregates; append-only files resume from the saved byte cursor; truncation, metadata changes, or a manual rebuild reparses the affected scope. The UI receives only hourly numeric aggregates grouped by model, context tier, project basename, normalized terminal category, and a one-way hashed session key.

React applies range and dimension filters, derives session/activity/cache metrics, and evaluates each model against the versioned standard-API price catalog in `src/lib/openaiPricing.ts`. It then builds comparisons, charts, per-model cost rows, and a local monthly budget outlook. CSV/JSON exports aggregate away session keys and alias projects; the SVG share card exports summary metrics only. Native export writes only an explicitly selected `.csv`, `.json`, or `.svg` target.

Provider failures are partial: one unavailable adapter must not erase healthy providers. A transient failure retains the last valid value with a stale status; signed-out and malformed responses receive explicit non-secret errors. Unknown statuses and `ok` snapshots without measurable quota fail closed to `unavailable` before crossing the desktop bridge.

## Public Codex reset outlook flow

The global reset outlook is informational and remains separate from the personal quota reset time reported by Codex:

1. When Codex is included in a refresh, `App.tsx` requests quota snapshots and the public reset outlook in parallel.
2. `reset_forecast.rs` concurrently reads three fixed unauthenticated JSON endpoints—Codex Reset, Codex Reset Radar, and Will Codex Reset Today—under a five-second overall boundary. Each response is capped at 128 KiB; the shared native HTTP client disables redirects and sends no provider credential, account identifier, quota value, or local Token count.
3. Each source must expose a 48-hour forecast and a timestamp no older than six hours. Fresh scores are normalized to `0…100`; the displayed score is their median so one lagging or extreme tracker cannot dominate.
4. Confidence is derived from source count and score spread. A fresh explicitly timed announcement takes priority and contributes its published time-window midpoint as `expectedAt`; otherwise materially disagreeing or single-source results remain low-confidence.
5. React exposes the source list/count and confidence. Quota planning retains the provider-reported personal `resetsAt` when the outlook is low-confidence or uncorroborated. A corroborated medium/high-confidence probability may produce a bounded probability-weighted planning horizon, while a fresh exact announcement supersedes that estimate only when it precedes the personal reset.

Failure is fail-closed: stale, malformed, oversized, redirected, timed-out, or unexpected-window responses are discarded independently. If no valid source remains, no public outlook is shown and provider quota collection continues unaffected.

## Preferences and recovery

`WidgetPreferences` is normalized independently in TypeScript and Rust. Missing fields receive safe defaults, provider order is deduplicated/completed, numeric values are bounded, and unknown enum values fall back to supported values. Resource mode and paused-provider IDs use the same cross-language normalization; at least one provider remains monitored.

Bar placement is stored as:

```ts
type BarEdge = "top" | "left" | "right";
type BarPlacement = { edge: BarEdge; offset: number };
```

Legacy preferences and saved layouts migrate to `{ edge: "top", offset: 0.5 }`. The same fields flow through layout profiles, export/import, and automatic recovery backups. Before state is applied, the backup envelope must be a plain object with plain settings/history sections; malformed arrays and unsupported future schema versions are rejected, while schema-less legacy backups map to schema 1. Runtime history schema 1 migrates to schema 2 by deriving local-memory coverage metadata from existing samples. Credential material is never part of those files.

## Window geometry

Window geometry is calculated in Rust physical pixels from the active monitor and the current usable work area:

- Float/Ring visual size: `92×92` logical pixels.
- Top Bar: `400×38` logical pixels.
- Left/Right Bar: `64×320` logical pixels.
- Transparent safe inset: 4 logical pixels around the visual surface.
- Magnetic zone: 24 logical pixels from Top, Left, or Right; Bottom is unsupported.

The Bar stores a normalized along-edge offset rather than an absolute position. Collapse recomputes the attached position for the current work area. Expansion uses the same edge/offset with the larger dashboard size, opens inward, and clamps to the work area. Content-driven height changes recalculate from that anchor. Dragging an expanded dashboard records only temporary expanded movement and does not alter Bar placement.

The bridge waits for native drag position stability, asks Rust to resolve the edge and offset, then returns the placement to React for persistence through the normal preference-write queue.

## Security invariants

- Provider credential access remains inside `src-tauri`.
- Credentials go only to the corresponding official provider endpoint or a documented loopback-only local service.
- Provider credentials, account identifiers, auth paths, prompts, chats, raw session records, and raw provider responses are neither persisted nor included in diagnostics. Only the documented sanitized Token cursor/index is persisted locally.
- Provider snapshot diagnostics are bounded and reject raw JSON, credential markers and user-directory paths at the shared registry boundary.
- Provider reads are non-mutating: no reset redemption, account updates, or provider configuration writes.
- Public reset-outlook requests are unauthenticated reads to three fixed HTTPS origins and never receive provider credentials, account data, quota values, or local Token counts.
- Import/export file selection is native-owned; the webview never supplies arbitrary filesystem paths.
- Browser preview and tests use synthetic or fixture data.

See `PRIVACY.md`, `SECURITY.md`, and `docs/DESKTOP-DEVELOPMENT-SOP.md` for the complete operational boundary.

## Verification architecture

- TypeScript pure-function tests cover migration, clamping, pace, reset/history behavior, price calculation, filtering, budget forecasting, and anonymized exports.
- Component tests cover compact/expanded layout differentiation, themes, the seven-provider pointer/keyboard switcher, Control Center tabs, Insights behavior, accessibility, hover timing and saved layouts.
- Bridge tests cover command payloads, serialized writes and drag-result persistence.
- Rust tests cover provider parsing, the shared adapter conformance contract, preference normalization, bounded/incremental Token indexing, multi-monitor/DPI/work-area geometry, and a deterministic taskbar/display-removal lifecycle fixture.
- Reset-outlook tests cover live response shapes, freshness and window rejection, robust median consensus, confidence, and timed-announcement priority; TypeScript tests cover conservative planning fallbacks.
- A scheduled Windows/macOS compatibility workflow runs every provider's synthetic fixtures without credentials.
- Native WebDriver smoke tests launch the compiled Windows application and exercise the Tauri bridge and primary overlays.
- Production builds enforce JavaScript/CSS size budgets after lazy-loading secondary panels.
- The desktop fast handoff gate adds production build, Rust formatting, `check`, strict `clippy`, and diff validation.
- Real Windows/macOS smoke tests remain necessary for WebView transparency, native dragging, always-on-top, pointer pass-through and tray/menu behavior.

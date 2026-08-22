# Quota Float Architecture

## System boundary

Quota Float is a local-first Tauri desktop application. React renders the widget and owns presentation state; Rust owns provider credential access, persistence, native window geometry, tray behavior, notifications, and update integration. Browser development uses synthetic snapshots and never reads a real provider session.

## Runtime layers

| Layer | Primary files | Responsibility |
| --- | --- | --- |
| Presentation | `src/App.tsx`, `src/components/*`, `src/styles.css` | Compact/expanded layouts, provider selection, alerts, status center, accessibility, themes |
| Frontend domain | `src/lib/*` | Preference/runtime normalization, quota pace, reset detection, history, update state, last-known-good merging |
| Desktop bridge | `src/lib/bridge.ts` | Typed Tauri commands/events, serialized writes, drag stability detection, browser mocks |
| Native orchestration | `src-tauri/src/lib.rs`, `src-tauri/src/models.rs`, `src-tauri/src/codex_usage.rs` | Commands, window state, physical-pixel geometry, persistence, bounded local Token aggregation, backups, tray, lifecycle |
| Provider registry | `src-tauri/src/provider_registry.rs` | Stable ordering, selected-provider collection, adapter timeouts, and bounded transient retries for non-process-spawning adapters |
| Provider adapters | `src-tauri/src/{codex,claude,qoder,trae,workbuddy,volcengine,antigravity}.rs` | Read-only discovery, request/parsing, provider-specific error isolation |

## Data flow

1. React computes which unpaused providers are due from independent attempt clocks, health state, and the selected resource mode, then requests only that subset through `bridge.ts`.
2. A Tauri command asks the provider registry to refresh the selected isolated Rust adapters concurrently under a shared refresh lock and bounded cache. Transiently failed network/file adapters receive bounded same-cycle retries; Volcengine and Antigravity do not, because their probes spawn external processes.
3. Rust returns normalized `ProviderSnapshot` values without exposing credentials or raw provider payloads.
4. React merges partial results with last-known-good values, derives pace/reset events, and persists bounded runtime history only when the persistable state changes. Detailed quota samples use a rolling 90-day local memory; daily usage summaries retain 365 days, with lifetime sample metadata surviving pruning.
5. Rendering selects Float, Ring, or Bar for compact mode and one of three expanded layouts.

Balanced mode refreshes healthy providers on a five-minute cadence, fast-reset or critical providers every minute, and unavailable providers with a thirty-minute cooldown. Project Focus mode stretches those intervals to fifteen, five, and sixty minutes, disables provider auto-rotation and ambient infinite animation, while manual refresh remains available.

The Insights tab lazily requests a separate 90-day Codex Token report. Rust streams bounded local session files, skips oversized/content records without deserializing them, and persists a sanitized, versioned per-file cursor index in the application config directory. Index entries use full SHA-256 file identities rather than relative paths or raw filenames. Unchanged files reuse indexed aggregates; append-only files resume from the saved byte cursor; truncation, metadata changes, or a manual rebuild reparses the affected scope. The UI receives only hourly numeric aggregates grouped by model, context tier, project basename, normalized terminal category, and a one-way hashed session key.

React applies range and dimension filters, derives session/activity/cache metrics, and evaluates each model against the versioned standard-API price catalog in `src/lib/openaiPricing.ts`. It then builds comparisons, charts, per-model cost rows, and a local monthly budget outlook. CSV/JSON exports aggregate away session keys and alias projects; the SVG share card exports summary metrics only. Native export writes only an explicitly selected `.csv`, `.json`, or `.svg` target.

Provider failures are partial: one unavailable adapter must not erase healthy providers. A transient failure retains the last valid value with a stale status; signed-out and malformed responses receive explicit non-secret errors.

## Preferences and recovery

`WidgetPreferences` is normalized independently in TypeScript and Rust. Missing fields receive safe defaults, provider order is deduplicated/completed, numeric values are bounded, and unknown enum values fall back to supported values. Resource mode and paused-provider IDs use the same cross-language normalization; at least one provider remains monitored.

Bar placement is stored as:

```ts
type BarEdge = "top" | "left" | "right";
type BarPlacement = { edge: BarEdge; offset: number };
```

Legacy preferences and saved layouts migrate to `{ edge: "top", offset: 0.5 }`. The same fields flow through layout profiles, export/import, and automatic recovery backups. Runtime history schema 1 migrates to schema 2 by deriving local-memory coverage metadata from existing samples. Credential material is never part of those files.

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
- Provider reads are non-mutating: no reset redemption, account updates, or provider configuration writes.
- Import/export file selection is native-owned; the webview never supplies arbitrary filesystem paths.
- Browser preview and tests use synthetic or fixture data.

See `PRIVACY.md`, `SECURITY.md`, and `docs/DESKTOP-DEVELOPMENT-SOP.md` for the complete operational boundary.

## Verification architecture

- TypeScript pure-function tests cover migration, clamping, pace, reset/history behavior, price calculation, filtering, budget forecasting, and anonymized exports.
- Component tests cover compact/expanded layouts, themes, provider selection, Insights tab behavior, accessibility, hover timing and saved layouts.
- Bridge tests cover command payloads, serialized writes and drag-result persistence.
- Rust tests cover provider parsing, preference normalization, bounded/incremental Token indexing, and multi-monitor/DPI/work-area geometry.
- A scheduled Windows/macOS compatibility workflow runs every provider's synthetic fixtures without credentials.
- Native WebDriver smoke tests launch the compiled Windows application and exercise the Tauri bridge and primary overlays.
- Production builds enforce JavaScript/CSS size budgets after lazy-loading secondary panels.
- The desktop fast handoff gate adds production build, Rust formatting, `check`, strict `clippy`, and diff validation.
- Real Windows/macOS smoke tests remain necessary for WebView transparency, native dragging, always-on-top, pointer pass-through and tray/menu behavior.

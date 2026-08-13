# Quota Float Architecture

## System boundary

Quota Float is a local-first Tauri desktop application. React renders the widget and owns presentation state; Rust owns provider credential access, persistence, native window geometry, tray behavior, notifications, and update integration. Browser development uses synthetic snapshots and never reads a real provider session.

## Runtime layers

| Layer | Primary files | Responsibility |
| --- | --- | --- |
| Presentation | `src/App.tsx`, `src/components/*`, `src/styles.css` | Compact/expanded layouts, provider selection, alerts, status center, accessibility, themes |
| Frontend domain | `src/lib/*` | Preference/runtime normalization, quota pace, reset detection, history, update state, last-known-good merging |
| Desktop bridge | `src/lib/bridge.ts` | Typed Tauri commands/events, serialized writes, drag stability detection, browser mocks |
| Native orchestration | `src-tauri/src/lib.rs`, `src-tauri/src/models.rs` | Commands, window state, physical-pixel geometry, persistence, backups, tray, lifecycle |
| Provider adapters | `src-tauri/src/{codex,qoder,trae,workbuddy,volcengine,antigravity}.rs` | Read-only discovery, request/parsing, provider-specific error isolation |

## Data flow

1. React requests snapshots through `bridge.ts`.
2. A Tauri command refreshes isolated Rust provider adapters under a shared refresh lock and bounded cache.
3. Rust returns normalized `ProviderSnapshot` values without exposing credentials or raw provider payloads.
4. React merges new values with last-known-good values, derives pace/reset events, and persists bounded runtime history.
5. Rendering selects Float, Ring, or Bar for compact mode and one of three expanded layouts.

Provider failures are partial: one unavailable adapter must not erase healthy providers. A transient failure retains the last valid value with a stale status; signed-out and malformed responses receive explicit non-secret errors.

## Preferences and recovery

`WidgetPreferences` is normalized independently in TypeScript and Rust. Missing fields receive safe defaults, provider order is deduplicated/completed, numeric values are bounded, and unknown enum values fall back to supported values.

Bar placement is stored as:

```ts
type BarEdge = "top" | "left" | "right";
type BarPlacement = { edge: BarEdge; offset: number };
```

Legacy preferences and saved layouts migrate to `{ edge: "top", offset: 0.5 }`. The same fields flow through layout profiles, export/import, and automatic recovery backups without changing the existing schema version. Credential material is never part of those files.

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
- Tokens, account identifiers, auth paths, prompts, chats, and raw provider responses are neither persisted nor included in diagnostics.
- Provider reads are non-mutating: no reset redemption, account updates, or provider configuration writes.
- Browser preview and tests use synthetic or fixture data.

See `PRIVACY.md`, `SECURITY.md`, and `docs/DESKTOP-DEVELOPMENT-SOP.md` for the complete operational boundary.

## Verification architecture

- TypeScript pure-function tests cover migration, clamping, pace, reset and history behavior.
- Component tests cover compact/expanded layouts, themes, provider selection, accessibility, hover timing and saved layouts.
- Bridge tests cover command payloads, serialized writes and drag-result persistence.
- Rust tests cover provider parsing, preference normalization and multi-monitor/DPI/work-area geometry.
- The desktop fast handoff gate adds production build, Rust formatting, `check`, strict `clippy`, and diff validation.
- Real Windows/macOS smoke tests remain necessary for WebView transparency, native dragging, always-on-top, pointer pass-through and tray/menu behavior.

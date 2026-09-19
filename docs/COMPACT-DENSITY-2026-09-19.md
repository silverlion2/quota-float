# Content-sized desktop widgets — 2026-09-19

The single-provider Bar previously reserved a 150px provider selector and a fixed
320px side rail. It now sizes both the rendered surface and the native window from
the number of visible providers. The worktree was clean before this change.

| Content geometry | One provider | Seven providers |
| --- | --- | --- |
| Bar top | 224 × 38 | 392 × 38 |
| Bar side | 64 × 156 | 64 × 312 |
| Bottleneck top | 196 × 38 | 400 × 38 |
| Bottleneck side | 64 × 100 | 64 × 292 |

All dimensions are logical pixels. Native windows add 4px on every side. Counts
are bounded to 1–7; resizing, edge changes, expansion and DPI recalculation use the
same count. The native minimum width is 72px so it does not force excess transparent
space around a 64px rail. Geometry remains anchored to the saved edge and offset.

The compact detail area is now a keyboard-accessible button. Provider selection
remains switch-only; the existing 650ms detail hover is retained. Single-provider
selection decoration is suppressed. Data health says Current / 已更新 instead of
claiming that consumption is on track. Low quota and unavailable, loading,
signed-out and stale data retain distinct status text. Reset timing and update age
remain in accessible descriptions; update age also appears in the detail tooltip.

Expanded layouts use tighter navigation and quota rows, tabular numbers, less
decorative shadow, and less empty space in Stacked and single-provider Cockpit.
Theme variants remain available. Design-only preview styles are loaded with the
development playground; superseded CSS declarations were removed. Native API
modules share a chunk to keep the existing production bundle limits intact.

## References

- [CodexBar UI](https://github.com/steipete/CodexBar/blob/main/docs/ui.md): compact
  menu hierarchy and pairing quota/reset values from the same window.
- [Stats Mini](https://github.com/exelban/stats/blob/master/Kit/Widgets/Mini.swift):
  content-driven widget sizing and emphasis on the primary number.
- [Codex Minibar](https://github.com/vertopolkaLF/codex-minibar): a small persistent
  summary with details available on demand.

These are design references; no external application code or dependencies were added.

## Verification

- Frontend: 358 tests across 46 files passed.
- Rust: 116 tests passed; one existing real-account probe ignored.
- Production build, Rust fmt/check/strict Clippy, bundle budget and diff check passed.
- Chrome synthetic previews: single-provider Bar measured 64 × 156 with no content
  overflow; seven-provider top Bar 392 × 38; single-provider Bottleneck 64 × 100.
  Also visually inspected light Dashboard and dark Cockpit at their adaptive widths.
- Native geometry fixtures cover multiple provider counts, all three edges,
  negative monitor origins and 100/125/150/200% DPI. This is not a new installed-app
  or multi-monitor Windows/macOS visual smoke test.

Provider access and credential handling were not modified. After the initial UI
handoff, the user authorized push and publication; the changes shipped in
[v0.3.19](RELEASE-0.3.19.md). The user's installed application was not replaced.
There is no persisted preference schema migration.

# Quota Float desktop design system

Quota Float is used beside an editor throughout the working day. Its compact view should remain quiet; opening a control should give immediate feedback and readable detail. Preserve the existing Aurora, Graphite, and Paper identities and their light/dark appearances.

## Precision instrument direction

The quota reading leads, followed by the reset time and pace, then provider context. Navigation and supporting labels recede through weight and surface contrast instead of shrinking their hit targets. Supporting labels use 500 weight; readings use 550–650 emphasis according to metric size. Use the system Text family, including Segoe UI on Windows and explicit Chinese sans fallbacks, with tabular figures for stable numeric alignment. Insights headings, mixed-language metrics and controls share that family rather than falling back from a Latin monospace font.

Aurora retains a soft ambient field, Graphite uses a solid workspace surface, and Paper uses warm neutral material. Provider rows and charts do not add a separate glow or another heavy shadow. Dialog titles start with the task name; repeated English brand/channel kickers are unnecessary when the title and subtitle already carry that context.

This refinement draws on [Linear's interface refresh](https://linear.app/now/behind-the-latest-design-refresh), [Raycast's title/subtitle/accessory hierarchy](https://developers.raycast.com/api-reference/user-interface/list), and [CodexBar's inspectable quota UI](https://github.com/steipete/CodexBar/blob/main/docs/ui.md). These inform hierarchy and state clarity; Quota Float retains its own palettes and desktop geometry.

## Surfaces and typography

- Main quota surfaces retain their selected ambient palette. Control Center, diagnostics, updates, and Insights use the same semantic `--ui-*` tokens.
- Dialogs use opaque, theme-specific surfaces, a 16px radius, and a single subtle border. They do not blur or cast a second large shadow over the already-contained widget.
- Use the system sans family with tabular figures. Settings labels and values are 12px; descriptions wrap at 11px. Provider rows use 12px names, 14px values, and 11px supporting text. Compact quota metrics retain their native density contract.
- Use accent tint and border for selection, with `--ui-text` for readable labels. Success, warning, and failure use named semantic colors and explicit text.
- Long system-operation feedback wraps inside the scrollable settings body. It remains readable after pending state ends.
- Every interactive control retains a visible keyboard focus state. Invisible checkbox inputs paint their focus outline on the visible switch track.
- Selected layout and color choices include a check icon. Float and Ring expose Enter/Space expansion, remain readable while idle, and show explicit loading, sign-in, and unavailable labels. Bar status uses a shape as well as color.
- Graphite uses a quiet solid surface. Aurora keeps its ambient palette and Paper its warm texture. Shared `--ui-*` tokens apply to expanded, compact, and detached surfaces; opaque dialog surfaces isolate reading contrast from desktop wallpaper.

## Motion budget

| Role | Duration | Behavior |
| --- | --- | --- |
| Controls, tabs, popovers, collapse | 120ms | Immediate state change with a short visual acknowledgement |
| Window and dialog entrance | 160ms | Opacity and small translation; expanded shell may scale from 0.99 |
| Progress/state transitions | 200ms | Bounded interpolation; no half-second lag |

Entrance animations finish at `transform: none`, avoiding persistent transformed text layers. Shell motion never animates `clip-path`, large shadows, or backdrop filters. Do not stack a second entrance animation on the primary pane. Background ambient animation pauses while a modal covers it. Reduced-motion preference removes transition delays and repeated animation.

The existing 650ms Bar/Bottleneck hover dwell is deliberate accidental-expansion protection and is independent of this motion budget. Native collapse timing must stay synchronized with the 120ms CSS exit.

## Interaction and data contracts

- Only one modal owns focus at a time. Closing restores the trigger when it is still connected; an old modal cannot steal focus from a new one.
- An obsolete async response cannot replace newer data, reset a newer loading state, or reopen a dismissed modal.
- System actions expose pending, success, cancellation, and failure states. Pending backup/settings operations cannot be started a second time or overlap conflicting operations.
- History geometry is reused across pointer movements. Derive only the histories required by visible views, and keep the underlying data point available for keyboard and pointer inspection.
- Credentials remain read-only inside `src-tauri`; browser and automated native UI fixtures remain synthetic.

## Verification

Run the desktop SOP gates and the native E2E suite. The suite measures repeated modal click-to-paint samples, checks focus restoration, verifies light/dark dialog bounds and horizontal overflow, and captures native screenshots. Treat these measurements as machine-specific evidence, not a universal FPS guarantee. CI packaging and Windows tests do not substitute for a real macOS visual smoke test.

The expanded native matrix is configured to capture all 24 layout/palette combinations; completed-run evidence belongs in the verification receipt. DEV-only `?preview=shot&shot=control-center&theme=paper&appearance=light&lang=zh` exposes the real settings component with synthetic in-memory preferences and history, allowing every tab to be inspected without reading credentials or writing native settings.

# Quota Float desktop design system

Quota Float is used beside an editor throughout the working day. Its compact view should remain quiet; opening a control should give immediate feedback and readable detail. Preserve the existing Aurora, Graphite, and Paper identities and their light/dark appearances.

## Surfaces and typography

- Main quota surfaces retain their selected ambient palette. Control Center, diagnostics, updates, and Insights use the same semantic `--ui-*` tokens.
- Dialogs use opaque, theme-specific surfaces, a 16px radius, and a single subtle border. They do not blur or cast a second large shadow over the already-contained widget.
- Use the system sans family. Settings labels are 10px and form values 11px; settings descriptions wrap at 9px rather than silently truncating. Compact quota metrics retain their existing density contract.
- Use accent tint and border for selection, with `--ui-text` for readable labels. Success, warning, and failure use named semantic colors and explicit text.
- Long system-operation feedback wraps inside the scrollable settings body. It remains readable after pending state ends.
- Every interactive control retains a visible keyboard focus state. Invisible checkbox inputs paint their focus outline on the visible switch track.

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

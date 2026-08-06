# Product Design QA

## Source of truth

- Selected five-style and global appearance design: `C:\Users\T480S\.codex\generated_images\019fc883-444a-7413-921e-7af182a2ca56\exec-d139f147-8719-4663-be40-0021f7ea6095.png` (1536×1024)
- Preserved Float reference: `C:\Users\T480S\AppData\Local\Temp\codex-clipboard-29ec732a-08fd-4942-a8ea-26b3373d4d86.png` (221×186)

## Implementation evidence

- Combined source/implementation comparison: `D:\workspace\quota-float\output\playwright\design-comparison.png` (1800×600)
- Float focused comparison: `D:\workspace\quota-float\output\playwright\float-comparison.png` (442×186)
- Five-style Control Center, dark appearance: `D:\workspace\quota-float\output\playwright\control-center-five-styles-dark.png` (1200×800)
- Island compact, dark: `D:\workspace\quota-float\output\playwright\island-dark-compact.png` (1200×800)
- Island compact, light: `D:\workspace\quota-float\output\playwright\island-light-compact-full.png` (1200×800)
- Island expanded, dark: `D:\workspace\quota-float\output\playwright\island-dark-expanded-full.png` (1200×800)
- Float compact, light/dark: `D:\workspace\quota-float\output\playwright\float-light-compact-full.png` and `float-dark-compact-full.png` (1200×800)

## Validation state

- Browser surface: Codex in-app Browser
- Viewport: 1200×800
- Compact Island measured at 400×38 CSS pixels and aligned at y=0.
- Compact Float retains the rounded-square metric and detached blue status dot from the reference.
- System, Light, and Dark are one global radiogroup; the selection applies to all five styles and is included in saved layouts.
- Island exposes six semantic radio controls with monochrome provider marks. Clicking QODER changed the selected data from `CODEX 74% left` to `QODER 1.3K credits`.
- Control Center exposed all five visual-style radio controls; Dark and Island could both be selected and remained checked.
- Expanded Island includes the logo slider above the provider ledger.
- No application error or warning entries were observed during final interactions. Vite debug connection messages and the React development hint were informational only.

## Comparison passes

- Typography and spacing: compact metrics remain legible at the target dimensions; the 400×38 Island keeps one-line provider, quota, reset, status, and freshness data without collision.
- Layout and responsiveness: compact dimensions are deterministic; expanded height is measured from content and bounded to the active monitor work area.
- Color and surfaces: all styles provide explicit light and dark tokens. Provider marks use the real application logo masks in a single inherited color.
- Copy and icons: the five style names, descriptions, appearance labels, six providers, and control icons are present and coherent in Chinese and English UI paths.
- States and interactions: provider click/selection, visual-style selection, appearance selection, hover expansion delay, and saved-layout normalization are implemented; reduced-motion behavior remains intact.
- Accessibility: Island uses a labeled radiogroup, each logo is a labeled radio, selected state is exposed through `aria-checked`, and existing focus-visible treatment is retained.

## Iteration history

1. Reduced Island to a top-docked 400×38 surface with a 4-pixel transparent safe inset at the native-window level.
2. Added quota, unit, reset, status, and freshness while keeping the compact strip on one line.
3. Replaced colored provider presentation with monochrome logo masks and added click/drag provider selection.
4. Restored Float as an independent legacy style and unified appearance selection across every style.
5. Made the preview provider selection stateful, then recaptured and compared the final states.

Final result: passed

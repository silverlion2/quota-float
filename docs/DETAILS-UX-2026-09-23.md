# Detail expansion and readability

The reported failure is the transition from an edge bar's **quota details** button to the full panel. The installed Windows build was verified as v0.3.20 before investigating.

## Reproduction

The Windows native E2E application uses synthetic provider data and the real Tauri window bridge. A new test samples the WebView viewport on every animation frame after clicking the bar's details button.

On the unmodified v0.3.20 executable, the top-edge sequence was:

| Stage | Viewport width × height | Measured card height |
| --- | --- | --- |
| Detail DOM mounted in compact viewport | 372 × 46 | 580 |
| Native default expansion | 560 × 268 | 361 |
| Queued measurement from compact viewport | 552 × 588 | 361 |
| Corrected measurement | 552 × 370 | 361 |

The regression failed with peak height **588**, above final height **370**. The old observer enqueued a measurement taken before the native window expanded. The later correction moved/resized the window again, matching the reported jump.

The test is `test/e2e/details.spec.ts`. Local evidence is stored under `output/handoff/edge-details-baseline.json` and `output/details-baseline.log`. The input click is automated; this trace verifies real native viewport geometry, not a physical-pointer acceptance test.

## UI review

Current synthetic previews were inspected in the in-app browser. The review covered compact bar → details → control center. Findings: the details transition needs stable measurement; dark-mode pace information has insufficient contrast; much secondary text is too small; settings and header controls need consistent readable labels and hit areas. Existing provider data and the local credential boundary are outside this presentation change.

The native screenshot helper failed twice with `SetIsBorderRequired failed: No such interface supported (0x80004002)`. Native screenshots and geometry validation therefore use the project's existing isolated WebdriverIO application; browser screenshots are synthetic UI evidence only.

## Verification

The renderer now waits for the native expansion to finish before attaching its size observer. A wider layout first requests its width while preserving the last stable height, then measures at that width. Each pending width request has its own identity, so an old completion cannot unlock a later open-close-open transition. A work-area clamp is accepted after one attempt.

On Windows, one synchronous `SetWindowPos` updates both position and size without an intermediate hit-test rectangle. Collapsed native geometry rejects stale expanded-content resize requests. Keyboard focus holds the card open; mouse click focus does not latch it, and an active settings dialog survives pointer leave.

Readability changes increase text and control sizes, split provider names and plans onto separate lines, improve dark/light secondary colors, and move Insights filters into two rows. Insights has a stable 480px scrolling content panel instead of deriving its height from the window it is trying to resize.

Local gates passed on 2026-09-23:

- 421 frontend tests across 51 files; final App 16/16 and detached-panel 4/4 targeted checks passed after the last equivalent cleanup and shared drag-icon change.
- Windows Rust: 123 passed, one ignored; `fmt --check`, `check`, and all-target strict Clippy passed.
- Production build and unchanged bundle budgets passed: 590,705 B total JavaScript, 183,775 B gzip JavaScript, 153,300 B CSS.
- Version consistency and `git diff --check` passed.
- Native E2E: 13/13 passed. Existing taskbar event, settings, detached cockpit, small-provider layout, update dialog, and keyboard-focus cases remain green.

For all nine detail openings (three each at Top/Left/Right), the expanded viewport's peak and final heights were both **434px**, with a **426px** card and 8px native inset. None repeated the baseline's oversized-then-shrink sequence. Insights was stable in the final sampled second; its scrolling panel stayed within 480px. All nine collapsed windows ignored a stale 900×552 expanded resize request.

Evidence: `output/details-frontend-final.log`, `output/details-rust-*.log`, `output/details-production-bundle.log`, `output/details-native-e2e.log`, `output/handoff/edge-details-traces.json`, `edge-details-{top,left,right}.png`, and `insights-stable-native.png`. Browser light-settings, dark-dashboard, and Insights screenshots also live in `output/handoff/`.

Limits: the initial native default size still converges once to the content size; this regression specifically rules out erroneous oversizing and re-shrinking. Automated input and this Windows display do not replace a physical-pointer, mixed-DPI/multi-monitor, or macOS visual acceptance matrix. The synchronous combined rectangle update is Windows-specific. Updater signatures are separate from operating-system code signing.

# Quota Float Roadmap

This document records evidence-based maintenance proposals. It does not authorize implementation, commits, pushes, packaging, signing, tags, releases, or external submissions.

## Now — stabilize the magnetic Bar release

- Complete Windows smoke coverage for Top/Left/Right selection, cross-edge dragging, restart persistence, inward expansion, content resizing, locking and always-on-top at 100%, 125% and 150% scaling across multiple monitors.
- Re-test the clipping, white-edge and hover-expansion reports in `USER-FEEDBACK-TRACKER.md`; create fixes only when a reproducible root cause is confirmed.
- Test a macOS Universal artifact on an actual Intel or Apple silicon Mac and record transparency, edge attachment, menu-bar and update behavior. Windows builds and CI compilation are not runtime evidence.
- Keep provider compatibility checks current after Codex Desktop, Ark CLI, TRAE, WorkBuddy, Qoder or Antigravity updates.

Evidence: the test matrix and feedback tracker still contain platform-runtime items; the v0.2.14–v0.2.19 history concentrated on adaptive layouts, insights and content-driven window sizing.

## Next — reduce maintenance risk

- Formalize a small provider-adapter conformance suite for status mapping, bounded payloads, last-known-good behavior and redacted diagnostics.
- Add deterministic native-window integration fixtures around monitor changes, taskbar relocation and display removal where Tauri test seams permit it.
- Make layout-profile import diagnostics explain migrated or clamped fields without exposing source paths or provider data.
- Refresh screenshots and interaction documentation after the magnetic Bar passes platform smoke testing.

Evidence: adapters are intentionally separate Rust modules, while `TEST-MATRIX.md` still relies on real desktop checks for monitor lifecycle and platform login changes.

## Later — distribution and carefully scoped breadth

- Add Windows Authenticode and macOS Developer ID/notarization when project-owned certificates and release authorization are available.
- Evaluate additional providers only after documenting their official/local read-only source, credential boundary, failure isolation and fixture strategy.
- Consider opt-in local aggregate reports or additional quota forecasts only if they remain prompt-free, credential-free and clearly distinguish provider data from estimates.
- Revisit a Bottom Bar only through a separate interaction/design proposal; it is deliberately excluded from the current placement model.

Evidence: `KNOWN-LIMITATIONS.md`, the release checklist and competitive study identify signing and provider breadth as opportunities, but privacy and transparent failure behavior remain higher-priority constraints.

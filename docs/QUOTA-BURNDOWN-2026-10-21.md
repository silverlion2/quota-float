# Personal weekly quota burndown

## Reference and scope

Reviewed on October 21, 2026: [CodexBar's feature overview](https://github.com/steipete/CodexBar#features) describes a quota burndown built from recorded snapshots, with capture times and an even-use guide. Quota Float already has a local quota history curve and a textual personal consumption plan. This update connects those ideas inside the existing reset outlook so the user can compare observed remaining quota with a steady-use reference toward their own reset.

This is an independent implementation using Quota Float's existing data and visual tokens. No upstream source, assets, dependencies, account access, or background collectors are added.

## Data contract

- Only provider-reported personal weekly quota and matching local samples can determine the chart. Public global-reset forecasts never set its endpoint or change the personal allowance.
- The observed line starts with an actual retained sample. It does not invent an initial 100% balance or backfill missing measurements.
- The dashed reference runs from the first valid sample in the displayed continuous segment toward zero at the personal reset. The chart zooms to the recorded interval, showing only that part of the guide; the reset time appears separately. It is a comparison guide, not a prediction, recommendation to exhaust the quota, or provider guarantee.
- Unavailable or stale data, a changed reset identity, refills and sampling gaps must not produce a falsely continuous measured line. An explicitly changed subscription plan also cuts the segment for both the chart and the numeric consumption estimate. Legacy samples with an unknown plan remain compatible.
- Displayed observations cover at most the latest six hours and stop at the provider capture time. The existing shared curve bounds drawing to at most 721 points; keyboard inspection retains all validated samples.
- Capture times and remaining percentages can be inspected with a pointer or keyboard. The existing consumption-rate estimate retains its own minimum-history requirements.
- Browser checks use synthetic data. Provider credentials remain read-only inside `src-tauri`; no migration or change to local user history is required.

## Validation and rollback

Helper and component regressions cover the sample boundaries, reference line and keyboard inspection. The desktop fast handoff and platform packaging gates remain required; their actual results belong in the release receipt. Automated packaging does not establish real-account accuracy or replace physical multi-monitor and Mac visual checks.

Rollback uses the prior public desktop installer and existing recovery flow. This feature adds no persisted settings or data schema.

## Native release regression

The first source CI caught a right-edge expansion overshoot: a temporary 560px viewport retained a 462px card height before narrowing to the requested 552px viewport and 452px card. The grow-only width guard allowed that stale height to reach native resizing (470px, then 460px). The pending v0.3.27 release was cancelled before platform packaging; its draft and tag were retained.

The follow-up normalizes oversized as well as undersized viewports before height measurement, waits for the narrower viewport to be observable after the native command resolves, and retains the existing stable-frame and narrow-monitor-clamp behavior. The native E2E overshoot assertion remains unchanged. Final validation and publication evidence belong in the release receipt.

The original CI and provider-fixture macOS jobs independently failed to acquire an ARM hosted runner. Their annotations explicitly reported ARM capacity constraints. CI, provider fixtures and release now use GitHub's supported `macos-15-intel` pool; both Rust targets and the Universal Tauri build remain enabled. CI and release verify the final Mach-O has both x86_64 and arm64 slices before success. Intel-host tests do not prove execution on a physical Apple Silicon Mac, and runner availability is not guaranteed. References: [GitHub runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners), [Tauri Universal build](https://v2.tauri.app/reference/cli/).

The first real Intel build produced the app and DMG, then exposed an argument-order error in the new architecture gate. Apple's `lipo -verify_arch` consumes all remaining arguments as architecture names, so the input must precede that option. The v0.3.28 release was cancelled and retained as a draft. The corrected gate uses `lipo "$binary" -verify_arch x86_64 arm64`. A cheap macOS self-test now runs before native setup using real clang/lipo objects: a dual-architecture fixture passes, both single-architecture fixtures and a missing app fail, and paths contain spaces. This exercises the actual tool parser; it does not claim the fixture app can run. Reference: [Apple lipo manual](https://github.com/apple-oss-distributions/cctools/blob/main/man/lipo.1).

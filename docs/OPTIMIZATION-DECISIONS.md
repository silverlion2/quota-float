# Optimization decisions and remaining acceptance dependencies

2026-09-08. These decisions close the evaluation of optional changes; they do not turn unperformed device or release checks into passed tests.

| Area | Decision and evidence | Reopen condition |
|---|---|---|
| Runtime persistence | Keep the existing serialized write queue. Compact JSON now preserves the full 120,000-record fixture below the 20 MiB boundary; detached reads are bounded and progressive events do not individually append history. Do not add a database or lossy write coalescing based solely on Node timing. | Repeatable native disk-write or event-loop measurements show a remaining bottleneck. |
| Module separation | Storage is extracted to `storage.rs`; frontend refresh merge, report aggregation, bridge validation and recovery guidance have focused domain modules and tests. Keep the remaining application orchestration cohesive. | A concrete change exposes duplicated logic or an independently testable lifecycle boundary. |
| Dependency upgrades | Follow `DEPENDENCY-POLICY.md`: toolchain and maintenance groups are updated; incompatible major migrations are explicitly deferred. No version bump is claimed where only policy changed. | A dedicated migration demonstrates compatibility and native acceptance. |
| New providers / macOS-only adapter work | No additional named provider source or representative fixture is available in this scope. Preserve the documented platform matrix and read-only credential boundary. | Document an actual local/official source and obtain synthetic fixtures for its success and failure states. |
| Bottom Bar | Retain the explicit Top/Left/Right product boundary. Existing geometry and taskbar interactions do not define Bottom behavior. | A separately scoped interaction and geometry design is approved. |
| Screenshots | Existing historical screenshots remain labeled by context/version. Native E2E failure captures use synthetic data; they are not promotional screenshots. Do not present unvalidated multi-DPI layouts as accepted. | Real supported-display visual acceptance, followed by refreshed screenshots of those actual renders. |

## Outstanding acceptance, not implementation claims

- Windows 100%/125%/150%, multiple monitors and display lifecycle: needs the real display configurations in `TEST-MATRIX.md`. The synthetic geometry tests and one-machine native functional E2E do not substitute for this matrix.
- macOS rendering, native updater and install lifecycle: needs a real Mac and exact target artifact. This workspace is Windows; no Mac runtime result is claimed.
- Whole-application startup/idle/refresh/IO budgets: synthetic history measurements and a validated root-process sampler are available. WebView2/GPU child processes, startup and disk IO are explicitly excluded from that sampler. No total-app performance threshold is asserted without a fixed process-tree capture and repeatable baseline.
- Remote CI and exact package install/update/rollback: workflow changes are locally checked; this commit has not been pushed or released, so its remote runner and package lifecycle remain unverified.
- Authenticode / Developer ID / notarization: requires project-owned credentials and separate signing/release authorization. Existing updater signatures are a different mechanism.

All local implementation work and its tests can be committed independently of these dependencies. Keep this acceptance list visible in the coordinator; do not repeatedly wake idle implementation tasks when only these external conditions remain.

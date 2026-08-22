# v0.3.0 Security Review

Date: 2026-08-22  
Scope: frontend/native boundary, provider credential flow, local files, release permissions, npm dependencies, and Rust dependencies

## Executive result

No known critical or high-severity finding remains open in the release scope. One high-confidence native-boundary weakness was found and fixed: the webview could previously supply arbitrary import/export paths to native commands. File selection is now owned by native operating-system dialogs, supported extensions and 20 MiB limits are enforced in Rust, and the broad frontend dialog permission was removed.

## Verification methods

- Manual trust-boundary review of Tauri commands, capabilities, provider adapters, diagnostics, persistence, import/export, and release workflows.
- `npm audit --audit-level=high --registry=https://registry.npmjs.org`: 0 vulnerabilities.
- `cargo audit --file src-tauri/Cargo.lock`: 0 vulnerabilities.
- Target-specific dependency inspection for the new RustSec `event-listener` warning: absent from both `x86_64-pc-windows-msvc` and `aarch64-apple-darwin` dependency trees.
- Unit, strict Clippy, production build, native E2E, and release dry-run gates recorded in [QA-REPORT-v0.3.0.md](QA-REPORT-v0.3.0.md).

## Controls delivered

- Provider credentials remain read-only inside `src-tauri`; Claude credentials are never refreshed, persisted, or exposed to React.
- HTTP credentials are sent only to the matching provider quota endpoint; request redirects are disabled and reads/responses are bounded.
- Provider adapters are isolated behind finite timeouts and targeted retry, preventing one provider from blocking or duplicating healthy collection.
- Tauri capabilities now enumerate the required window, event, updater, process, notification, and opener permissions instead of granting plugin defaults.
- Diagnostics, recovery data, and exports exclude credentials, account identifiers, authentication paths, prompts, chats, and raw provider responses.
- Dependabot covers npm, Cargo, and GitHub Actions; scheduled CI enforces npm high-advisory and RustSec vulnerability gates.
- Release CI separates updater signatures from optional Authenticode and Apple signing/notarization, verifies configured platform signatures, and discloses their state.

## Residual risk

- Provider quota formats and local credential locations can change upstream. Synthetic fixtures and weekly compatibility CI reduce regression risk but cannot prove a real account remains compatible.
- RustSec reports 18 allowed warnings from all-target transitive crates, primarily legacy GTK/Linux paths plus unmaintained helper crates. No vulnerability is reported, and the new unsound crates are absent from the shipped Windows/macOS target trees. Dependency automation remains enabled.
- Project-owned Authenticode and Apple Developer ID credentials are external assets, not repository data. If absent, releases remain Tauri-updater-signed but platform-unsigned and the workflow/release notes say so explicitly.

## Finding disposition

| Severity | Finding | Disposition |
| --- | --- | --- |
| High | Webview-selected arbitrary import/export filesystem paths | Fixed and regression-covered |
| High | Test-only WebdriverIO transitive npm advisories | Fixed through compatible dependency overrides; audit is zero |
| Medium | Broad default Tauri plugin permissions | Fixed with explicit least-privilege capabilities |
| Medium | Platform signing state could be ambiguous | Fixed with conditional signing verification and generated disclosure |

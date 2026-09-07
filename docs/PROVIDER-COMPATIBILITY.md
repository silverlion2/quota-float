# Provider Compatibility

Quota Float treats every provider as an isolated, read-only adapter behind `src-tauri/src/provider_registry.rs`. The registry owns stable ordering, bounded timeouts, concurrent refresh, and targeted retry. A provider failure must never erase a healthy provider or expose credentials to the webview.

## Supported sources

| Provider | Windows source support | macOS source support | Read-only source and local prerequisite |
| --- | --- | --- | --- |
| Codex | Supported | Supported | Official quota endpoint using existing local Codex sign-in state; Codex signed in |
| Claude | Supported | Supported | Anthropic OAuth usage endpoint using existing Claude credentials; Claude Code signed in |
| Qoder | Supported | Not implemented | Existing Windows account cache and quota service; Qoder signed in |
| TRAE | Supported | Not implemented | Existing Windows sign-in state and entitlement service; TRAE signed in |
| WorkBuddy | Supported | Not implemented | Existing Windows sign-in state and quota service; WorkBuddy signed in |
| Volcengine Ark Coding Plan | Supported | Supported | Authenticated Ark CLI read-only usage command; Ark CLI installed and signed in |
| Google Antigravity | Supported | Supported | CSRF-protected loopback language-server quota service; Antigravity running and signed in |

This matrix describes the adapters compiled by the current source tree. It is not a claim that every source has recently been exercised with a real account on every supported operating system. In particular, the non-Windows Qoder, TRAE, and WorkBuddy branches intentionally return no detected provider.

The package manifests currently identify the source tree as `0.3.9`. The latest complete public release record in this repository is [`v0.3.8`](RELEASE-0.3.8.md); later source changes are not represented as published until matching release evidence exists.

## Automated contract

The weekly `Provider compatibility` workflow runs frontend normalization fixtures and the Rust tests available to each Windows and macOS build. Windows-only adapter paths are exercised on Windows; cross-platform adapters compile and run their applicable tests on both systems. Fixtures cover healthy, missing, malformed, signed-out, oversized, and provider-specific quota/reset shapes without using real credentials or network access.

The `v0.3.8` record includes Windows and macOS artifacts plus updater signatures, but it does not establish a complete real-account provider matrix. Real macOS runtime, visual, and update-path validation remains separate from synthetic CI coverage.

When a provider changes:

1. Add a redacted synthetic fixture reproducing the new shape.
2. Keep credential discovery and network access inside the provider's Rust adapter.
3. Preserve response-size limits, request timeouts, error redaction, and last-known-good behavior.
4. Run `npm test`, `cargo test --manifest-path src-tauri/Cargo.toml`, and strict Clippy.
5. Record any real-account validation separately; never commit authenticated payloads.

Use the provider compatibility issue template for breakages and the provider request template for new adapters.

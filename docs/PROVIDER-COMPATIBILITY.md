# Provider Compatibility

Quota Float treats every provider as an isolated, read-only adapter behind `src-tauri/src/provider_registry.rs`. The registry owns stable ordering, bounded timeouts, concurrent refresh, and targeted retry. A provider failure must never erase a healthy provider or expose credentials to the webview.

## Supported sources

| Provider | Read-only source | Local prerequisite |
| --- | --- | --- |
| Codex | Official quota endpoint using existing local Codex sign-in state | Codex signed in |
| Claude | Anthropic OAuth usage endpoint using existing Claude credentials | Claude Code signed in |
| Qoder | Existing local Qoder sign-in state and quota service | Qoder signed in |
| TRAE | Existing local TRAE sign-in state and entitlement service | TRAE signed in |
| WorkBuddy | Existing local WorkBuddy sign-in state and quota service | WorkBuddy signed in |
| Volcengine Ark Coding Plan | Authenticated Ark CLI read-only usage command | Ark CLI installed and signed in |
| Google Antigravity | CSRF-protected loopback language-server quota service | Antigravity running and signed in |

## Automated contract

The weekly `Provider compatibility` workflow runs frontend normalization fixtures plus every Rust provider parser test on Windows and macOS. Fixtures cover healthy, missing, malformed, signed-out, oversized, and provider-specific quota/reset shapes without using real credentials or network access.

When a provider changes:

1. Add a redacted synthetic fixture reproducing the new shape.
2. Keep credential discovery and network access inside the provider's Rust adapter.
3. Preserve response-size limits, request timeouts, error redaction, and last-known-good behavior.
4. Run `npm test`, `cargo test --manifest-path src-tauri/Cargo.toml`, and strict Clippy.
5. Record any real-account validation separately; never commit authenticated payloads.

Use the provider compatibility issue template for breakages and the provider request template for new adapters.

# Distribution and Platform Signing

GitHub Releases is Quota Float's canonical distribution channel. Every stable release must contain `latest.json`, the Windows per-user NSIS installer and updater signature, the macOS Universal DMG, and the macOS updater archive and signature. The release workflow refuses to publish an incomplete artifact set and runs Microsoft Defender plus the Windows upgrade smoke test.

## Independent signature layers

- The existing Tauri updater key authenticates packages consumed by Quota Float's in-app updater.
- Windows Authenticode authenticates the executable and installer to Windows/SmartScreen.
- Apple Developer ID signing and notarization authenticate a macOS download to Gatekeeper.

These are independent. A valid updater signature does not imply Authenticode or Apple notarization.

## Optional release secrets

The release workflow activates platform signing only when project-owned credentials are configured.

Windows:

- `WINDOWS_CERTIFICATE`: base64-encoded PFX containing the code-signing certificate and private key.
- `WINDOWS_CERTIFICATE_PASSWORD`: PFX export password.
- `WINDOWS_TIMESTAMP_URL`: optional certificate-authority timestamp URL; defaults to DigiCert's timestamp service.

macOS:

- `APPLE_CERTIFICATE`: base64-encoded Developer ID Application `.p12`.
- `APPLE_CERTIFICATE_PASSWORD` and `KEYCHAIN_PASSWORD`.
- `APPLE_ID`, app-specific `APPLE_PASSWORD`, and `APPLE_TEAM_ID` for notarization.

When configured, CI imports the credentials into an ephemeral runner store, builds the exact packages, verifies Authenticode or `codesign`, and validates the notarization staple. Missing credentials produce a clear workflow notice and an updater-signed but platform-unsigned release; partial credential sets fail instead of silently degrading.

## Catalog readiness

Do not submit an unsigned build to WinGet, Homebrew Cask, or a platform store. After a platform-signed stable GitHub release is public:

1. Verify the public asset digest and signature from a clean machine.
2. Install, launch, update from the previous stable version, uninstall, and check rollback/recovery.
3. Generate the catalog manifest against immutable versioned release URLs.
4. Submit the manifest in the catalog's official repository and link its review from the release record.
5. Never place updater keys, platform certificates, provider credentials, or authenticated payloads in catalog metadata.

Until project-owned platform certificates are provisioned, GitHub Releases remains the supported channel and release notes must state the Authenticode/notarization status explicitly.

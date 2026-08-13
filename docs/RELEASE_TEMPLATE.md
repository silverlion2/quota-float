# Quota Float vX.Y.Z

Quota Float is a local-first Windows/macOS desktop widget for monitoring supported coding-assistant quotas from existing local sign-in state.

## Highlights

- Describe the primary user-visible change.
- Describe important fixes or migrations.
- State any intentional exclusions or compatibility notes.

## Downloads

- Windows x64: `Quota.Float_X.Y.Z_x64-setup.exe`
- macOS Universal: `Quota.Float_X.Y.Z_universal.dmg`
- Updater metadata and signatures: `latest.json`, Windows `.sig`, macOS `.app.tar.gz` and `.sig`

## Install

1. Sign in to the supported local app or CLI on the same machine.
2. Download the installer for the operating system.
3. Install and launch Quota Float.

### Operating-system trust note

Tauri updater signatures verify update integrity but do not replace Windows Authenticode or macOS Developer ID/notarization. If those platform certificates are not configured, Windows may show SmartScreen/unknown-publisher warnings and macOS may show Gatekeeper warnings.

For an unnotarized macOS build, open the DMG, move the app to Applications, then right-click the app and choose Open. If needed, allow it in System Settings -> Privacy & Security.

## Privacy

Quota Float does not store provider tokens, account IDs, prompts, chats, raw quota responses, or local auth paths. Provider access stays read-only inside `src-tauri`. See `PRIVACY.md` and `SECURITY.md`.

## Verification

- Frontend tests: [count/result].
- Rust tests: [count/result].
- Production build, Rust format/check/clippy, diff, and version checks: [result].
- Windows Defender preflight: [result].
- Windows publish: [result].
- macOS Universal publish: [result].
- Windows upgrade smoke: [result].
- Manual Windows scaling/multi-monitor smoke: [result or pending].
- Manual macOS runtime/visual smoke: [result or pending].

## Evidence

- Feature commit: `[sha]`
- Release commit: `[sha]`
- Tag: `vX.Y.Z`
- Release: `[URL]`
- Workflow: `[URL]`
- Trigger: `[GitHub Actions workflow_dispatch / external tag push / local fallback]`
- Published artifact inventory: [list or link]

## Known limitations

- List platform signing/notarization status.
- List any pending native visual/runtime checks.
- Link `docs/KNOWN-LIMITATIONS.md` and `docs/TEST-MATRIX.md`.

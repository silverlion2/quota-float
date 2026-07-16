# Quota Float

Lightweight floating desktop widget for checking coding-assistant quotas from existing local login states.

![Quota Float quota states](docs/images/quota-states.png)

## Highlights

- Collects Codex, Qoder, TRAE, WorkBuddy, and Volcengine Ark Coding Plan quota where their local apps or CLI are available.
- Shows weekly windows, exact remaining balances, or unlimited plans in a compact always-on-top widget.
- Expands into a compact platform ledger with detailed values for every detected provider.
- Uses clear quota states for healthy, caution, and critical remaining usage.
- Collapses into a small floating orb when idle, then expands on hover.
- Indicates whether quota is currently being consumed.
- Includes quick controls for language switching and always-on-top behavior.
- Shows reset credit count and available reset-credit expiration times when the quota service provides them.
- Handles stale data, signed-out sessions, unavailable quota responses, and loading states without fabricating values.

## Screenshots

| Quota states | Floating orb | Reset credit expiration |
| --- | --- | --- |
| ![Healthy, caution, and critical quota states](docs/images/quota-states.png) | ![Collapsed quota orb](docs/images/quota-orb.png) | ![Reset credit expiration popover](docs/images/quota-reset-expiration.png) |

## Repository Metadata

Suggested repository description:

```text
Floating Windows/macOS desktop widget for checking Codex quota from the local Codex Desktop login state.
```

Suggested topics:

```text
codex, quota, tauri, react, rust, desktop-app, windows, macos, productivity
```

## How It Works

Quota Float reuses existing local login states in read-only mode. Codex, TRAE, and WorkBuddy are queried through their own quota services; Qoder uses its local account cache; Volcengine uses the authenticated `arkcli usage plan` command. It does not estimate usage from local token counts or modify account settings.

Browser preview uses mock data. Real quota reading requires the Tauri desktop app and an existing Codex Desktop login on the same machine.

## Download

For normal users, download the latest unsigned build from GitHub Releases:

- Latest release: https://github.com/change-42-yhmm/quota-float/releases/latest
- Windows: `quota-float-windows-unsigned.zip`
- macOS Universal: `quota-float-macos-universal-unsigned.zip`

Unzip it and run the app. Unsigned builds may trigger Windows SmartScreen or macOS Gatekeeper warnings. Public distribution to non-technical users should use signed Windows builds and notarized macOS builds.

## Feedback

Please use GitHub Issues for bugs, compatibility reports, and feature requests:

https://github.com/change-42-yhmm/quota-float/issues

## Privacy Boundary

Quota Float is local-first and intentionally narrow:

- Reads only the local authentication or account cache needed for each detected provider.
- Sends each provider's existing token only to that provider's official quota endpoint; Volcengine access remains inside Ark CLI.
- Stores only widget preferences in its own app config directory.
- Does not store provider tokens, account IDs, prompts, chat history, raw quota responses, or local auth paths.
- Does not include telemetry, analytics, crash reporting, or third-party tracking.
- Does not redeem reset credits or modify account settings.

See [PRIVACY.md](PRIVACY.md) and [SECURITY.md](SECURITY.md) for the full boundary.

## Accuracy Boundary

Quota is read from provider responses, local account caches, or Ark CLI output. If a response format changes, the app shows an unavailable or stale state instead of inventing quota values.

## Development

Requirements:

- Node.js 20+
- Rust stable
- Tauri 2 system dependencies for your platform

```bash
npm install
npm run dev
npm run test
npm run build
npm run tauri dev
```

## Build

```bash
npm run tauri build
```

On Windows, Tauri may download WiX to create an MSI installer. If WiX download fails, the release executable may still be produced at:

```text
src-tauri/target/release/quota-float.exe
```

## Release

GitHub Actions are configured for:

- CI on push/PR: frontend tests, Rust tests, web build, Tauri build.
- `v*` tags: unsigned Windows and macOS Universal bundle artifacts and a public GitHub Release.

See [docs/GITHUB-RELEASE-CHECKLIST.md](docs/GITHUB-RELEASE-CHECKLIST.md) before publishing a version for others.

Do not upload local credentials, `.codex`, `.env*`, screenshots with personal data, `node_modules`, `dist`, `src-tauri/target`, or local installers to source control.

## License

MIT

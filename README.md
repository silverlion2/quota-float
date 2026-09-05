<p align="center">
  <img src="assets/icon.svg" width="96" alt="Quota Float app icon">
</p>

<h1 align="center">Quota Float — Coding Assistant Quota Monitor</h1>

<p align="center">
  A lightweight, local-first desktop widget that keeps Codex, Claude, Qoder, TRAE, WorkBuddy, Volcengine Ark Coding Plan, and Google Antigravity usage limits visible at a glance.
</p>

<p align="center">
  <a href="https://github.com/silverlion2/quota-float/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/silverlion2/quota-float?display_name=tag&sort=semver"></a>
  <a href="https://github.com/silverlion2/quota-float/releases"><img alt="GitHub downloads" src="https://img.shields.io/github/downloads/silverlion2/quota-float/total"></a>
  <a href="https://github.com/silverlion2/quota-float/actions/workflows/ci.yml"><img alt="CI status" src="https://github.com/silverlion2/quota-float/actions/workflows/ci.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/github/license/silverlion2/quota-float"></a>
  <img alt="Windows and macOS" src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS-2878c7">
</p>

<p align="center">
  <strong><a href="https://github.com/silverlion2/quota-float/releases/latest">Download for Windows or macOS</a></strong>
  · <a href="README.zh-CN.md">简体中文</a>
  · <a href="https://github.com/silverlion2/quota-float/issues">Report an issue</a>
</p>

![Quota Float showing healthy, caution, and critical coding-assistant quota states](docs/images/quota-states.png)

Quota Float is an always-on-top **Codex quota monitor and coding-assistant usage dashboard** for Windows and macOS. It reads the sign-in state already stored by supported local apps and CLIs, then displays real quota windows, remaining balances, reset times, and daily usage pace without asking you to paste credentials.

## Why Quota Float?

- **All quotas in one place:** monitor Codex, Claude, Qoder, TRAE, WorkBuddy, Volcengine Ark Coding Plan, and Google Antigravity from one compact widget.
- **Useful before a limit hits:** see healthy, caution, and critical states, quota pace guidance, reset timing, a freshness-gated multi-source global reset outlook, and configurable desktop alerts.
- **Stays out of the way:** use a floating orb, Ring, magnetic Bar, or risk-sorted Bottleneck rail attached to the top, left, or right work-area edge; expand inward on hover and keep the placement across restarts and display changes.
- **Resilient by design:** transient failures are retried, while last-known-good values remain visible and clearly marked as stale.
- **Private by default:** no telemetry, analytics, account modification, prompt collection, or third-party tracking.
- **Desktop-native:** built with Tauri, Rust, React, and TypeScript, with signed in-app update artifacts and Stable/Beta channels.

## Supported Providers

| Provider | Quota source | Requirement |
| --- | --- | --- |
| OpenAI Codex | Existing Codex local sign-in state | Codex Desktop or Codex CLI signed in |
| Anthropic Claude | Existing Claude Code OAuth sign-in state | Claude Code signed in |
| Qoder | Local account cache | Qoder installed and signed in |
| TRAE | Existing TRAE local sign-in state | TRAE installed and signed in |
| WorkBuddy | Existing WorkBuddy local sign-in state | WorkBuddy installed and signed in |
| Volcengine Ark Coding Plan | Authenticated `arkcli usage plan` output | Ark CLI installed and signed in |
| Google Antigravity | Local CSRF-protected language-server quota status | Antigravity installed, open, and signed in |

Quota Float uses these sources in read-only mode. If a provider changes its response format or a session expires, the app reports an unavailable or stale state instead of inventing a value.

## Download and Install

Get the newest build from **[GitHub Releases](https://github.com/silverlion2/quota-float/releases/latest)**.

- **Windows:** download the per-user `x64-setup.exe` installer. Administrator access is not required.
- **macOS:** download the Universal `.dmg`, compatible with Apple silicon and Intel Macs.

Updater artifacts are signed with the project's Tauri update key. Windows Authenticode signing and macOS notarization require separate certificates, so unsigned builds may still trigger SmartScreen or Gatekeeper warnings.

## Features

- Real quota windows, exact remaining balances, unlimited-plan states, and reset-credit expiration times when available.
- Daily quota pace guidance and alerts, configurable thresholds, quiet hours, and notification cooldowns.
- Per-provider adaptive refresh scheduling, a low-impact Project Focus mode, and monitoring pause controls for sources you do not need during active work.
- Floating orb, persistent expansion, always-on-top control, provider rotation, drag-to-reorder, and localized tray actions.
- Local quota timeline for resets, low-quota crossings, provider failures, recoveries, and updates, backed by lifetime local memory: full samples for the latest 90 days and daily-compacted older quota history.
- A Vibe Usage dashboard with incremental indexing across every retained local Codex session metadata file, model/project/terminal filters, session and activity metrics, 24-hour-by-default or complete-history trends, an hourly heatmap, and per-model API-equivalent cost estimates.
- A configurable monthly API-equivalent budget outlook with local alerts, plus anonymized CSV/JSON exports, an SVG share card, and an exportable versioned price catalog.
- Custom accent colors, hidden or condensed providers, reusable layout profiles, and system-login autostart.
- Independent Float/Ring/Bar/Bottleneck compact layouts and Dashboard/Cockpit/Provider-bar/Stacked expanded layouts. Bottleneck shows every provider's tightest window in risk order. Cockpit combines the active quota ring, local trend, pace plan, and 90-day heatmap; each region can expand in place or detach into its own always-on-top window.
- The compact Bar keeps provider-logo interaction in switch-only mode; dwelling on the metric area expands inward. Expanded layouts expose only one provider-navigation surface.
- Detached Cockpit windows read the existing native snapshot cache and bounded local history; they do not receive credentials, prompts, or serialized quota payloads through their URL.
- A magnetic Bar with a `400×38` top strip or `64×320` left/right rail, upright quota details, edge-aware inward expansion, and saved normalized placement.
- Rotating recovery points before updates plus one-file export/import for settings, layouts, and history.
- Redacted diagnostic reports that exclude tokens, account IDs, local auth paths, and raw provider responses.
- A Provider Health Center showing each local source, freshness, recovery state, and bounded history count.
- Automatic updates with Stable/Beta discovery and a convenient restart flow.

## Screenshots

| Floating orb | Reset credit expiration | Weekly quota fallback |
| --- | --- | --- |
| ![Collapsed Quota Float quota orb](docs/images/quota-orb.png) | ![Quota reset credit expiration popover](docs/images/quota-reset-expiration.png) | ![Expanded weekly Codex quota fallback](docs/images/quota-v0.1.4-weekly-fallback.png) |

## Privacy and Security

Quota Float sends each provider's existing token only to that provider's official quota service; Claude credentials remain read-only, Volcengine access stays inside Ark CLI, and Antigravity is queried through its loopback-only local quota service. The app stores only its own preferences, bounded quota samples, event summaries, layout profiles, recovery points, and a sanitized incremental Codex usage index.

The optional Codex global reset outlook reads three public, unauthenticated tracker endpoints without sending provider credentials, account data, quota values, or local Token counts. It rejects stale data, uses the median of fresh forecasts, exposes source count/confidence, and lets only a fresh timed announcement or corroborated outlook affect planning. Your provider-reported personal reset time remains authoritative.

It does **not** store provider tokens, account IDs, prompts, chat history, raw quota responses, or local auth paths. It does not redeem reset credits or change provider account settings. See [Privacy](PRIVACY.md) and [Security](SECURITY.md) for the complete boundary.

## FAQ

### How do I check my Codex quota?

Install Quota Float on the same computer where Codex Desktop or Codex CLI is already signed in. The widget reads that existing local session and shows the available Codex usage windows and reset times.

### Does Quota Float calculate quota from local Token counts?

No. Quota remains provider-reported or comes from a supported local account cache. Separately, the Insights view can aggregate numeric `token_count` metadata already written by Codex; it does not use those counts to invent missing quota.

### Is the estimated cost my Codex bill?

No. It is an API-equivalent estimate using an embedded snapshot of official OpenAI standard token prices. Codex subscription usage, API billing, tool fees, regional processing, and special service tiers can differ.

### Do I need to enter an API key or copy a token?

No. Quota Float reuses supported local sign-in states in read-only mode. Never paste a token into an issue or diagnostic report.

### Can I monitor several coding assistants at once?

Yes. Every detected provider appears in the same widget, and you can reorder, hide, condense, or rotate providers.

### Does the browser preview show my real quota?

No. `npm run dev` uses mock data. Real quota reading requires the Tauri desktop app and an existing supported local login.

## Development

Requirements: Node.js 20+, Rust stable, and the [Tauri 2 system dependencies](https://v2.tauri.app/start/prerequisites/) for your platform.

```bash
npm install
npm run test
npm run build
npm run tauri dev
```

Build a desktop bundle with:

```bash
npm run tauri build
```

After a Codex Desktop update, run `npm run check:codex`. See the [provider compatibility contract](docs/PROVIDER-COMPATIBILITY.md), [Codex update compatibility guide](docs/CODEX-UPDATE-CHECK.md), and [release checklist](docs/GITHUB-RELEASE-CHECKLIST.md) for maintainer workflows.

Maintainers can start with the latest [v0.3.5 release record](docs/RELEASE-0.3.5.md), [project summary](docs/PROJECT-SUMMARY.md), [architecture and repository structure](docs/ARCHITECTURE.md), [distribution/signing guide](docs/DISTRIBUTION.md), and [desktop development SOP](docs/DESKTOP-DEVELOPMENT-SOP.md).

## Contributing

Bug reports, compatibility reports, feature requests, and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first, and remove personal data from screenshots and logs before posting.

## License

Quota Float is available under the [MIT License](LICENSE).

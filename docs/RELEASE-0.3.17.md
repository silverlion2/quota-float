# Quota Float v0.3.17 — custom usage dates and account totals

Published Stable, non-draft: [v0.3.17](https://github.com/silverlion2/quota-float/releases/tag/v0.3.17).

- Application commit: `1b3c989de61871610703b179befa672f31e8e251`.
- Release commit and dereferenced tag: `82c44b75ca9c9ac74bd2c1568542256a5b9e3f93`.
- [Source CI](https://github.com/silverlion2/quota-float/actions/runs/35233302751): success, including frontend checks, Windows/macOS desktop builds, strict Clippy and Windows native WebView smoke tests.
- [Release workflow](https://github.com/silverlion2/quota-float/actions/runs/35233768663): success; verify, release ref creation, both draft builds, upgrade smoke, finalization and public distribution all passed.

## Changes

- Custom local dates in Usage Insights apply to Token totals, trends, model/project/terminal filters, quota history and anonymized CSV/JSON/SVG exports. Invalid drafts retain the last applied selection; historical empty quota ranges never substitute current quota.
- Rolling multi-day charts include their starting boundary date, matching the total's range.
- Reset forecasts remain accessible through provider errors and retain still-valid public signals after refresh failure.
- Codex Profile lifetime statistics use the account endpoint shared with Codex Desktop; local detail indexing includes deduplicated archived sessions.

Implementation boundaries: [custom dates](VIBE-USAGE-REFERENCE-2026-09-17.md), [reset visibility](RESET-VISIBILITY-2026-09-17.md), [Codex Profile](CODEX-PROFILE-2026-09-17.md).

## Validation

- Local frontend full suite: 353 tests / 45 files passed, followed by 9 final targeted checks including an additional DST regression. All 6 custom-date tests also passed with the New York timezone.
- Local Windows Rust: 114 passed; one opt-in real-account Profile probe remained ignored. fmt, cargo check, strict all-targets Clippy, production build, version sync and diff checks passed.
- Bundle limits were retained: total JS 587,643 B, gzip JS 184,260 B, CSS 153,578 B. CSS/gzip headroom is small.
- Source CI and release verification passed on the exact source. OS-conditioned Windows native tests were skipped on macOS; that skip is not a macOS native smoke result.
- The exact release Windows executable and installer passed Microsoft Defender. Draft installer asset `570441611` passed installation, launch, v0.3.16 → v0.3.17 upgrade, rollback, reinstall and uninstall on an ephemeral Windows runner; the finalizer and public distribution job matched its identity and SHA-256 before/after publication.
- Both downloaded updater packages independently passed Ed25519/Blake2b signature and trusted-comment verification against the embedded public key; altered copies were rejected.

## Public assets

All six public assets were independently downloaded and their SHA-256 values matched the Release API below. `latest.json` version, platform URLs and signature text matched the distributed packages.

| Asset | Release API SHA-256 |
| --- | --- |
| latest.json | 3fbe6d60772b6f54a167cc0f1477f62a07de6e5428e5dc7d2ce4a0648b69e6ff |
| Quota.Float_0.3.17_universal.dmg | d55b4dd8272d642c878a76369e7c703aa30620e6ad70560ee35bedfe11cbbce3 |
| Quota.Float_0.3.17_x64-setup.exe | 88c6351ac022abb8a6333a180d048f490315f18e850a5253760dd66f0540dfeb |
| Quota.Float_0.3.17_x64-setup.exe.sig | 32c241bab211469a95c91595532c1f4adb9f0028ae24d4a9434688dcb279338f |
| Quota.Float_universal.app.tar.gz | 3425378e22e551aeea4be9bae6c9f695bbb3b6a56ab8436d599f40e35089ceac |
| Quota.Float_universal.app.tar.gz.sig | b6c7b2a501b9dc3495ff9ef1a0834696fcaf72b15a2dc3c3d0fdfdd63473d768 |

At release verification, local main, origin/main, tag and public Release target aligned to the release commit. Only the six version/Changelog files differ from the tested application commit. The subsequent evidence commit is documentation only and does not move the release tag or replace binaries.

## Limits and operations

Windows Authenticode, macOS Developer ID and notarization are not configured; updater integrity signatures are independent. Physical multi-monitor/DPI and real Mac UI validation remain unperformed in this release task.

Intermittent GitHub API EOF/TLS errors interrupted the local publish helper before dispatch. After confirming no active Release workflow, a direct authenticated dispatch ran the same guarded workflow once. No verification gate was bypassed. Release metadata, downloads and independent verification tools are retained under ignored `output/release-0.3.17`; no signing private key or provider credentials were read.

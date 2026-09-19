# Quota Float v0.3.19 — compact desktop widgets

Published Stable, non-draft: [v0.3.19](https://github.com/silverlion2/quota-float/releases/tag/v0.3.19).

- Application commit: `0bebdc60105af2172e3797d7173b00eeaa8d84ae`.
- Release workflow fixes: `1a71cc4c5cd2a2c2b6000ff4589186a2cf9fb202`.
- Release commit and dereferenced tag: `362fefc1954b97579dd7018cea01fc51e2605aee`.
- [Source CI](https://github.com/silverlion2/quota-float/actions/runs/35448662544): success.
- [Release workflow](https://github.com/silverlion2/quota-float/actions/runs/35448724542): all eight jobs succeeded, including shared draft creation, Windows and macOS packages, upgrade smoke, finalization and public distribution.

## Changes

Single-provider side Bar content shrinks from 64 × 320 to 64 × 156 logical pixels, with matching native bounds. Bar and Bottleneck geometry adapts to visible providers and preserves edge placement across expansion, provider changes and DPI recalculation. Compact keyboard access, status labels and expanded Dashboard/Cockpit/Stacked density were refined. See [design and geometry evidence](COMPACT-DENSITY-2026-09-19.md).

The unpublished 0.3.18 attempt exposed two parallel builders creating separate drafts. This release pre-creates one exact-commit draft, uses its explicit ID, serializes uploads to avoid updater-manifest races, and checks every manifest entry's version, URL and signature before publication. Failed 0.3.18 drafts and its tag were preserved.

The previous Defender helper could accept an exit-zero skipped scan. Custom scans now ignore file exclusions through `-DisableRemediation`, reject skipped/incomplete output and require successful completion. No machine exclusion policy was changed. See [Microsoft's command-line reference](https://learn.microsoft.com/en-us/defender-endpoint/command-line-arguments-microsoft-defender-antivirus).

## Validation

- Local frontend: 365 tests / 48 files passed; final release-specific regression run: 23 passed. Production build, version sync and diff checks passed.
- Application Rust fast gate: 116 passed / 1 existing opt-in real-account probe ignored; fmt, check and strict all-targets Clippy passed.
- Source CI: Ubuntu frontend 363 passed / 2 Windows-only tests skipped; Windows Rust 116 passed / 1 ignored; macOS Rust 105 passed / 1 ignored. Windows native WebView E2E: 11 passed. macOS native E2E is OS-skipped, not a native Mac UI result.
- Bundle limits passed: total JS 589,206 B, gzip JS 183,778 B, CSS 152,322 B.
- Exact 0.3.19 Windows executable and installer both emitted `Scan starting`, `Scan finished`, and `found no threats`; both passed Defender. Neither scan was skipped.
- Draft installer asset `574918131` passed installation, launch, v0.3.17 → v0.3.19 upgrade, rollback, reinstall and uninstall on an ephemeral Windows runner. Finalizer and public distribution verified the same asset identity and SHA-256.
- Independently downloaded updater packages passed Ed25519/Blake2b signature and trusted-comment verification against the embedded public key. Altered copies were rejected.

## Public assets

All six downloaded files matched the Release API SHA-256. The manifest version, platform URLs and signature text match the published packages.

| Asset | SHA-256 |
| --- | --- |
| latest.json | 5a2e3c5c30953681ade774f637537f904a5ea95c970226217fbeab8772702a16 |
| Quota.Float_0.3.19_universal.dmg | 413eada1e481ae0ddf5c4358c259c182690b3e4c312c75b1999e342c161e541d |
| Quota.Float_0.3.19_x64-setup.exe | 41e2a2791f2c4265540d0df1fd68e858e0a6b45476798d1e0c1b9ca8ccf23c8c |
| Quota.Float_0.3.19_x64-setup.exe.sig | 1de35836f5ab05d63680fcea39d4694981bbc4fec7a4c76c6bbce20e8ac483a6 |
| Quota.Float_universal.app.tar.gz | 208d9019edc213686b4b6d2eb58d0306ec78a4ba17002af327488c9a19ae5a3a |
| Quota.Float_universal.app.tar.gz.sig | e6d22256ba0efa147fa56b3e717b70e5f363ae29712bcd800e2a59b95d1262f4 |

At verification, local main, origin/main, tag and public Release target all matched the release commit. The subsequent evidence commit changes documentation only and does not move the tag or replace binaries.

## Limits and operations

Windows Authenticode, macOS Developer ID and notarization are not configured. Updater integrity signatures are separate and verified. Physical multi-monitor/DPI and real Mac UI validation were not performed in this task.

The local publish helper failed its login check before dispatch. After confirming no active Release run, a direct authenticated workflow dispatch succeeded and ran every existing release gate. Raw metadata, logs, public artifacts and independent verification scripts are retained under ignored `output/release-0.3.19`. No private signing key or provider credentials were read. This task did not replace the user's installed application.

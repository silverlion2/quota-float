# Independent Windows and macOS releases

Platform releases let a verified Windows update ship while shared Mac builders are unavailable. Each platform still has its own build, tests, asset validation and updater signatures. The existing combined release gate remains available for legacy clients.

## Channels and compatibility

- Legacy clients through 0.3.39 read GitHub's repository-wide `releases/latest/download/latest.json`. This address stays on the last verified combined release until a new combined release is ready.
- New clients read `https://raw.githubusercontent.com/silverlion2/quota-float/update-channels/stable/{{target}}.json`, where the native updater substitutes `windows` or `darwin`.
- Each file has its own truthful top-level version and only that platform's signed packages. A Windows release never changes the Darwin file, and vice versa.
- Channel updates use an atomic Git branch commit, preserve the other platform, and refuse version rollback. Installers remain attached to versioned GitHub releases.
- Windows clients using the legacy address need one manual installation of the first version with the new endpoint. Installing the 0.3.39 manual download fixes the AIHOT button but does not itself change the updater endpoint.
- macOS continues to check for updates and open the matching release for manual installation. Splitting channels does not enable unattended Mac installation.

Do not put a new Windows version and an old Mac package into one legacy manifest under the new version number. Tauri static manifests have one top-level version, so this would falsely advertise a Mac upgrade.

## Manual Windows distribution

The verified 0.3.39 installer is also available from [the Windows download release](https://github.com/silverlion2/quota-float/releases/tag/windows-v0.3.39). It uses the original verified installer bytes and updater signature, with a SHA256SUMS.txt file. It is marked prerelease and is not GitHub Latest, so it does not take over the legacy updater address. Its original combined-release draft and tag remain intact.

Windows Authenticode and macOS Developer ID/notarization are not currently configured. Updater signatures are verified separately and do not replace operating-system signing.

## Publishing

From a clean, validated main checkout:

```powershell
npm.cmd run publish:release -- patch --platform windows --yes
npm.cmd run publish:release -- patch --platform macos --yes
```

Single-platform publication supports stable versions. The default `all` mode retains the combined workflow, including its existing beta behavior. A platform release is not made repository-wide Latest. Only a fully verified combined release may advance that legacy pointer.

Windows upgrade validation covers both the previously published Windows channel version and the legacy migration baseline. Platform manifests are advanced only after the matching public assets have been downloaded and validated. A failure leaves the existing channel available; successful publication of one platform never implies the other platform was built or tested.

Record the source/release commit, tag, workflow run, selected platform, asset IDs and hashes, signature results, channel commit and legacy compatibility checks. Resume an interrupted run from its recovery record; do not create another version to recover a disconnected watcher.

## Rollback

The existing installer and settings-preservation recovery process remains available. Channel publication refuses an older version overwriting a newer feed. A rollback through the automatic updater therefore requires a new, higher application version containing the rollback, while retaining the previous immutable download for manual recovery.

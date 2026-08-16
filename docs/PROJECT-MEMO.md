# Quota Float Project Memo

Last updated: 2026-08-14

This memo records durable collaboration preferences and operational defaults for future maintenance tasks. It does not replace the desktop development SOP, release checks, or an explicit authorization for the current release.

## Release collaboration default

The preferred release request is:

> 发布 patch 到 main

When the user gives that instruction for a specific release, the maintainer agent should handle the complete release cycle:

1. Inspect the worktree, `main`, remote synchronization, version sources, changelog, and latest CI evidence.
2. Determine the next version from the requested channel; default `patch` means the next stable patch version.
3. Trigger the GitHub Actions `Release` workflow with `publish=false` and monitor the cloud dry run through completion.
4. If verification succeeds and the same request explicitly includes publishing, run the guarded `publish=true` path and respect the `release` Environment approval gate.
5. Monitor version commit/tag creation, Windows and macOS builds, Microsoft Defender scanning, updater signatures, artifact completeness, public Release state, and the stable Windows upgrade smoke.
6. Verify local/remote Git alignment and save a release evidence record under `docs/`.
7. Report failures without bypassing tests, protection rules, signing, Defender, artifact checks, or required approval.

## Standing behavior

- Prefer GitHub-hosted packaging and publishing over repeating native builds locally.
- Run `publish=false` first unless the user explicitly asks to skip directly to a formal release and the release workflow remains guarded.
- Ordinary commits and pushes to `main` do not create a new product release.
- Do not infer a release from phrases such as “save,” “commit,” “push,” “merge,” “finish,” or roadmap approval.
- A prior release instruction is not standing authorization for later releases. Commit, push, tag, and public release boundaries must be satisfied by the current request.
- If `main` changes after verification, restart verification instead of publishing the stale candidate.
- If a platform build, Defender scan, signature, artifact inventory, or upgrade smoke fails, keep the Release unpublished/draft and report the failing gate.
- Do not expose signing keys, provider credentials, account identifiers, local auth paths, or raw provider responses in logs or release evidence.

## One-time repository setup

These settings should persist and do not need to be recreated for every release:

- Repository Secrets: `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
- GitHub Environment: `release`, preferably with a required reviewer before the workflow creates the release commit and tag.
- GitHub Actions permissions and branch protection must allow the authorized workflow to atomically push the release commit and tag.

If any one-time setting is missing or has expired, stop before publishing and request the minimum necessary repository change. Do not replace the updater key or weaken branch/environment protection as a workaround.

## Current implementation

- Workflow: `.github/workflows/release.yml`
- Local fallback/version helper: `scripts/release.mjs`
- Release automation tests: `scripts/release.test.mjs`
- Operational guide: [RELEASE.md](RELEASE.md)
- Checklist: [GITHUB-RELEASE-CHECKLIST.md](GITHUB-RELEASE-CHECKLIST.md)
- Latest evidence record: [RELEASE-0.2.24.md](RELEASE-0.2.24.md)

The online workflow supports `patch`, `minor`, `major`, `beta`, `stable`, or an explicit `x.y.z[-beta.n]`. It keeps external `v*` tag compatibility while avoiding reliance on a second workflow being triggered by a tag created with the default GitHub Actions token.

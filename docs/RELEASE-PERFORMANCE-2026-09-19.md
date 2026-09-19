# Release performance audit — 2026-09-19

The baseline below was measured before implementation. The user subsequently approved implementing the optimization. The local changes and verification are recorded here; the 8–10 minute target remains an estimate until the new workflow runs on GitHub.

## Implemented and verified locally

- Independent `publish-windows` and `publish-macos` jobs run concurrently with `includeUpdaterJson: false`. One `assemble-updater` job writes the complete manifest after both pass. Exact draft/commit, version-specific filenames, unique assets and unchanged asset identities are enforced.
- Windows upgrade smoke depends only on the completed Windows job and uses its explicit draft ID; final publication still requires macOS, manifest assembly and the exact upgraded installer.
- Both build jobs retain `shared-key: publish-draft`, matching the previous Rust cache namespace. The cache action still includes OS, architecture and toolchain/environment hashes; splitting job names does not intentionally cold-start caches. Confirmed against the old run's restored cache key and [rust-cache key construction](https://raw.githubusercontent.com/Swatinem/rust-cache/v2/src/config.ts).
- The publishing helper persists a dispatch record before sending the request, supports `--resume [RUN_ID] [--record PATH]`, retries reads/fetches, and reconnects the same watched run at most twice. Ambiguous dispatches are discovered rather than repeated. Repository, workflow, source, mode and target identity are checked; main may advance only if it still contains the release commit.
- Public downloads, six SHA-256 checks, all manifest platform entries, two updater signatures and trusted comments are automatically verified using the public key from the release commit. Reports include per-job timings and elapsed workflow time without summing concurrent jobs.
- CI conservatively recognizes documentation-only changes, preserves the original successful check job names, and skips expensive steps. Unknown/mixed changes or diff errors run the full gate. Manual CI always runs in full; superseded ordinary CI can be cancelled without cancelling Release.

Validation: full frontend suite 403 passed / 51 files; an additional timing regression was then added and the 28 affected publish/artifact/workflow checks passed. Rust 116 passed / 1 existing opt-in probe ignored; fmt/check/strict Clippy, production build, unchanged bundle budgets, version sync and diff checks passed. Actionlint 1.7.12 accepted both changed workflows.

A read-only end-to-end `--resume` exercise against public v0.3.19 (run `35448724542`) succeeded, including live downloads and cryptographic verification. The test record was constructed from the already verified run metadata because that older workflow predates recovery records. Main had advanced to the documentation commit, and the report correctly recorded `mainAdvanced: true`. Evidence is under ignored `output/release-0.3.19/resume-validation.log` and `output/release-runs/35448724542-verification.json`. No new version, tag or release was created.

The new parallel publish path has static and mocked-gate coverage, not a new live publication measurement. Broad reuse of ordinary CI as release verification and removal of regular CI's unsigned packaging are deferred; Linux release verification remains intact.

## Measured baseline

Sources: [v0.3.19 Release](https://github.com/silverlion2/quota-float/actions/runs/35448724542), [source CI](https://github.com/silverlion2/quota-float/actions/runs/35448662544), [failed v0.3.18 attempt](https://github.com/silverlion2/quota-float/actions/runs/35447385171), [v0.3.17 Release](https://github.com/silverlion2/quota-float/actions/runs/35233768663). Job/step timestamps were retrieved from GitHub's Jobs API; raw responses are under ignored `output/release-0.3.19/*timing.json`.

| v0.3.19 critical-path stage | Duration | Relevant detail |
| --- | ---: | --- |
| Linux verification | 2m 40s | Desktop dependency installation 55s; release tests/build 60s; Rust cache restore 19s |
| Release ref + shared draft | 12s | Separate jobs, excluding runner gaps |
| Windows package job | 4m 02s | Build/upload 2m 36s; Defender 7s |
| macOS package job | 4m 27s | Build/upload 3m 26s; currently waits for Windows |
| Install/upgrade/rollback/uninstall | 1m 20s | Actual smoke step 67s |
| Finalize + public distribution | 8s | Excluding runner gaps |
| Observed first job start to last job completion | **13m 15s** | Includes 28s of inter-job gaps |

The first failed release ran for 10m 21s. The gap from that failure to the successful run's first job was 15m 55s, including diagnosis, implementation, regression checks, push and dispatch. First attempt creation to final completion was 39m 31s; this is not the duration of a single successful workflow. v0.3.17, with parallel packaging, took 9m 30s from first job start to final completion (different source/build conditions).

Source CI also built unsigned packages: Windows packaging 137s, macOS packaging 126s; Windows additionally built its isolated synthetic-data native E2E binary for 138s. CI and Release overlapped, so these durations must not simply be added to the release critical path. CI frontend tests took 19s; reducing those is not the first priority.

Rust cache already works: the Windows release restored about 526 MB successfully in a 22s cache step. There is no evidence that a missing cache explains the whole delay.

## Prioritized changes

### 1. Parallel packages; one updater-manifest writer

Keep serial creation of one draft at the exact release commit. Remove matrix `max-parallel: 1`; set tauri-action `includeUpdaterJson: false`. Each OS uploads only its own uniquely named packages/signatures into the pre-created `releaseId`.

After both platform jobs succeed, one `assemble-updater` job obtains the draft's exact assets and signatures and creates `latest.json` once. Preserve version, draft ID, platform URL, signature, asset identity and digest checks before publication. Require exactly one asset per expected package/signature name and deterministic platform entries; reject missing assets and unexpected versions. Retain both legacy and installer-specific platform keys.

This addresses the actual race rather than serializing expensive compilation. The [official tauri-action input](https://raw.githubusercontent.com/tauri-apps/tauri-action/v0/action.yml) supports disabling updater JSON; its [updater implementation](https://raw.githubusercontent.com/tauri-apps/tauri-action/v0/src/upload-version-json.ts) currently reads, merges, deletes and reuploads a shared manifest.

Holding observed durations constant, parallelizing the two package jobs removes about 4 minutes, projecting roughly **9–10 minutes** including a new small manifest job. This is an estimate, not a measured improvement.

### 2. Overlap Windows upgrade smoke with macOS work

Split named Windows/macOS package jobs (or introduce an explicit Windows artifact-ready dependency). Run upgrade smoke only after the Windows job has completed its exact-package Defender/signing checks. It can then overlap the remaining macOS work. Finalize still requires both package jobs, the complete manifest and successful upgrade evidence. Do not depend on a partially completed matrix or remove the exact installer gate.

Based on this run, that could hide much of the 80s upgrade job and bring the first two changes toward **8–9 minutes**. Runner variance and new coordination overhead apply; estimates are not additive beyond this model.

### 3. Make the local helper resumable

Persist repository, source SHA, intended tag and dispatched run ID. Retry read-only API/fetch operations on bounded transient network failures. After an ambiguous dispatch, discover the matching existing run before considering any new dispatch; fail on ambiguity. Resume watching and post-publication verification by run ID. A `gh run watch` connection error must not be reported as proof that the remote workflow failed. Preserve authentication failures as errors; do not disable certificate verification.

Automate public downloads, hashes, updater signature verification and a concise evidence report. This removes manual recovery and documentation time without weakening artifact checks. This turn's login/EOF failures demonstrate the need, but no stable numeric saving can be promised.

### 4. Reduce duplicate work carefully

- Add a CI change-classification job so documentation-only commits do not rebuild Windows/macOS installers. Keep required check names reporting success rather than leaving branch-protection checks indefinitely pending. Retain a manually invocable full check.
- Add per-branch cancellation for superseded ordinary CI runs; never cancel a publishing Release job.
- Consider retaining ordinary CI's tests, Clippy and native E2E while moving redundant distributable packaging to the Release workflow, or make full unsigned packaging explicit/nightly. Preserve native E2E and exact release package checks.
- Reuse verification only for the exact source SHA, trusted workflow/configuration and the same required check set. Current ordinary CI does not run Linux Rust tests, so its green status cannot replace the current Linux release verification wholesale. Reuse must fail closed or run the full fallback, and it must not reuse pre-version-bump binaries as a different release.
- Avoid requesting a full remote dry run immediately followed by a formal publish for the same source; the formal workflow already contains verification. Reusable verification receipts are a later optimization, not a reason to skip checks now.

Cache tuning is lower priority until measured separately. [rust-cache](https://github.com/Swatinem/rust-cache) offers shared keys; changes should preserve OS/target/toolchain/profile isolation and compare cache restore/save costs and compiler time. Avoid treating a cache hit as verified artifact provenance.

## Acceptance criteria for implementation

1. Both OS builders start in parallel and only one job writes the updater manifest.
2. Failure on either OS, missing/stale manifest entry, signature mismatch, skipped Defender scan, changed installer digest or failed upgrade blocks publication.
3. Network interruption resumes the existing run; no extra version/tag/draft is created.
4. Documentation-only changes avoid native package builds while required check status remains valid.
5. Record at least the next three releases' timings, cache state and retries. Compare median workflow duration and total human-facing completion time separately.

The 7s Defender scan and 80s upgrade lifecycle gate remain intact. No estimate above depends on deleting security or installability checks.

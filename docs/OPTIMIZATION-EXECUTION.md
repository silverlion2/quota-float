# Quota Float optimization execution ledger

Updated: 2026-09-08. Coordinator: 01a07c5f-ddbd-7a71-b700-a96c2ad33d21.

User authorized implementation of the full review and local commits until completion. Push, tags, releases, certificate changes, external submissions, and user-system installs remain separate boundaries. Preserve the desktop SOP and local-first read-only provider access. Completed means implemented and verified, not merely proposed. Device/environment blockers remain open.

## Batch 1 — committed

Commit: `7a3db22ed9dd3cf308bc644a088ba2afb50dfcbb`.
Validation: 227 frontend tests, 82 Rust tests, production build, fmt, check, strict clippy, diff, version and bundle checks passed in the integration workspace. Workflow YAML and PowerShell AST checks passed. No release/install performed.

| Review item | State | Evidence / remaining work |
|---|---|---|
| Shared per-provider cache consistency | Complete | Targeted merge and last-known-good tests |
| Detached windows bypassing pause/focus | Complete | Dedicated cache-only command; no provider fetch |
| Model price catalog refresh | Complete | Sol corrected, Astra added, verifiedAt and historical repricing explained |
| Quota refresh blocked by reset forecast | Complete | Independent latest-request guarded forecast |
| Upgrade gate before public release | Implemented, live runner pending | Draft identity/digest gate and script tests; no remote execution |
| Backup export/import size symmetry | Complete | Same 20 MiB serialized limit and round-trip tests |
| Each index fallback candidate bounded | Complete | Per-candidate read bounds; corrupt/oversized primary tests |
| Native runtime-state envelope bounds | Complete for current scope | Types, legacy versions, existing collection limits, compatible notification maps |
| Compatibility workflow paths | Complete | Correct src/lib paths |

## Batch 2 — integrated

All workers start from `7a3db22`; retain old work via stash before switching. Do not allocate new C-drive dependency caches. Workers run targeted checks and provide patches; coordinator integrates, runs full gates serially on D:, then commits.

| Task ID | Patch | Owned scope |
|---|---|---|
| 01a07c85-e413-71b1-b7cb-d626ea764d02 | updates-ui.patch | Beta timeout/concurrency/version selection; channel invalidation; entry lazy loading and error boundaries |
| 01a07c86-1ae5-7060-9341-cc5a8b68cac3 | storage-performance.patch | Extract bounded storage helpers; focused native history reads; isolate Qoder blocking IO |
| 01a07c86-2b6e-7430-9496-ab48c23670c2 | toolchain-e2e.patch | Runtime/toolchain requirements; dependency maintenance; Dependabot groups/overrides; isolated native E2E and CI |
| 01a07c85-e433-7201-9b44-e9ab5c67d5c5 | usage-docs.patch | Retention/coverage and budget semantics; accurate platform matrix and version documentation |

## Remaining review coverage

### Batch 2 partial acceptance — usage and recovery

Integrated `usage-docs.patch` (SHA-256 `0B73D2879D021FE96A49723A897E5F4CFCCBFC1F65DC6CE707C62F76C0B38870`) and coordinator provider recovery guidance. Retention and actual coverage are explicit; selected-range projections and current-month accumulated API-equivalent cost are separate; platform/source and published-version documentation match repository evidence. Health guidance uses trusted provider/status/platform values only.

Validation for commit `3339534`: full frontend run exercised 232 tests; the sole stale retention-label assertion was updated and the affected 13 tests then passed. Production build, bundle budgets, 82 Rust tests, fmt, check, strict clippy, version and diff checks passed. The usage/docs task was archived after that commit.

### Batch 2 remaining integration

Integrated updates/UI, storage/performance, and toolchain/E2E patches, including coordinator-requested fixes for channel changes during download, the oldest heatmap calendar day, detached-window E2E permissions and render readiness. Storage now writes compact JSON without dropping legal history; a 120,000-record test round-trips below 20 MiB. Bounded legacy runtime reads preserve existing pretty JSON. Qoder blocking IO is isolated and bounded. Detached windows request bounded provider-specific history. Error boundaries and lazy auxiliary entries are implemented. Dependency major migrations were assessed and explicitly deferred in `DEPENDENCY-POLICY.md`; no package-version upgrade is claimed.

Integrated frontend validation: 35 files / 246 tests passed; production build and bundle budgets passed (entry 212,948 B; all JS 559,837 B; gzip JS 174,948 B). Entry plus shared preloads is larger than the entry alone, so this is not a measured startup-speed claim. Rust: 84 tests passed; fmt and check passed. E2E spec TypeScript, workflow YAML, capability JSON and version checks passed. Native E2E later passed all five Windows scenarios after the fixes recorded in NATIVE-E2E-2026-09-08.md.

### Batch 3 progress

- Progressive results: assigned to `01a07c85-e413-71b1-b7cb-d626ea764d02`, baseline `3bf4721`.
- Opaque project identity and on-demand weekly/monthly reports: assigned to `01a07c86-1ae5-7060-9341-cc5a8b68cac3`, same baseline.
- Measurement tooling: integrated the reproducible synthetic history script and the bounded single-process CPU/memory sampler from `01a07c86-2b6e-7430-9496-ab48c23670c2`. Node fixture ran successfully; PowerShell AST and a 5-second capture of the explicitly identified E2E process passed (six rows). This short active-test capture validates the tool only, not idle performance, whole-app memory, startup or disk IO. The sampler explicitly excludes WebView2/GPU child processes. Committed as 8f7a4a1; this task is now archived.
- Native E2E: the isolated release binary builds. Unrestricted local execution revealed test hover/persisted-state/stale-element issues and a real Windows detached-window deadlock in synchronous `open_focus_panel`. Coordinator changed the command to async; rebuilt native E2E passed all five scenarios, including detached create/render/close. Production frontend output was restored. See NATIVE-E2E-2026-09-08.md.

| Review item | State | Completion criterion |
|---|---|---|
| Windows multi-DPI/multi-monitor visual acceptance | Device validation pending | Real supported display configurations and recorded results |
| Real Mac window/runtime acceptance | Device unavailable in current scope | Real Mac artifact and runtime/visual evidence |
| Per-provider progressive results | Batch 3 active | Healthy provider data visible before slow batch finishes; no duplicate notifications |
| Blocking adapter IO bounds | Complete for Qoder; other adapters retain existing limits | Read-only blocking isolation and meaningful timeout/size/SQLite limits |
| Runtime state writes and large-history performance | Batch 2 / follow-up measurement | Serialize/coalesce writes if warranted, benchmark realistic bounded history |
| Honest retention and truncation semantics | Complete | UI/docs reflect finite capacity and actual coverage |
| Focused history IPC | Complete | Detached pane receives only bounded target data |
| Desktop performance budgets | Coordinator follow-up | Reproducible startup/idle/CPU/memory/IO measurement with explicit environment limitations |
| Lazy auxiliary entries | Complete; build and native focus-window smoke passed | Build measurements and correct preview/focus startup |
| Beta timeout/cancellation/single-flight | Complete | Race and retry tests |
| Beta highest supported version/channel policy | Complete | Valid semantic version candidates and stable transition policy |
| Native E2E in CI | Configured; local Windows execution passed, remote CI pending | Isolated fixture, no real credentials; automated smoke configuration and runnable tests |
| Platform support matrix | Complete | Source-backed Windows/macOS support statuses |
| Version/docs/screenshots accuracy | Batch 2 / follow-up | Source version separated from published/verified versions; screenshots only from actual render |
| OS signing/notarization | Certificate/environment dependent | Verify project-owned signing and exact artifacts only with authorization |
| Node/Rust toolchain requirements | Complete | Declared requirements match CI/native config loader |
| Dependency upgrades | Assessment complete; major migrations explicitly deferred | Official migration/compatibility checked; local gates pass; no blind version churn |
| Dependency update groups/override lifecycle | Complete | Bounded groups and documented removal conditions |
| Core module responsibility separation | Batch 2 / follow-up | Incremental storage/UI/scheduling extraction with behavior tests |
| UI error isolation | Complete | Localized recovery without sensitive stack/data exposure |
| Actionable provider errors | Complete | Safe localized guidance in commit 3339534 |
| Budget selection semantics | Complete | Selected-window projection and on-open alert limitations explicit |
| Same-name project identity | Batch 3 active | Local opaque identity, migration and export privacy; no stored raw paths |
| Local weekly/monthly aggregate reports | Batch 3 active | Prompt-free bounded local summaries and coverage labeling |
| macOS in-app updater | Platform-dependent evaluation | Existing fallback preserved until signed real update validation |
| Additional providers/macOS adapters | Source-dependent evaluation | Identified read-only source and fixtures; no fabricated support |
| Bottom Bar | Separate design required | Existing explicit exclusion honored until interaction/geometry scope is resolved |

Do not mark the whole program complete while open validation or implementation items remain. Record justified decisions for conditional items, rather than silently dropping them. Continue independent achievable work if an item depends on a device or external authorization.

## 归档规则（用户追加）

及时归档已完成、已整合且不再承担后续工作的任务，使用 set_thread_archived。用量/文档任务 01a07c85-e433-7201-9b44-e9ab5c67d5c5 已在 3339534 提交后归档。其他任务按后续实际分工保留或归档；总控在全量工作闭环前保留。任务归档不代表删除补丁、代码或工作树；任何磁盘清理另按明确范围安全处理。

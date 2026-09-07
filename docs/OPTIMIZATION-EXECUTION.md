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

## Batch 2 — active in existing task worktrees

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

Validation: full frontend run exercised 232 tests; the sole stale retention-label assertion was updated and the affected 13 tests then passed. Production build, bundle budgets, 82 Rust tests, fmt, check, strict clippy, version and diff checks passed. The usage/docs task has no remaining assigned work and can be archived after this commit. Other batch 2 patches remain under review.

| Review item | State | Completion criterion |
|---|---|---|
| Windows multi-DPI/multi-monitor visual acceptance | Device validation pending | Real supported display configurations and recorded results |
| Real Mac window/runtime acceptance | Device unavailable in current scope | Real Mac artifact and runtime/visual evidence |
| Per-provider progressive results | Next implementation | Healthy provider data visible before slow batch finishes; no duplicate notifications |
| Blocking adapter IO bounds | Batch 2 | Read-only blocking isolation and meaningful timeout/size/SQLite limits |
| Runtime state writes and large-history performance | Batch 2 / follow-up measurement | Serialize/coalesce writes if warranted, benchmark realistic bounded history |
| Honest retention and truncation semantics | Batch 2 | UI/docs reflect finite capacity and actual coverage |
| Focused history IPC | Batch 2 | Detached pane receives only bounded target data |
| Desktop performance budgets | Coordinator follow-up | Reproducible startup/idle/CPU/memory/IO measurement with explicit environment limitations |
| Lazy auxiliary entries | Batch 2 | Build measurements and correct preview/focus startup |
| Beta timeout/cancellation/single-flight | Batch 2 | Race and retry tests |
| Beta highest supported version/channel policy | Batch 2 | Valid semantic version candidates and stable transition policy |
| Native E2E in CI | Batch 2 | Isolated fixture, no real credentials; automated smoke configuration and runnable tests |
| Platform support matrix | Batch 2 | Source-backed Windows/macOS support statuses |
| Version/docs/screenshots accuracy | Batch 2 / follow-up | Source version separated from published/verified versions; screenshots only from actual render |
| OS signing/notarization | Certificate/environment dependent | Verify project-owned signing and exact artifacts only with authorization |
| Node/Rust toolchain requirements | Batch 2 | Declared requirements match CI/native config loader |
| Dependency upgrades | Batch 2 assessment + safe upgrades | Official migration/compatibility checked; local gates pass; no blind version churn |
| Dependency update groups/override lifecycle | Batch 2 | Bounded groups and documented removal conditions |
| Core module responsibility separation | Batch 2 / follow-up | Incremental storage/UI/scheduling extraction with behavior tests |
| UI error isolation | Batch 2 | Localized recovery without sensitive stack/data exposure |
| Actionable provider errors | Follow-up | Safe error codes / localized next steps for unavailable/signed-out/unsupported states |
| Budget selection semantics | Batch 2 | Selected-window projection and on-open alert limitations explicit |
| Same-name project identity | Design then implementation | Local opaque identity, migration and export privacy; no stored raw paths |
| Local weekly/monthly aggregate reports | Design then implementation | Prompt-free bounded local summaries and coverage labeling |
| macOS in-app updater | Platform-dependent evaluation | Existing fallback preserved until signed real update validation |
| Additional providers/macOS adapters | Source-dependent evaluation | Identified read-only source and fixtures; no fabricated support |
| Bottom Bar | Separate design required | Existing explicit exclusion honored until interaction/geometry scope is resolved |

Do not mark the whole program complete while open validation or implementation items remain. Record justified decisions for conditional items, rather than silently dropping them. Continue independent achievable work if an item depends on a device or external authorization.

## 归档规则（用户追加）

及时归档已完成、已整合且不再承担后续工作的任务，使用 set_thread_archived。当前四个任务复用于第二批，仍需保留。总控在全量工作闭环前保留。任务归档不代表删除补丁、代码或工作树；任何磁盘清理另按明确范围安全处理。

<!-- portfolio-upgrade-dialogue:start -->
# Upgrade Dialogue

> Generated: 2026-08-23 Asia/Shanghai
> Mode: planning only — no upgrade below is approved merely because it appears here.
> Portfolio overview: `outputs/portfolio_overview_2026-08-23.md` in the originating Codex task.

## Project snapshot

- Workspace: `D:\workspace\quota-float`
- Stance: **active — bounded next gate**
- Health signal: **83/100** (portfolio heuristic, not a release certification)
- Git: `main`; 0 changed entries; last commit 2026-08-22T16:44:27+08:00
- Stack: React, Vite, Tauri/Rust
- Quality signals: tests detected; CI detected; deployment not detected
- Website SOP: not classified as a website root

**Current purpose signal:** Quota Float — Coding Assistant Quota Monitor

## Proposal 1: Close native platform evidence

- **Category:** 🧪 Testing
- **Effort:** 2–4h
- **Why now:** v0.3.0 is shipped and the codebase is clean, while the feedback tracker still has real Windows scaling, edge-docking, and macOS visual checks pending.
- **How:**
  1. Install the exact v0.3.0 artifacts.
  2. Run the documented Windows DPI/multi-monitor matrix and obtain one real Mac smoke result.
  3. Record screenshots and pass/fail evidence without changing code unless a defect reproduces.

## Proposal 2: Run a feedback and adoption sprint

- **Category:** 📣 Distribution
- **Effort:** 3h
- **Why now:** The project has reached diminishing returns from another feature batch; usage evidence is now the highest-value input.
- **How:**
  1. Choose one target community and one user segment.
  2. Publish the release with a single feedback question.
  3. Track installs, issue reports, and provider requests for seven days.

## Proposal 3: Finish trust-grade signing decisions

- **Category:** 📦 Publishing
- **Effort:** 4–8h + certificates
- **Why now:** The updater is signed, but Authenticode and macOS notarization remain distinct trust gates.
- **How:**
  1. Decide whether certificates are worth the cost now.
  2. If yes, run the existing optional signing paths and verify signatures.
  3. If no, publish the limitation clearly and defer with an explicit trigger.

## Decision dialogue

Choose one before implementation:

- **A — Execute one proposal:** name the proposal and the intended measurable outcome.
- **B — Rewrite the plan:** state the user, deadline, and constraint that this dialogue missed.
- **C — Pause/archive:** record an owner, preservation rule, and exact reactivation trigger.

Before any implementation, re-read local `AGENTS.md` and project memory, inspect the current worktree, identify blast radius, use a non-main branch where applicable, and run the repository-owned verification gates. External publishing, deployment, payments, messages, clinical claims, trades, or destructive cleanup remain separate authorization boundaries.
<!-- portfolio-upgrade-dialogue:end -->

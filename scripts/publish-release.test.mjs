import { describe, expect, it, vi } from "vitest";
import {
  missingReleaseAssets,
  dispatchOnceAndRecover,
  releaseVerificationErrors,
  selectNewWorkflowRun,
  workflowVerificationErrors,
  workflowTimings,
  observeWorkflowRun,
  parsePublishArgs,
  recoveryRecordFromRun,
  retryRead,
  runIdentityErrors,
  releaseAncestryErrors,
  runOutcome,
  validateRecoveryRecord,
} from "./publish-release.mjs";

const assets = [
  "latest.json",
  "Quota.Float_0.3.9_x64-setup.exe",
  "Quota.Float_0.3.9_x64-setup.exe.sig",
  "Quota.Float_0.3.9_universal.dmg",
  "Quota.Float_universal.app.tar.gz",
  "Quota.Float_universal.app.tar.gz.sig",
];

describe("one-command release publishing", () => {
  it("records elapsed workflow time without double-counting parallel jobs or skipped timestamps", () => {
    const timings = workflowTimings([
      { name: "windows", startedAt: "2026-09-19T00:00:00Z", completedAt: "2026-09-19T00:04:00Z", conclusion: "success" },
      { name: "macos", startedAt: "2026-09-19T00:00:00Z", completedAt: "2026-09-19T00:05:00Z", conclusion: "success" },
      { name: "publish", startedAt: "2026-09-19T00:05:10Z", completedAt: "2026-09-19T00:05:20Z", conclusion: "success" },
      { name: "skipped", startedAt: "0001-01-01T00:00:00Z", completedAt: "2026-09-19T00:00:00Z", conclusion: "skipped" },
      { name: "missing" },
    ]);
    expect(timings.elapsedSeconds).toBe(320);
    expect(timings.jobs.map((job) => job.seconds)).toEqual([240, 300, 10]);
    expect(workflowTimings([])).toEqual({ elapsedSeconds: null, jobs: [] });
  });
  const sourceSha = "a".repeat(40);
  const record = { schema: 1, repo: "owner/quota-float", workflow: "release.yml", sourceSha, versionSpec: "patch", tag: "v0.3.18", mode: "publish", runId: "42", previousRunIds: ["41"] };
  const remote = { id: 42, repository: { full_name: "owner/quota-float" }, path: ".github/workflows/release.yml", event: "workflow_dispatch", head_branch: "main", head_sha: sourceSha, display_title: "Release patch (publish=true)" };

  it("keeps resume separate from every publishing option", () => {
    expect(parsePublishArgs(["--resume"])).toMatchObject({ resume: true, runId: null, publish: false });
    expect(parsePublishArgs(["--resume", "42", "--record", "output/custom.json"])).toMatchObject({ resume: true, runId: "42", recordExplicit: true });
    for (const extra of ["--yes", "--dry-run", "--plan", "patch"]) {
      expect(() => parsePublishArgs(["--resume", "42", extra])).toThrow();
    }
    expect(() => parsePublishArgs(["--resume", "wrong"])).toThrow("numeric");
    expect(() => parsePublishArgs(["--resume", "--record"])).toThrow("path");
    expect(() => parsePublishArgs(["patch", "--yes", "--wat"])).toThrow("Unknown");
  });

  it("rejects recovery records for another repository or malformed identity", () => {
    expect(validateRecoveryRecord(record, record.repo)).toBe(record);
    for (const change of [{ repo: "other/project" }, { workflow: "ci.yml" }, { sourceSha: "main" }, { tag: "latest" }, { mode: "maybe" }, { runId: "not-an-id" }, { previousRunIds: ["wrong"] }]) {
      expect(() => validateRecoveryRecord({ ...record, ...change }, record.repo)).toThrow();
    }
  });

  it("binds recovery to remote source, repository, workflow, mode and target version", () => {
    expect(runIdentityErrors(record, remote, "0.3.17")).toEqual([]);
    for (const change of [{ id: 43 }, { repository: { full_name: "other/project" } }, { path: ".github/workflows/ci.yml" }, { event: "push" }, { head_branch: "feature" }, { head_sha: "b".repeat(40) }, { display_title: "Release minor (publish=true)" }, { display_title: "Release patch (publish=false)" }]) {
      expect(runIdentityErrors(record, { ...remote, ...change }, "0.3.17").length).toBeGreaterThan(0);
    }
    expect(runIdentityErrors(record, remote, "0.3.18")).toContain("target version mismatch");
    expect(runIdentityErrors(record, remote, "unknown")).toContain("source version cannot produce the recorded target");
  });

  it("reconstructs a record only from a mode-bound run and its source tree version", () => {
    expect(recoveryRecordFromRun(remote, record.repo, "0.3.17")).toMatchObject({ tag: "v0.3.18", sourceSha, mode: "publish", runId: "42" });
    expect(recoveryRecordFromRun({ ...remote, display_title: "Release patch (publish=false)" }, record.repo, "0.3.17").mode).toBe("dry-run");
    expect(() => recoveryRecordFromRun({ ...remote, display_title: "Release patch" }, record.repo, "0.3.17")).toThrow("original recovery record");
    expect(() => recoveryRecordFromRun(remote, "other/project", "0.3.17")).toThrow("repository mismatch");
  });

  it("does not turn a disconnected watch into a failed remote workflow", async () => {
    const read = vi.fn().mockResolvedValue({ status: "in_progress", conclusion: null });
    const watch = vi.fn().mockReturnValue({ status: 1 });
    const details = await observeWorkflowRun({ status: "in_progress" }, { watch, read, reconnects: 0 });
    expect(read).toHaveBeenCalledOnce();
    expect(runOutcome(details)).toBe("pending");
    read.mockResolvedValue({ status: "completed", conclusion: "success" });
    expect(runOutcome(await observeWorkflowRun({ status: "in_progress" }, { watch, read }))).toBe("success");
    watch.mockImplementation(() => { throw new Error("disconnected"); });
    expect(runOutcome(await observeWorkflowRun({ status: "in_progress" }, { watch, read }))).toBe("success");
    read.mockRejectedValue(new Error("network unavailable"));
    await expect(observeWorkflowRun({ status: "in_progress" }, { watch, read })).rejects.toThrow("network unavailable");
  });

  it("does not watch a completed run and identifies actual terminal failure", async () => {
    const watch = vi.fn();
    const read = vi.fn().mockResolvedValue({ status: "completed", conclusion: "failure" });
    expect(runOutcome(await observeWorkflowRun({ status: "completed" }, { watch, read }))).toBe("failed");
    expect(watch).not.toHaveBeenCalled();
    expect(runOutcome({ status: "completed", conclusion: null })).toBe("unknown");
  });

  it("reconnects only the existing run at most twice after watch disconnects", async () => {
    const watch = vi.fn().mockReturnValue({ status: 1 });
    const read = vi.fn().mockResolvedValue({ status: "in_progress", conclusion: null });
    expect(runOutcome(await observeWorkflowRun({ status: "in_progress" }, { watch, read }))).toBe("pending");
    expect(watch).toHaveBeenCalledTimes(3);
    expect(read).toHaveBeenCalledTimes(3);
    watch.mockClear(); read.mockReset();
    read.mockResolvedValueOnce({ status: "in_progress" }).mockResolvedValueOnce({ status: "completed", conclusion: "success" });
    expect(runOutcome(await observeWorkflowRun({ status: "in_progress" }, { watch, read }))).toBe("success");
    expect(watch).toHaveBeenCalledTimes(2);
  });

  it("allows main to advance after release only when it contains the same release commit", () => {
    const tag = { sha: "tag-commit" };
    expect(releaseAncestryErrors(tag, tag, null)).toEqual([]);
    expect(releaseAncestryErrors(tag, { sha: "new-main" }, { status: "ahead", merge_base_commit: tag })).toEqual([]);
    for (const comparison of [null, { status: "behind", merge_base_commit: tag }, { status: "diverged", merge_base_commit: tag }, { status: "ahead", merge_base_commit: { sha: "other" } }]) {
      expect(releaseAncestryErrors(tag, { sha: "new-main" }, comparison)).toContain("current main does not contain the verified release commit");
    }
  });

  it("limits read retries and preserves a successful subsequent response", async () => {
    const wait = vi.fn().mockResolvedValue();
    const operation = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ id: 42 });
    await expect(retryRead(operation, { wait })).resolves.toEqual({ id: 42 });
    expect(operation).toHaveBeenCalledTimes(2);
    const broken = vi.fn().mockRejectedValue(new Error("offline"));
    await expect(retryRead(broken, { wait })).rejects.toThrow("offline");
    expect(broken).toHaveBeenCalledTimes(3);
  });

  it("fails closed instead of choosing among ambiguous dispatch matches", () => {
    const runs = [42, 43].map((databaseId) => ({ databaseId, event: "workflow_dispatch", headSha: sourceSha }));
    expect(() => selectNewWorkflowRun(runs, new Set(), sourceSha)).toThrow("Multiple");
    expect(selectNewWorkflowRun([], new Set(), sourceSha)).toBeUndefined();
  });

  it("never repeats dispatch after a lost response, missing run, or ambiguous discovery", async () => {
    const dispatch = vi.fn().mockRejectedValue(new Error("connection reset after request"));
    const discover = vi.fn().mockResolvedValue({ id: 42 });
    await expect(dispatchOnceAndRecover({ dispatch, discover })).resolves.toEqual({ id: 42 });
    expect(dispatch).toHaveBeenCalledOnce();
    for (const message of ["no matching run", "multiple matching runs"]) {
      dispatch.mockClear();
      discover.mockRejectedValue(new Error(message));
      await expect(dispatchOnceAndRecover({ dispatch, discover })).rejects.toThrow(message);
      expect(dispatch).toHaveBeenCalledOnce();
    }
  });

  it("selects only the newly dispatched run for the published source SHA", () => {
    const runs = [
      { databaseId: 3, event: "workflow_dispatch", headSha: "source", createdAt: "2026-09-06T10:01:00Z" },
      { databaseId: 2, event: "workflow_dispatch", headSha: "other", createdAt: "2026-09-06T10:02:00Z" },
      { databaseId: 1, event: "workflow_dispatch", headSha: "source", createdAt: "2026-09-06T10:00:00Z" },
    ];

    expect(selectNewWorkflowRun(runs, new Set(["1"]), "source")?.databaseId).toBe(3);
  });

  it("requires every public updater asset", () => {
    expect(missingReleaseAssets(assets)).toEqual([]);
    expect(missingReleaseAssets(assets.filter((name) => !name.endsWith(".dmg")))).toEqual(["macOS Universal DMG"]);
  });

  it("verifies the guarded jobs and exact Defender scan", () => {
    const run = {
      status: "completed",
      conclusion: "success",
      jobs: [
        { name: "verify", conclusion: "success" },
        { name: "create-release-ref", conclusion: "success" },
        {
          name: 'publish-draft (windows-latest, "--bundles nsis")',
          conclusion: "success",
          steps: [{ name: "Scan the exact Windows release artifacts with Microsoft Defender", conclusion: "success" }],
        },
        { name: 'publish-draft (macos-latest, "--target universal")', conclusion: "success", steps: [] },
        { name: "finalize", conclusion: "success" },
        { name: "upgrade-smoke", conclusion: "success" },
        { name: "create-draft", conclusion: "success" },
      ],
    };

    expect(workflowVerificationErrors(run, { stable: true })).toEqual([]);
    expect(workflowVerificationErrors({ ...run, jobs: run.jobs.filter((job) => job.name !== "create-draft") }, { stable: true }))
      .toContain("create-draft did not succeed");
    run.jobs[2].steps[0].conclusion = "failure";
    expect(workflowVerificationErrors(run, { stable: true })).toContain("Microsoft Defender release scan did not succeed");
  });

  it("checks public release state, prerelease state, and assets", () => {
    expect(
      releaseVerificationErrors(
        { tagName: "v0.3.9", isDraft: false, isPrerelease: false, assets: assets.map((name) => ({ name })) },
        "v0.3.9",
      ),
    ).toEqual([]);
    expect(
      releaseVerificationErrors(
        { tagName: "v0.4.0-beta.1", isDraft: false, isPrerelease: false, assets: assets.map((name) => ({ name })) },
        "v0.4.0-beta.1",
      ),
    ).toContain("release prerelease state does not match the tag");
  });

  it("requires both parallel publication jobs, updater assembly, Defender and stable smoke", () => {
    const jobs = ["verify", "create-release-ref", "create-draft", "publish-windows", "publish-macos", "assemble-updater", "finalize", "upgrade-smoke"].map((name) => ({ name, conclusion: "success", steps: name === "publish-windows" ? [{ name: "Scan the exact Windows release artifacts with Microsoft Defender", conclusion: "success" }] : [] }));
    const run = { status: "completed", conclusion: "success", jobs };
    expect(workflowVerificationErrors(run, { stable: true })).toEqual([]);
    expect(workflowVerificationErrors({ ...run, jobs: jobs.filter((job) => job.name !== "assemble-updater") }, { stable: true })).toContain("assemble-updater did not succeed");
    expect(workflowVerificationErrors({ ...run, jobs: jobs.filter((job) => job.name !== "upgrade-smoke") }, { stable: true })).toContain("stable upgrade smoke did not succeed");
    expect(workflowVerificationErrors({ ...run, jobs: jobs.filter((job) => job.name !== "upgrade-smoke") }, { stable: false })).toEqual([]);
  });
});

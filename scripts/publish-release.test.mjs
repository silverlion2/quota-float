import { describe, expect, it } from "vitest";
import {
  missingReleaseAssets,
  releaseVerificationErrors,
  selectNewWorkflowRun,
  workflowVerificationErrors,
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
      ],
    };

    expect(workflowVerificationErrors(run, { stable: true })).toEqual([]);
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
});

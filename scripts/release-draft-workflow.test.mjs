import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

const workflow = readFileSync(new URL("../.github/workflows/release.yml", import.meta.url), "utf8");
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const context = { repo: { owner: "owner", repo: "repo" } };

function job(name) {
  return workflow.split(`\n  ${name}:\n`)[1].split(/\n  [a-z][a-z-]+:\n/)[0];
}

function stepScript(jobName, stepName) {
  return job(jobName).split(`      - name: ${stepName}\n`)[1]
    .split("          script: |\n")[1].split("\n      - name:")[0]
    .split("\n").map((line) => line.replace(/^            /, "")).join("\n");
}

const prepare = stepScript("create-draft", "Prepare one shared release draft before parallel builds");
const finalize = stepScript("finalize", "Verify the gated artifact set and publish the draft");
const core = () => ({ setFailed: (message) => { throw new Error(message); }, setOutput: vi.fn(), info: vi.fn() });

async function prepareDraft(releases) {
  const createRelease = vi.fn(async (args) => ({ data: { ...args, id: 42 } }));
  const status = core();
  await new AsyncFunction("github", "core", "context", "process", prepare)(
    { paginate: async () => releases, rest: { repos: { listReleases: {}, createRelease } } },
    status, context,
    { env: { RELEASE_TAG: "v0.3.19", RELEASE_SHA: "verified-sha", RELEASE_BODY: "Shared platform notes" } },
  );
  return { createRelease, status };
}

describe("shared release draft workflow", () => {
  it("creates one draft before the matrix and passes its explicit ID and shared notes", () => {
    expect(job("create-draft")).toContain("needs: [verify, create-release-ref]");
    expect(job("create-draft")).toContain("needs.verify.result == 'success'");
    expect(job("create-draft")).toContain("inputs.publish && needs.create-release-ref.result == 'success'");
    expect(job("create-draft")).not.toContain("matrix:");
    expect(job("publish-draft")).toContain("needs: [verify, create-release-ref, create-draft]");
    expect(job("publish-draft")).toContain("needs.create-draft.result == 'success'");
    expect(job("publish-draft")).toContain("max-parallel: 1");
    expect(job("publish-draft")).toContain("releaseId: ${{ needs.create-draft.outputs.release_id }}");
    expect(job("publish-draft")).toContain("releaseBody: ${{ needs.create-draft.outputs.release_body }}");
    expect(job("publish-draft")).not.toContain("generateReleaseNotes");
    expect(workflow.match(/repos\.createRelease\(/g)).toHaveLength(1);
  });

  it("creates the shared draft at the verified SHA with common notes", async () => {
    const { createRelease, status } = await prepareDraft([]);
    expect(createRelease).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      tag_name: "v0.3.19", target_commitish: "verified-sha", draft: true,
      prerelease: false, body: "Shared platform notes",
    }));
    expect(status.setOutput).toHaveBeenCalledWith("release_id", "42");
  });

  it("reuses only the single draft for the same verified SHA on reruns", async () => {
    const { createRelease, status } = await prepareDraft([
      { id: 42, tag_name: "v0.3.19", target_commitish: "verified-sha", draft: true },
    ]);
    expect(createRelease).not.toHaveBeenCalled();
    expect(status.setOutput).toHaveBeenCalledWith("release_id", "42");
  });

  it("rejects duplicate drafts, published versions, and drafts from another commit", async () => {
    const draft = { id: 42, tag_name: "v0.3.19", target_commitish: "verified-sha", draft: true };
    await expect(prepareDraft([draft, { ...draft, id: 43 }])).rejects.toThrow(/multiple releases/);
    await expect(prepareDraft([{ ...draft, draft: false }])).rejects.toThrow(/exact verified commit/);
    await expect(prepareDraft([{ ...draft, target_commitish: "different-sha" }])).rejects.toThrow(/exact verified commit/);
  });

  it("retains the exact installer upgrade gate while binding finalize to the prepared draft", async () => {
    const bytes = Buffer.from("upgrade-tested-installer");
    const digest = createHash("sha256").update(bytes).digest("hex");
    const assets = ["latest.json", "Quota.Float_x64-setup.exe", "Quota.Float_x64-setup.exe.sig",
      "Quota.Float_universal.dmg", "Quota.Float_universal.app.tar.gz", "Quota.Float_universal.app.tar.gz.sig"]
      .map((name, index) => ({ name, id: index + 1 }));
    const release = { id: 42, tag_name: "v0.3.19", draft: true, assets };
    const manifest = { version: "0.3.19", platforms: Object.fromEntries(
      ["windows-x86_64", "windows-x86_64-nsis", "darwin-aarch64", "darwin-x86_64", "darwin-aarch64-app"].map((platform) => [platform, {
        url: `https://github.com/owner/repo/releases/download/v0.3.19/${assets[platform.startsWith("windows") ? 1 : 4].name}`,
        signature: "signature",
      }]),
    ) };
    const env = { RELEASE_TAG: "v0.3.19", RELEASE_SHA: "verified-sha", PREPARED_RELEASE_ID: "42",
      CANDIDATE_RELEASE_ID: "42", CANDIDATE_ASSET_ID: "2", CANDIDATE_ASSET_NAME: assets[1].name,
      CANDIDATE_SHA256: digest };
    const updateRelease = vi.fn(async (args) => ({ data: { ...args, id: 42, html_url: "release" } }));
    async function run(releases = [release], overrides = {}, updater = manifest) {
      return new AsyncFunction("github", "core", "context", "process", "require", finalize)(
        { paginate: async () => releases, request: async (_route, args) => ({
          data: args.asset_id === 1 ? Buffer.from(JSON.stringify(updater))
            : args.asset_id === 3 || args.asset_id === 6 ? Buffer.from("signature") : bytes,
        }), rest: { repos: {
          listReleases: {}, getRelease: async () => ({ data: release }), updateRelease,
        } } }, core(), context, { env: { ...env, ...overrides } }, () => ({ createHash }),
      );
    }
    await expect(run([release, { ...release, id: 43 }])).rejects.toThrow(/pre-created release draft/);
    await expect(run([release], { PREPARED_RELEASE_ID: "43" })).rejects.toThrow(/pre-created release draft/);
    await expect(run([release], { CANDIDATE_ASSET_ID: "999" })).rejects.toThrow(/installer changed/);
    await expect(run([release], { CANDIDATE_SHA256: "0".repeat(64) })).rejects.toThrow(/digest changed/);
    await expect(run([release], {}, { ...manifest, version: "0.3.18" })).rejects.toThrow(/required platform entries/);
    await expect(run([release], {}, { ...manifest, platforms: { "windows-x86_64": manifest.platforms["windows-x86_64"] } })).rejects.toThrow(/required platform entries/);
    for (const invalidEntry of [{ ...manifest.platforms["darwin-aarch64-app"], url: "https://example.com/wrong" },
      { ...manifest.platforms["darwin-aarch64-app"], signature: "different" }]) {
      await expect(run([release], {}, { ...manifest, platforms: { ...manifest.platforms, "darwin-aarch64-app": invalidEntry } }))
        .rejects.toThrow(/exact draft artifact|signature does not match/);
    }
    expect(updateRelease).not.toHaveBeenCalled();
    await run();
    expect(updateRelease).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ release_id: 42, draft: false }));
  });
});

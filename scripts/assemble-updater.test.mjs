import { describe, expect, it, vi } from "vitest";
import { assembleUpdater } from "./assemble-updater.mjs";

const releaseSha = "a".repeat(40);
const names = ["Quota.Float_0.3.20_x64-setup.exe", "Quota.Float_0.3.20_x64-setup.exe.sig",
  "Quota.Float_universal.app.tar.gz", "Quota.Float_universal.app.tar.gz.sig", "Quota.Float_0.3.20_universal.dmg"];
const assets = names.map((name, index) => ({ id: index + 1, name }));
const draft = { id: 42, tag_name: "v0.3.20", target_commitish: releaseSha, draft: true,
  body: "Shared release notes", created_at: "2026-09-19T12:00:00Z", assets };

function fixture(release = draft, current = release, signature = "signature") {
  const repos = {
    getRelease: vi.fn().mockResolvedValueOnce({ data: release }).mockResolvedValue({ data: current }),
    deleteReleaseAsset: vi.fn().mockResolvedValue({}),
    uploadReleaseAsset: vi.fn().mockResolvedValue({ data: { id: 99 } }),
  };
  const github = { rest: { repos }, request: vi.fn().mockResolvedValue({ data: Buffer.from(signature) }) };
  return { repos, github, run: () => assembleUpdater({ github, owner: "owner", repo: "repo", releaseId: 42,
    tag: "v0.3.20", releaseSha }) };
}

describe("single-writer updater assembly", () => {
  it("builds the complete manifest directly from one verified draft and uploads it once", async () => {
    const { run, repos, github } = fixture();
    const { manifest, assetId } = await run();
    expect(assetId).toBe(99);
    expect(manifest).toMatchObject({ version: "0.3.20", notes: draft.body, pub_date: draft.created_at });
    expect(Object.keys(manifest.platforms)).toEqual([
      "windows-x86_64", "windows-x86_64-nsis", "darwin-aarch64", "darwin-x86_64", "darwin-aarch64-app", "darwin-x86_64-app",
    ]);
    expect(manifest.platforms["windows-x86_64"]).toEqual({ signature: "signature",
      url: "https://github.com/owner/repo/releases/download/v0.3.20/Quota.Float_0.3.20_x64-setup.exe" });
    expect(manifest.platforms["darwin-aarch64"].url).toContain("/v0.3.20/Quota.Float_universal.app.tar.gz");
    expect(github.request).toHaveBeenCalledTimes(2);
    expect(repos.deleteReleaseAsset).not.toHaveBeenCalled();
    expect(repos.uploadReleaseAsset).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ release_id: 42, name: "latest.json" }));
    expect(JSON.parse(repos.uploadReleaseAsset.mock.calls[0][0].data.toString())).toEqual(manifest);
  });

  it("on retry replaces only latest.json while retaining installer, archive, and signatures", async () => {
    const { run, repos } = fixture({ ...draft, assets: [...assets, { id: 88, name: "latest.json" }] });
    await run();
    expect(repos.deleteReleaseAsset).toHaveBeenCalledExactlyOnceWith({ owner: "owner", repo: "repo", asset_id: 88 });
    expect(repos.uploadReleaseAsset).toHaveBeenCalledTimes(1);
  });

  it.each([
    { ...draft, draft: false }, { ...draft, id: 43 }, { ...draft, tag_name: "v0.3.19" },
    { ...draft, target_commitish: "b".repeat(40) },
  ])("rejects a different or already published draft before mutation", async (release) => {
    const { run, repos } = fixture(release);
    await expect(run()).rejects.toThrow(/exact prepared draft/);
    expect(repos.deleteReleaseAsset).not.toHaveBeenCalled();
    expect(repos.uploadReleaseAsset).not.toHaveBeenCalled();
  });

  it.each([
    assets.filter((asset) => asset.id !== 2), assets.filter((asset) => asset.id !== 5),
    [...assets, { ...assets[0], id: 77 }], [...assets, { ...assets[3], id: 78 }],
  ].map((candidateAssets) => [candidateAssets]))("rejects incomplete and ambiguous platform assets", async (candidateAssets) => {
    const { run, repos } = fixture({ ...draft, assets: candidateAssets });
    await expect(run()).rejects.toThrow(/Expected exactly one/);
    expect(repos.uploadReleaseAsset).not.toHaveBeenCalled();
  });

  it("refuses asset replacement or publication during assembly", async () => {
    for (const current of [{ ...draft, draft: false },
      { ...draft, assets: assets.map((asset) => asset.id === 1 ? { ...asset, id: 77 } : asset) }]) {
      const { run, repos } = fixture(draft, current);
      await expect(run()).rejects.toThrow(/exact prepared draft|assets changed/);
      expect(repos.deleteReleaseAsset).not.toHaveBeenCalled();
      expect(repos.uploadReleaseAsset).not.toHaveBeenCalled();
    }
  });

  it.each([
    assets.map((asset) => asset.id <= 2 ? { ...asset, name: asset.name.replace("0.3.20", "0.3.19") } : asset),
    assets.map((asset) => asset.id === 5 ? { ...asset, name: asset.name.replace("0.3.20", "0.3.19") } : asset),
    assets.map((asset) => asset.id === 3 || asset.id === 4 ? { ...asset, name: asset.name.replace("Quota.Float", "Other.App") } : asset),
  ].map((candidateAssets) => [candidateAssets]))("rejects an older installer or DMG and another application's archive", async (candidateAssets) => {
    const { run, repos, github } = fixture({ ...draft, assets: candidateAssets });
    await expect(run()).rejects.toThrow(/release version and application/);
    expect(github.request).not.toHaveBeenCalled();
    expect(repos.deleteReleaseAsset).not.toHaveBeenCalled();
    expect(repos.uploadReleaseAsset).not.toHaveBeenCalled();
  });

  it("fails closed on empty signatures without touching the existing manifest", async () => {
    const { run, repos } = fixture({ ...draft, assets: [...assets, { id: 88, name: "latest.json" }] }, undefined, " \n");
    await expect(run()).rejects.toThrow(/signature/);
    expect(repos.deleteReleaseAsset).not.toHaveBeenCalled();
    expect(repos.uploadReleaseAsset).not.toHaveBeenCalled();
  });
});

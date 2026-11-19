import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { finalizePlatformRelease, platformAssetNames, previousWindows, promoteAllPlatforms, publishPlatformFeed,
  publishPlatformFeeds, verifyPlatformRelease, verifyPublicFeed } from "./platform-release.mjs";

const sha = (n) => n.toString(16).padStart(40, "0");
const digest = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const clone = (value) => structuredClone(value);
const missing = () => Object.assign(new Error("missing"), { status: 404 });
const directories = [];
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }); });

function fixture() {
  const repository = "owner/repo", base = `repos/${repository}`;
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const keyId = Buffer.from("0102030405060708", "hex");
  const pubkey = Buffer.from(`untrusted comment: fixture\n${Buffer.concat([Buffer.from("Ed"), keyId,
    publicKey.export({ format: "der", type: "spki" }).subarray(-32)]).toString("base64")}\n`).toString("base64");
  function signature(bytes) {
    const detached = sign(null, createHash("blake2b512").update(bytes).digest(), privateKey), comment = "fixture";
    return Buffer.from(`untrusted comment: test\n${Buffer.concat([Buffer.from("ED"), keyId, detached]).toString("base64")}\ntrusted comment: ${comment}\n${sign(null, Buffer.concat([detached, Buffer.from(comment)]), privateKey).toString("base64")}\n`).toString("base64");
  }
  const releases = new Map(), configs = new Map(), downloads = new Map(), tags = new Map();
  function release(version, releaseId, draft = false, tag = `v${version}`) {
    const commit = sha(releaseId), bodies = new Map();
    for (const platform of ["windows", "macos"]) {
      const names = platformAssetNames(version, platform);
      bodies.set(names[0], Buffer.from(`${platform} ${version}`)); bodies.set(names[1], Buffer.from(signature(bodies.get(names[0]))));
      if (names[2]) bodies.set(names[2], Buffer.from(`dmg ${version}`));
    }
    const url = (name) => `https://github.com/${repository}/releases/download/${tag}/${encodeURIComponent(name)}`;
    bodies.set("latest.json", Buffer.from(JSON.stringify({ version, platforms: Object.fromEntries(
      ["windows-x86_64", "darwin-aarch64", "darwin-x86_64"].map((platform) => {
        const name = platform.startsWith("windows") ? platformAssetNames(version, "windows")[0] : platformAssetNames(version, "macos")[0];
        return [platform, { url: url(name), signature: bodies.get(`${name}.sig`).toString() }];
      })) })));
    const value = { id: releaseId, tag_name: tag, target_commitish: commit, draft, prerelease: tag === "windows-v0.3.39", body: "Notes",
      html_url: `https://github.com/${repository}/releases/tag/${tag}`, created_at: "2026-11-20T01:00:00Z", published_at: "2026-11-20T01:00:00Z",
      assets: [...bodies].map(([name, bytes], i) => ({ id: releaseId * 10 + i + 1, name, size: bytes.length, state: "uploaded", digest: digest(bytes), browser_download_url: url(name) })) };
    for (const [name, bytes] of bodies) downloads.set(url(name), bytes);
    releases.set(releaseId, value); tags.set(tag, commit); configs.set(commit, { version, plugins: { updater: { pubkey } } });
    return value;
  }
  const legacy = release("0.3.37", 37), candidate = release("0.3.40", 40, true);
  let latest = legacy, head = null, next = 100, conflict = false;
  const commits = new Map(), trees = new Map();
  const gate = (name) => ({ name, conclusion: "success" });
  const jobs = ["verify", "create-release-ref", "publish-windows", "publish-macos", "upgrade-smoke"].map((name, i) => ({ id: i + 1, name, status: "completed", conclusion: "success", steps: [gate("Scan the exact Windows release artifacts with Microsoft Defender"), gate("Verify both Universal executable architectures")] }));
  const api = vi.fn(async (method, path, body) => {
    if (path === `${base}/releases/latest`) return clone(latest);
    const releaseMatch = path.match(/\/releases\/(\d+)$/);
    if (releaseMatch) {
      const value = releases.get(Number(releaseMatch[1])); if (!value) throw missing();
      if (method === "PATCH") {
        Object.assign(value, body);
        if (body.draft === false) {
          value.html_url = `https://github.com/${repository}/releases/tag/${value.tag_name}`;
          for (const asset of value.assets) {
            const next = `https://github.com/${repository}/releases/download/${value.tag_name}/${encodeURIComponent(asset.name)}`;
            downloads.set(next, downloads.get(asset.browser_download_url)); asset.browser_download_url = next;
          }
        }
      }
      return clone(value);
    }
    if (path.startsWith(`${base}/releases/tags/`)) { const value = [...releases.values()].find((v) => v.tag_name === path.split("/").at(-1)); if (!value) throw missing(); return clone(value); }
    if (path.startsWith(`${base}/git/ref/tags/`)) return { object: { type: "commit", sha: tags.get(decodeURIComponent(path.split("/").at(-1))) } };
    if (path.startsWith(`${base}/contents/src-tauri/tauri.conf.json`)) return { encoding: "base64", content: Buffer.from(JSON.stringify(configs.get(path.split("ref=")[1]))).toString("base64") };
    if (path === `${base}/actions/runs/1`) return { id: 1, path: ".github/workflows/release.yml", event: "workflow_dispatch", head_branch: "main", head_sha: sha(999), run_attempt: 1 };
    if (path.includes("/attempts/1/jobs?")) return { total_count: jobs.length, jobs: clone(jobs) };
    if (path === `${base}/git/ref/heads/update-channels`) { if (!head) throw missing(); return { object: { type: "commit", sha: head } }; }
    if (path.startsWith(`${base}/contents/stable/`)) {
      const [file, ref] = path.slice(`${base}/contents/`.length).split("?ref=");
      const content = trees.get(commits.get(ref)?.tree.sha)?.[file]; if (!content) throw missing();
      return { encoding: "base64", content: Buffer.from(content).toString("base64") };
    }
    if (path.startsWith(`${base}/git/commits/`)) return clone(commits.get(path.split("/").at(-1)) ?? { parents: [{ sha: sha(999) }] });
    if (method === "POST" && path === `${base}/git/trees`) {
      const tree = sha(next++), value = { ...trees.get(body.base_tree) };
      for (const entry of body.tree) value[entry.path] = entry.content;
      trees.set(tree, value); return { sha: tree };
    }
    if (method === "POST" && path === `${base}/git/commits`) {
      const commit = sha(next++); commits.set(commit, { tree: { sha: body.tree }, parents: body.parents }); return { sha: commit };
    }
    if (path === `${base}/git/refs` || path === `${base}/git/refs/heads/update-channels`) {
      if (conflict) { conflict = false; throw Object.assign(new Error("race"), { status: 422 }); }
      if (head && !commits.get(body.sha).parents.includes(head)) throw Object.assign(new Error("not fast forward"), { status: 422 });
      head = body.sha; return { object: { sha: head } };
    }
    throw new Error(`Unexpected ${method} ${path}`);
  });
  const download = vi.fn(async (url) => {
    if (url.startsWith("https://raw.githubusercontent.com/")) {
      const file = url.slice(url.indexOf("/stable/") + 1), content = trees.get(commits.get(head)?.tree.sha)?.[file];
      if (!content) throw missing(); return Buffer.from(content);
    }
    const value = downloads.get(url); if (!value) throw missing(); return value;
  });
  const log = vi.fn(async (jobId) => jobId === 2 ? `Pushed v${configs.get(candidate.target_commitish).version} at ${candidate.target_commitish}.\n`
    : `Install, launch, upgrade, rollback, reinstall, and uninstall smoke passed on draft asset ${candidate.assets[0].id}: v0.3.37 -> v${configs.get(candidate.target_commitish).version} (${configs.get(candidate.target_commitish).version}, sha256:${candidate.assets[0].digest.slice(7)}).\n`);
  const deps = { repository, api, download, log, pause: vi.fn(async () => {}), downloadPrivate: vi.fn(async (assetId) => {
    const asset = [...releases.values()].flatMap((r) => r.assets).find((a) => a.id === assetId); return downloads.get(asset.browser_download_url);
  }) };
  const options = { repository, platform: "windows", tag: candidate.tag_name, releaseId: candidate.id, releaseCommit: candidate.target_commitish, runId: 1,
    expectedAssetId: candidate.assets[0].id, expectedSha256: candidate.assets[0].digest.slice(7) };
  return { deps, options, candidate, legacy, jobs, downloads, configs, tags, release, releases,
    setLatest: (value) => { latest = value; }, conflict: () => { conflict = true; }, files: () => trees.get(commits.get(head)?.tree.sha) ?? {}, head: () => head };
}

it("publishes only verified Windows assets, preserves global Latest and promotes the anonymously readable Windows feed", async () => {
  const f = fixture();
  const { report } = await finalizePlatformRelease(f.options, f.deps);
  expect(report).toMatchObject({ version: "0.3.40", publicReleaseVerified: true, publicFeedVerified: true });
  expect(Object.keys(f.files())).toEqual(["stable/windows.json"]);
  expect(f.deps.api).toHaveBeenCalledWith("PATCH", "repos/owner/repo/releases/40", { draft: false, make_latest: "false" });
  expect(f.deps.api.mock.calls.filter(([method, path]) => method === "PATCH" && path.includes("/git/refs"))).toEqual([]);
  expect(f.deps.download.mock.calls.some(([url]) => url.startsWith("https://raw.githubusercontent.com/"))).toBe(true);
  const verification = await verifyPlatformRelease(f.options, f.deps);
  expect(verification.report.channel.publicFeedVerified).toBe(true);
});

it("Mac failure does not prevent Windows publication and leaves any Mac feed byte-identical", async () => {
  const f = fixture(); f.jobs.find((j) => j.name === "publish-macos").conclusion = "failure";
  const mac = { version: "0.3.37", _quotaFloat: { repository: f.options.repository, platform: "darwin" } };
  await publishPlatformFeed({ repository: f.options.repository, platform: "macos", manifest: mac }, f.deps);
  const before = f.files()["stable/darwin.json"];
  await finalizePlatformRelease(f.options, f.deps);
  expect(f.files()["stable/darwin.json"]).toBe(before);
  await expect(finalizePlatformRelease({ ...f.options, platform: "macos" }, f.deps)).rejects.toThrow(/publish-macos/);
  expect(f.files()["stable/darwin.json"]).toBe(before);
});

it.each(["hash", "signature", "missing", "tag", "source", "upgrade", "defender", "anonymous"])("fails closed before feed publication on %s", async (failure) => {
  const f = fixture();
  if (failure === "hash") f.downloads.set(f.candidate.assets[0].browser_download_url, Buffer.from("bad"));
  if (failure === "signature") { const asset = f.candidate.assets[1], bytes = Buffer.from("invalid"); f.downloads.set(asset.browser_download_url, bytes); asset.size = bytes.length; asset.digest = digest(bytes); }
  if (failure === "missing") f.candidate.assets.pop(); // Missing global manifest does not matter to Windows, so remove its signature instead.
  if (failure === "missing") f.candidate.assets.splice(1, 1);
  if (failure === "tag") f.tags.set(f.options.tag, sha(999));
  if (failure === "source") f.configs.get(f.options.releaseCommit).version = "0.3.41";
  if (failure === "upgrade") f.options.expectedAssetId++;
  if (failure === "defender") f.jobs.find((j) => j.name === "publish-windows").steps = [];
  if (failure === "anonymous") { const original = f.deps.download; f.deps.download = async (url, size) => { if (url.includes("/v0.3.40/")) throw Error("anonymous 404"); return original(url, size); }; }
  await expect(finalizePlatformRelease(f.options, f.deps)).rejects.toThrow();
  expect(f.head()).toBe(null);
});

it("refuses a changed legacy global release before publication", async () => {
  const f = fixture(), original = f.deps.api;
  let reads = 0;
  f.deps.api = async (...args) => { if (args[1].endsWith("/releases/latest") && ++reads === 2) f.legacy.assets.find((a) => a.name === "latest.json").id++; return original(...args); };
  await expect(finalizePlatformRelease(f.options, f.deps)).rejects.toThrow(/Legacy global/);
  expect(f.candidate.draft).toBe(true);
  expect(f.head()).toBe(null);
});

it("retries a CAS race without force, preserves other files and refuses rollback or same-version replacement", async () => {
  const f = fixture(), repository = f.options.repository;
  const manifest = { version: "0.3.40", _quotaFloat: { repository, platform: "windows" } };
  f.conflict();
  await publishPlatformFeed({ repository, platform: "windows", manifest }, f.deps);
  const before = f.head();
  expect((await publishPlatformFeed({ repository, platform: "windows", manifest }, f.deps)).unchanged).toBe(true);
  expect(f.head()).toBe(before);
  await expect(publishPlatformFeed({ repository, platform: "windows", manifest: { ...manifest, version: "0.3.39" } }, f.deps)).rejects.toThrow(/rollback/);
  await expect(publishPlatformFeed({ repository, platform: "windows", manifest: { ...manifest, release_url: "changed" } }, f.deps)).rejects.toThrow(/different/);
  await publishPlatformFeed({ repository, platform: "macos", manifest: { version: "0.3.37", _quotaFloat: { repository, platform: "darwin" } } }, f.deps);
  expect(JSON.parse(f.files()["stable/windows.json"])).toEqual(manifest);
  expect(f.deps.api.mock.calls.filter(([method]) => method === "PATCH").every(([, , body]) => body.force === false)).toBe(true);
});

it("publishes both platform feeds in one CAS commit and refuses partial rollback", async () => {
  const f = fixture(), repository = f.options.repository;
  const entries = ["windows", "macos"].map((platform) => ({ platform, manifest: { version: "0.3.40", _quotaFloat: { repository, platform: platform === "windows" ? "windows" : "darwin" } } }));
  await publishPlatformFeeds({ repository, entries }, f.deps);
  expect(Object.keys(f.files()).sort()).toEqual(["stable/darwin.json", "stable/windows.json"]);
  expect(f.deps.api.mock.calls.filter(([method, path]) => method === "POST" && path.endsWith("/git/commits"))).toHaveLength(1);
  const before = f.head();
  await expect(publishPlatformFeeds({ repository, entries: [{ ...entries[0], manifest: { ...entries[0].manifest, version: "0.3.41" } }, { ...entries[1], manifest: { ...entries[1].manifest, version: "0.3.39" } }] }, f.deps)).rejects.toThrow(/rollback/);
  expect(f.head()).toBe(before);
});

it("requires actual anonymous feed visibility and retries bounded CDN propagation", async () => {
  const f = fixture(), expected = { version: "0.3.40" };
  f.deps.download = vi.fn().mockResolvedValueOnce(Buffer.from('{"version":"0.3.39"}')).mockResolvedValue(Buffer.from(JSON.stringify(expected)));
  expect((await verifyPublicFeed(f.options, expected, f.deps)).publicFeedVerified).toBe(true);
  expect(f.deps.pause).toHaveBeenCalledOnce();
  f.deps.download = vi.fn(async () => { throw Error("404"); });
  await expect(verifyPublicFeed(f.options, expected, f.deps)).rejects.toThrow(/Public platform feed/);
  expect(f.deps.download).toHaveBeenCalledTimes(5);
});

it("resolves the verified previous Windows channel and explicit legacy migration baseline", async () => {
  const f = fixture();
  const baseline = await previousWindows({ repository: f.options.repository, platform: "windows" }, f.deps);
  expect(baseline).toMatchObject({ tag: "v0.3.37", version: "0.3.37", signatureVerified: true, bootstrap: true });
  await finalizePlatformRelease(f.options, f.deps);
  const previous = await previousWindows({ repository: f.options.repository, platform: "windows" }, f.deps);
  expect(previous).toMatchObject({ tag: "v0.3.40", assetId: f.candidate.assets[0].id, bootstrap: false });
  expect((await previousWindows({ repository: f.options.repository, platform: "windows", tag: "v0.3.37" }, f.deps)).tag).toBe("v0.3.37");
});

it("promotes all mode only after the original six-asset validation and keeps it atomic", async () => {
  const f = fixture(); f.candidate.draft = false; f.setLatest(f.candidate);
  const directory = await mkdtemp(join(tmpdir(), "quota-platform-")); directories.push(directory);
  const { report } = await promoteAllPlatforms({ ...f.options, outputDirectory: directory }, f.deps);
  expect(report).toMatchObject({ fullArtifactSetVerified: true, publicFeedVerified: true, platform: "all" });
  expect(Object.keys(f.files())).toHaveLength(2);
  expect(f.deps.api.mock.calls.filter(([method, path]) => method === "POST" && path.endsWith("/git/commits"))).toHaveLength(1);
});

it("accepts realistic untagged draft URLs but requires canonical public URLs after publication", async () => {
  const f = fixture();
  f.candidate.html_url = "https://github.com/owner/repo/releases/tag/untagged-abcd1234";
  for (const asset of f.candidate.assets) {
    const next = asset.browser_download_url.replace("/v0.3.40/", "/untagged-abcd1234/");
    f.downloads.set(next, f.downloads.get(asset.browser_download_url)); asset.browser_download_url = next;
  }
  const { report } = await finalizePlatformRelease(f.options, f.deps);
  expect(report.assets.every((asset) => asset.url.includes("/v0.3.40/"))).toBe(true);
  f.candidate.html_url = "https://github.com/owner/repo/releases/tag/untagged-abcd1234";
  await expect(verifyPlatformRelease(f.options, f.deps)).rejects.toThrow(/identity/);
});

it("retains original feed notes when public notes change, while rejecting version, URL and signature changes", async () => {
  const f = fixture(); await finalizePlatformRelease(f.options, f.deps);
  const original = f.files()["stable/windows.json"], manifest = JSON.parse(original);
  f.candidate.body = "Edited release notes";
  expect((await previousWindows({ repository: f.options.repository, platform: "windows" }, f.deps)).signatureVerified).toBe(true);
  expect((await verifyPlatformRelease(f.options, f.deps)).report.publicFeedVerified).toBe(true);
  expect((await finalizePlatformRelease(f.options, f.deps)).report.channel.unchanged).toBe(true);
  expect(f.files()["stable/windows.json"]).toBe(original);
  for (const change of [
    { ...manifest, version: "0.3.41" },
    { ...manifest, release_url: "https://evil.invalid/" },
    { ...manifest, platforms: { ...manifest.platforms, "windows-x86_64": { ...manifest.platforms["windows-x86_64"], signature: "changed" } } },
  ]) {
    f.files()["stable/windows.json"] = JSON.stringify(change);
    await expect(previousWindows({ repository: f.options.repository, platform: "windows" }, f.deps)).rejects.toThrow(/differs/);
  }
});

it("seeds only the explicit manual Windows bootstrap with matching original upgrade-tested bytes", async () => {
  const f = fixture(), original = f.release("0.3.39", 39, true), manual = f.release("0.3.39", 139, false, "windows-v0.3.39");
  manual.target_commitish = original.target_commitish; f.tags.set(manual.tag_name, original.target_commitish);
  f.deps.log = async (jobId) => jobId === 2 ? `Pushed v0.3.39 at ${original.target_commitish}.`
    : `smoke passed on draft asset ${original.assets[0].id}: v0.3.37 -> v0.3.39 (0.3.39, sha256:${original.assets[0].digest.slice(7)}).`;
  const options = { ...f.options, tag: manual.tag_name, releaseId: manual.id, releaseCommit: manual.target_commitish,
    expectedAssetId: manual.assets[0].id, expectedSha256: manual.assets[0].digest.slice(7), upgradeAssetId: original.assets[0].id, upgradeReleaseId: original.id };
  await expect(finalizePlatformRelease({ ...options, upgradeAssetId: undefined }, f.deps)).rejects.toThrow(/Bootstrap requires/);
  const { report } = await finalizePlatformRelease(options, f.deps);
  expect(report.manifest.release_url).toBe("https://github.com/owner/repo/releases/tag/windows-v0.3.39");
  const previous = await previousWindows({ repository: f.options.repository, platform: "windows" }, f.deps);
  expect(previous).toMatchObject({ tag: "windows-v0.3.39", version: "0.3.39", assetId: manual.assets[0].id, signatureVerified: true });
  manual.prerelease = false;
  await expect(verifyPlatformRelease(options, f.deps)).rejects.toThrow(/identity/);
});

it("rejects a workflow whose verified source is not the release commit's direct parent", async () => {
  const f = fixture(), original = f.deps.api;
  f.deps.api = async (...args) => args[1] === `repos/owner/repo/git/commits/${f.options.releaseCommit}`
    ? { parents: [{ sha: sha(998) }] } : original(...args);
  await expect(finalizePlatformRelease(f.options, f.deps)).rejects.toThrow(/direct child/);
  expect(f.candidate.draft).toBe(true);
  expect(f.head()).toBe(null);
});

it("accepts a newer anonymous feed only when its immutable identity and public signatures verify", async () => {
  const f = fixture(); await finalizePlatformRelease(f.options, f.deps);
  const baselineOptions = { ...f.options, tag: "v0.3.37", releaseId: 37, releaseCommit: f.legacy.target_commitish, runId: null, skipChannel: true };
  const baseline = await verifyPlatformRelease(baselineOptions, f.deps);
  expect((await verifyPublicFeed(baselineOptions, baseline.report.manifest, f.deps)).newer).toBe(true);
  const changed = JSON.parse(f.files()["stable/windows.json"]);
  changed.platforms["windows-x86_64"].url = "https://evil.invalid/file.exe";
  f.files()["stable/windows.json"] = JSON.stringify(changed);
  await expect(verifyPublicFeed(baselineOptions, baseline.report.manifest, f.deps)).rejects.toThrow(/does not match verified/);
});

it("all-mode promotion rejects a target that is not global Latest without changing feeds", async () => {
  const f = fixture(); f.candidate.draft = false;
  await expect(promoteAllPlatforms(f.options, f.deps)).rejects.toThrow(/exact fully published global Latest/);
  expect(f.head()).toBe(null);
});

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { stripVTControlCharacters } from "node:util";
import { verifyPublicArtifacts, verifyUpdaterSignature } from "./verify-public-artifacts.mjs";

const BRANCH = "update-channels";
const SHA = /^[a-f0-9]{40}$/;
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// Release notes may be edited after publication; the channel retains its original notes.
const sameManifest = (a, b) => { const { notes: _a, ...left } = a; const { notes: _b, ...right } = b; return equal(left, right); };
const target = (platform) => platform === "windows" ? "windows" : platform === "macos" ? "darwin" : (() => { throw new Error("Unsupported platform"); })();
const id = (value) => Number.isSafeInteger(Number(value)) && Number(value) > 0;
function versionOf(tag, platform) {
  const version = tag?.startsWith("v") ? tag.slice(1) : platform === "windows" && tag === "windows-v0.3.39" ? "0.3.39" : "";
  if (!VERSION.test(version)) throw new Error("Expected a canonical stable version tag or the explicit Windows 0.3.39 bootstrap");
  return version;
}
function compare(a, b) {
  if (!VERSION.test(a) || !VERSION.test(b)) throw new Error("Invalid channel version");
  const av = a.split(".").map(BigInt), bv = b.split(".").map(BigInt);
  for (let i = 0; i < 3; i++) if (av[i] !== bv[i]) return av[i] > bv[i] ? 1 : -1;
  return 0;
}
function coordinates(options) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(options.repository ?? "") ||
      !id(options.releaseId) || !SHA.test(options.releaseCommit ?? "")) throw new Error("Invalid exact release identity");
  return { version: versionOf(options.tag, options.platform), base: `repos/${options.repository}`, platformTarget: target(options.platform) };
}
export function platformAssetNames(version, platform) {
  if (!VERSION.test(version)) throw new Error("Invalid artifact version");
  target(platform);
  return platform === "windows" ? [`Quota.Float_${version}_x64-setup.exe`, `Quota.Float_${version}_x64-setup.exe.sig`]
    : ["Quota.Float_universal.app.tar.gz", "Quota.Float_universal.app.tar.gz.sig", `Quota.Float_${version}_universal.dmg`];
}
function oneAsset(release, name, repository) {
  const assets = release.assets.filter((a) => a.name === name);
  if (assets.length !== 1) throw new Error(`Missing or duplicate asset: ${name}`);
  const asset = assets[0];
  const releaseBase = `https://github.com/${repository}/releases/tag/`;
  const slug = release.html_url?.startsWith(releaseBase) ? release.html_url.slice(releaseBase.length) : "";
  if (slug !== release.tag_name && !(release.draft === true && /^untagged-[A-Za-z0-9_-]+$/.test(slug))) throw new Error("Invalid release URL");
  const url = `https://github.com/${repository}/releases/download/${encodeURIComponent(slug)}/${encodeURIComponent(name)}`;
  if (!id(asset.id) || asset.state !== "uploaded" || !/^sha256:[a-f0-9]{64}$/.test(asset.digest ?? "") ||
      !Number.isSafeInteger(asset.size) || asset.size < 1 || asset.size > 256 * 1024 * 1024 || asset.browser_download_url !== url) {
    throw new Error(`Invalid asset identity, size, or URL: ${name}`);
  }
  return asset;
}
async function tagCommit(api, base, tag) {
  let object = (await api("GET", `${base}/git/ref/tags/${encodeURIComponent(tag)}`)).object;
  const seen = new Set();
  for (let i = 0; i < 8; i++) {
    if (!object || !SHA.test(object.sha ?? "") || seen.has(object.sha)) throw new Error("Invalid or cyclic tag");
    seen.add(object.sha);
    if (object.type === "commit") return object.sha;
    if (object.type !== "tag") break;
    object = (await api("GET", `${base}/git/tags/${object.sha}`)).object;
  }
  throw new Error("Tag does not resolve to a commit");
}
function assertRelease(release, options, publicOnly) {
  const bootstrap = options.platform === "windows" && options.tag === "windows-v0.3.39";
  const canonical = `https://github.com/${options.repository}/releases/tag/${options.tag}`;
  const draftBase = `https://github.com/${options.repository}/releases/tag/`;
  const draftSlug = release.html_url?.startsWith(draftBase) ? release.html_url.slice(draftBase.length) : "";
  const validUrl = release.html_url === canonical || (release.draft === true && /^untagged-[A-Za-z0-9_-]+$/.test(draftSlug));
  if (String(release.id) !== String(options.releaseId) || release.tag_name !== options.tag ||
      release.target_commitish !== options.releaseCommit || (publicOnly && release.draft !== false) ||
      release.prerelease !== bootstrap || !validUrl) {
    throw new Error("Release identity, state, or source commit does not match");
  }
}
async function legacySnapshot({ api, download, repository }) {
  const release = await api("GET", `repos/${repository}/releases/latest`);
  const version = versionOf(release.tag_name, "macos");
  if (release.draft || release.prerelease || !SHA.test(release.target_commitish ?? "")) throw new Error("Legacy global Latest must remain a complete public release");
  const asset = oneAsset(release, "latest.json", repository);
  const bytes = await download(asset.browser_download_url, asset.size);
  if (bytes.length !== asset.size || `sha256:${hash(bytes)}` !== asset.digest) throw new Error("Legacy updater manifest digest mismatch");
  const manifest = JSON.parse(bytes.toString("utf8"));
  if (manifest.version !== version || !manifest.platforms?.["windows-x86_64"] || !manifest.platforms?.["darwin-aarch64"] || !manifest.platforms?.["darwin-x86_64"]) throw new Error("Legacy updater is incomplete");
  for (const platform of ["windows", "macos"]) {
    for (const name of platformAssetNames(version, platform)) oneAsset(release, name, repository);
  }
  return { releaseId: release.id, tag: release.tag_name, commit: release.target_commitish, assetId: asset.id, digest: asset.digest };
}
async function unchangedLegacy(deps, expected) {
  if (!equal(await legacySnapshot(deps), expected)) throw new Error("Legacy global Latest or latest.json changed");
}
async function inspectPlatform(options, deps, publicOnly = true) {
  const { version, base } = coordinates(options);
  const { api, download, downloadPrivate } = deps;
  const release = await api("GET", `${base}/releases/${options.releaseId}`);
  assertRelease(release, options, publicOnly);
  if (await tagCommit(api, base, options.tag) !== options.releaseCommit) throw new Error("Release tag points to another commit");
  const configFile = await api("GET", `${base}/contents/src-tauri/tauri.conf.json?ref=${options.releaseCommit}`);
  if (configFile.encoding !== "base64" || typeof configFile.content !== "string" || configFile.content.length > 128 * 1024) throw new Error("Invalid source config");
  const config = JSON.parse(Buffer.from(configFile.content, "base64").toString("utf8"));
  if (config.version !== version || typeof config.plugins?.updater?.pubkey !== "string") throw new Error("Source version or updater key mismatch");
  const selected = platformAssetNames(version, options.platform).map((name) => oneAsset(release, name, options.repository));
  const bytes = await Promise.all(selected.map(async (asset) => {
    const value = release.draft ? await downloadPrivate(asset.id, asset.size) : await download(asset.browser_download_url, asset.size);
    if (value.length !== asset.size || `sha256:${hash(value)}` !== asset.digest) throw new Error(`Artifact digest/size mismatch: ${asset.name}`);
    return value;
  }));
  verifyUpdaterSignature(bytes[0], bytes[1].toString("utf8"), config.plugins.updater.pubkey);
  const current = await api("GET", `${base}/releases/${options.releaseId}`);
  assertRelease(current, options, publicOnly);
  if (current.draft !== release.draft || selected.some((asset) => !current.assets.some((a) =>
    a.id === asset.id && a.name === asset.name && a.digest === asset.digest && a.size === asset.size && a.state === "uploaded")) ||
      await tagCommit(api, base, options.tag) !== options.releaseCommit) throw new Error("Release artifacts or tag changed during verification");
  return { release, version, assets: selected.map(({ id, name, size, digest }) => ({ id, name, size, digest,
    url: `https://github.com/${options.repository}/releases/download/${encodeURIComponent(options.tag)}/${encodeURIComponent(name)}` })), signature: bytes[1].toString("utf8").trim() };
}
function manifestFor(verified, options) {
  const entry = { signature: verified.signature, url: verified.assets[0].url };
  const keys = options.platform === "windows" ? ["windows-x86_64", "windows-x86_64-nsis"] : ["darwin-aarch64", "darwin-x86_64", "darwin-aarch64-app", "darwin-x86_64-app"];
  const pubDate = verified.release.published_at || verified.release.created_at;
  if (!Number.isFinite(Date.parse(pubDate))) throw new Error("Invalid release publication date");
  return { version: verified.version, notes: verified.release.body || "", pub_date: pubDate,
    release_url: verified.release.html_url, platforms: Object.fromEntries(keys.map((key) => [key, entry])),
    _quotaFloat: { repository: options.repository, platform: target(options.platform), releaseId: Number(options.releaseId),
      releaseCommit: options.releaseCommit, tag: options.tag, runId: options.runId ? Number(options.runId) : null, assets: verified.assets } };
}
async function saveReport(report, outputDirectory) {
  if (!outputDirectory) return { report, reportPath: null };
  await mkdir(outputDirectory, { recursive: true });
  const reportPath = resolve(outputDirectory, "verification.json");
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return { report, reportPath };
}
export async function verifyPlatformRelease(options, deps = createDependencies(options.repository)) {
  const legacy = await legacySnapshot(deps);
  const verified = await inspectPlatform(options, deps);
  const manifest = manifestFor(verified, options);
  const channel = options.skipChannel ? null : await verifyPublicFeed(options, manifest, deps);
  await unchangedLegacy(deps, legacy);
  return saveReport({ verifiedAt: new Date().toISOString(), repository: options.repository, platform: options.platform,
    tag: options.tag, version: verified.version, releaseId: Number(options.releaseId), releaseCommit: options.releaseCommit,
    publicReleaseVerified: true, updaterSignaturesVerified: true, assets: verified.assets, legacy,
    manifest, channel, publicFeedVerified: !options.skipChannel }, options.outputDirectory);
}
export async function verifyPublicFeed(options, expected, deps) {
  const url = `https://raw.githubusercontent.com/${options.repository}/${BRANCH}/stable/${target(options.platform)}.json`;
  let failure;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const bytes = await deps.download(url, 1024 * 1024);
      const observed = JSON.parse(bytes.toString("utf8"));
      if (sameManifest(observed, expected)) return { url, version: observed.version, publicFeedVerified: true, newer: false };
      if (compare(observed.version, expected.version) > 0) {
        const meta = observed._quotaFloat;
        if (meta?.repository !== options.repository || meta.platform !== target(options.platform)) throw new Error("Wrong public feed identity");
        const newerOptions = { ...options, tag: meta.tag, releaseId: meta.releaseId, releaseCommit: meta.releaseCommit, runId: meta.runId };
        const newer = await inspectPlatform(newerOptions, deps);
        if (!sameManifest(observed, manifestFor(newer, newerOptions))) throw new Error("Newer public feed does not match verified artifacts");
        return { url, version: observed.version, publicFeedVerified: true, newer: true };
      }
      throw new Error("Public feed has not propagated the verified version");
    } catch (error) {
      failure = error;
      if (attempt < 4) await (deps.pause ?? ((ms) => new Promise((done) => setTimeout(done, ms))))(500 * 2 ** attempt);
    }
  }
  throw new Error(`Public platform feed verification failed: ${failure.message}`);
}
async function workflowProof(options, deps, verified) {
  if (!id(options.runId)) throw new Error("Exact release run required");
  const base = `repos/${options.repository}`;
  const run = await deps.api("GET", `${base}/actions/runs/${options.runId}`);
  if (String(run.id) !== String(options.runId) || run.path !== ".github/workflows/release.yml") throw new Error("Wrong release workflow run");
  const jobs = await deps.api("GET", `${base}/actions/runs/${options.runId}/attempts/${run.run_attempt}/jobs?per_page=100`);
  if (jobs.total_count !== jobs.jobs.length) throw new Error("Incomplete workflow job listing");
  const job = (name) => {
    const values = jobs.jobs.filter((j) => j.name === name);
    if (values.length !== 1 || values[0].status !== "completed" || values[0].conclusion !== "success") throw new Error(`Required job failed: ${name}`);
    return values[0];
  };
  job("verify");
  if (run.event === "workflow_dispatch" && run.head_branch === "main") {
    const sourceCommit = await deps.api("GET", `${base}/git/commits/${options.releaseCommit}`);
    if (!SHA.test(run.head_sha ?? "") || sourceCommit.parents?.length !== 1 || sourceCommit.parents[0].sha !== run.head_sha) throw new Error("Release commit is not the direct child of the verified workflow source");
    const ref = job("create-release-ref");
    const log = await deps.log(ref.id);
    if (log.split(/\r?\n/).filter((line) => line.trimEnd().endsWith(`Pushed v${verified.version} at ${options.releaseCommit}.`)).length !== 1) throw new Error("Release run source/tag proof missing");
  } else if (run.event !== "push" || run.head_sha !== options.releaseCommit) throw new Error("Run is not bound to the release commit");
  const platform = job(options.platform === "windows" ? "publish-windows" : "publish-macos");
  const gate = options.platform === "windows" ? "Scan the exact Windows release artifacts with Microsoft Defender" : "Verify both Universal executable architectures";
  if (platform.steps?.filter((step) => step.name === gate && step.conclusion === "success").length !== 1) throw new Error(`Missing platform gate: ${gate}`);
  let upgradeProof = null;
  if (options.platform === "windows") {
    const installer = verified.assets[0];
    if (String(installer.id) !== String(options.expectedAssetId) || installer.digest !== `sha256:${options.expectedSha256}`) throw new Error("Windows exact upgrade-tested asset required");
    let testedAssetId = installer.id;
    if (options.tag === "windows-v0.3.39") {
      if (!id(options.upgradeAssetId) || !id(options.upgradeReleaseId)) throw new Error("Bootstrap requires original tested draft asset and release IDs");
      const original = await deps.api("GET", `${base}/releases/${options.upgradeReleaseId}`);
      if (original.tag_name !== "v0.3.39" || original.target_commitish !== options.releaseCommit || String(original.id) !== String(options.upgradeReleaseId)) throw new Error("Bootstrap original release identity mismatch");
      const originalAsset = oneAsset(original, installer.name, options.repository);
      if (String(originalAsset.id) !== String(options.upgradeAssetId) || originalAsset.digest !== installer.digest || originalAsset.size !== installer.size) throw new Error("Bootstrap copy differs from upgrade-tested asset");
      testedAssetId = originalAsset.id;
    } else if (options.upgradeAssetId || options.upgradeReleaseId) throw new Error("Alternate upgrade provenance is only allowed for the explicit Windows bootstrap");
    const upgrade = job("upgrade-smoke");
    const log = await deps.log(upgrade.id);
    upgradeProof = log.split(/\r?\n/).filter((line) => line.includes(`smoke passed on draft asset ${testedAssetId}:`) &&
      line.includes(` -> v${verified.version} (${verified.version}, sha256:${options.expectedSha256}).`));
    if (!upgradeProof.length) throw new Error("Upgrade smoke did not prove the exact Windows asset");
  }
  return { runId: Number(options.runId), runAttempt: run.run_attempt, platformJobId: platform.id, upgradeProof };
}
async function optional(api, path) {
  try { return await api("GET", path); } catch (error) { if (error.status === 404) return null; throw error; }
}
async function readFeed(api, base, ref, platformTarget) {
  const file = await optional(api, `${base}/contents/stable/${platformTarget}.json?ref=${ref}`);
  if (!file) return null;
  if (file.encoding !== "base64" || typeof file.content !== "string" || file.content.length > 1024 * 1024) throw new Error("Invalid existing channel data");
  return JSON.parse(Buffer.from(file.content, "base64").toString("utf8"));
}
export async function publishPlatformFeed({ repository, platform, manifest }, deps = createDependencies(repository)) {
  return publishPlatformFeeds({ repository, entries: [{ platform, manifest }] }, deps);
}
export async function publishPlatformFeeds({ repository, entries }, deps = createDependencies(repository)) {
  const base = `repos/${repository}`;
  if (!entries.length || entries.length > 2 || new Set(entries.map((entry) => target(entry.platform))).size !== entries.length) throw new Error("Invalid channel selection");
  for (const { platform, manifest } of entries) if (manifest._quotaFloat?.repository !== repository || manifest._quotaFloat?.platform !== target(platform) || !VERSION.test(manifest.version)) throw new Error("Manifest identity does not match channel");
  for (let attempt = 0; attempt < 4; attempt++) {
    const ref = await optional(deps.api, `${base}/git/ref/heads/${BRANCH}`);
    const parent = ref?.object?.sha;
    if (ref && (!SHA.test(parent ?? "") || ref.object.type !== "commit")) throw new Error("Invalid channel branch head");
    const changed = [];
    for (const entry of entries) {
      const { platform, manifest } = entry;
      const existing = parent ? await readFeed(deps.api, base, parent, target(platform)) : null;
      if (existing) {
      const order = compare(manifest.version, existing.version);
      if (order < 0) throw new Error("Refusing channel rollback");
      if (order === 0) {
        if (!sameManifest(existing, manifest)) throw new Error("Refusing to replace a published version with different metadata or assets");
        continue;
      }
      }
      changed.push(entry);
    }
    const paths = entries.map(({ platform }) => `stable/${target(platform)}.json`);
    if (!changed.length) return { branch: BRANCH, paths, commit: parent, unchanged: true };
    const previous = parent ? await deps.api("GET", `${base}/git/commits/${parent}`) : null;
    const tree = await deps.api("POST", `${base}/git/trees`, { ...(previous ? { base_tree: previous.tree.sha } : {}),
      tree: changed.map(({ platform, manifest }) => ({ path: `stable/${target(platform)}.json`, mode: "100644", type: "blob", content: `${JSON.stringify(manifest, null, 2)}\n` })) });
    const commit = await deps.api("POST", `${base}/git/commits`, { message: `Update stable channels: ${changed.map(({ platform, manifest }) => `${platform} ${manifest.version}`).join(", ")}`, tree: tree.sha, parents: parent ? [parent] : [] });
    try {
      if (parent) await deps.api("PATCH", `${base}/git/refs/heads/${BRANCH}`, { sha: commit.sha, force: false });
      else await deps.api("POST", `${base}/git/refs`, { ref: `refs/heads/${BRANCH}`, sha: commit.sha });
      for (const { platform, manifest } of entries) {
        const observed = await readFeed(deps.api, base, commit.sha, target(platform));
        if (!sameManifest(observed, manifest)) throw new Error("Published channel commit content mismatch");
      }
      return { branch: BRANCH, paths, commit: commit.sha, unchanged: false };
    } catch (error) {
      if (![409, 422].includes(error.status) || attempt === 3) throw error;
      // Another platform may have advanced the branch: re-read its tree, never force.
    }
  }
  throw new Error("Channel changed too frequently");
}
async function preparePlatformRelease(options, deps) {
  const legacy = await legacySnapshot(deps);
  const prepared = await inspectPlatform(options, deps, false);
  const proof = await workflowProof(options, deps, prepared);
  await unchangedLegacy(deps, legacy);
  return { legacy, prepared, proof };
}
export async function preflightPlatformRelease(options, deps = createDependencies(options.repository)) {
  const { legacy, prepared, proof } = await preparePlatformRelease(options, deps);
  return saveReport({ verifiedAt: new Date().toISOString(), prepublishGatesPassed: true, readOnly: true,
    publicReleaseVerified: !prepared.release.draft, publicationPerformed: false, channelUpdated: false,
    repository: options.repository, platform: options.platform, tag: options.tag, version: prepared.version,
    releaseId: Number(options.releaseId), releaseCommit: options.releaseCommit,
    updaterSignaturesVerified: true, assets: prepared.assets, legacy, ...proof }, options.outputDirectory);
}
export async function finalizePlatformRelease(options, deps = createDependencies(options.repository)) {
  const { legacy, prepared, proof } = await preparePlatformRelease(options, deps);
  if (prepared.release.draft) await deps.api("PATCH", `repos/${options.repository}/releases/${options.releaseId}`, { draft: false, make_latest: "false" });
  const verified = await inspectPlatform(options, deps, true); // Anonymous GETs after publication, before feed changes.
  if (!equal(prepared.assets, verified.assets)) throw new Error("Assets changed between draft verification and publication");
  await unchangedLegacy(deps, legacy);
  const manifest = manifestFor(verified, options);
  const channel = await publishPlatformFeed({ repository: options.repository, platform: options.platform, manifest }, deps);
  const publicFeed = await verifyPublicFeed(options, manifest, deps);
  await unchangedLegacy(deps, legacy);
  return saveReport({ verifiedAt: new Date().toISOString(), repository: options.repository, platform: options.platform,
    tag: options.tag, version: verified.version, releaseId: Number(options.releaseId), releaseCommit: options.releaseCommit,
    publicReleaseVerified: true, updaterSignaturesVerified: true, assets: verified.assets, manifest, channel, publicFeed,
    publicFeedVerified: true, legacy, ...proof }, options.outputDirectory);
}
export async function previousWindows(options, deps = createDependencies(options.repository)) {
  if (options.platform !== "windows" || (options.tag && options.tag !== "v0.3.37")) throw new Error("Only Windows channel or explicit v0.3.37 baseline is supported");
  const base = `repos/${options.repository}`;
  const ref = options.tag ? null : await optional(deps.api, `${base}/git/ref/heads/${BRANCH}`);
  const feed = ref ? await readFeed(deps.api, base, ref.object.sha, "windows") : null;
  let release;
  if (feed) {
    if (feed._quotaFloat?.platform !== "windows" || feed._quotaFloat.repository !== options.repository) throw new Error("Wrong previous Windows channel identity");
    release = await deps.api("GET", `${base}/releases/${feed._quotaFloat.releaseId}`);
  } else release = await deps.api("GET", `${base}/releases/tags/v0.3.37`);
  const identity = { ...options, tag: release.tag_name, releaseId: release.id, releaseCommit: release.target_commitish, runId: feed?._quotaFloat?.runId, outputDirectory: null, skipChannel: true };
  const result = await verifyPlatformRelease(identity, deps);
  if (feed && !sameManifest(feed, result.report.manifest)) throw new Error("Previous Windows feed differs from verified public assets");
  const asset = result.report.assets[0];
  return { releaseId: release.id, tag: release.tag_name, releaseCommit: release.target_commitish, assetId: asset.id,
    assetName: asset.name, sha256: asset.digest.slice(7), signatureVerified: true, bootstrap: !feed, version: result.report.version };
}

export async function promoteAllPlatforms(options, deps = createDependencies(options.repository)) {
  const windowsOptions = { ...options, platform: "windows" }, macOptions = { ...options, platform: "macos" };
  coordinates(windowsOptions);
  const legacy = await legacySnapshot(deps);
  if (String(legacy.releaseId) !== String(options.releaseId) || legacy.tag !== options.tag || legacy.commit !== options.releaseCommit) throw new Error("All-platform promotion requires this exact fully published global Latest");
  const windows = await inspectPlatform(windowsOptions, deps), mac = await inspectPlatform(macOptions, deps);
  if ((options.expectedAssetId && String(options.expectedAssetId) !== String(windows.assets[0].id)) ||
      (options.expectedSha256 && options.expectedSha256 !== windows.assets[0].digest.slice(7))) throw new Error("All-platform Windows upgrade receipt differs from the public asset");
  const config = await deps.api("GET", `repos/${options.repository}/contents/src-tauri/tauri.conf.json?ref=${options.releaseCommit}`);
  const publicKey = JSON.parse(Buffer.from(config.content, "base64").toString("utf8")).plugins.updater.pubkey;
  // Preserve the original six-asset verifier, including every global manifest entry.
  await verifyPublicArtifacts({ release: windows.release, publicKey, outputDirectory: resolve(options.outputDirectory, "full-platform-artifacts"),
    fetchImpl: async (url) => { const asset = windows.release.assets.find((entry) => entry.browser_download_url === url); if (!asset) throw new Error("Unexpected artifact URL"); return { ok: true, arrayBuffer: async () => deps.download(url, asset.size) }; } });
  const proof = await workflowProof({ ...windowsOptions, expectedAssetId: windows.assets[0].id, expectedSha256: windows.assets[0].digest.slice(7) }, deps, windows);
  await workflowProof(macOptions, deps, mac);
  await unchangedLegacy(deps, legacy);
  const manifests = { windows: manifestFor(windows, windowsOptions), darwin: manifestFor(mac, macOptions) };
  const channel = await publishPlatformFeeds({ repository: options.repository, entries: [
    { platform: "windows", manifest: manifests.windows }, { platform: "macos", manifest: manifests.darwin } ] }, deps);
  const publicFeeds = await Promise.all([verifyPublicFeed(windowsOptions, manifests.windows, deps), verifyPublicFeed(macOptions, manifests.darwin, deps)]);
  await unchangedLegacy(deps, legacy);
  return saveReport({ verifiedAt: new Date().toISOString(), repository: options.repository, platform: "all", tag: options.tag,
    version: windows.version, releaseId: Number(options.releaseId), releaseCommit: options.releaseCommit, publicReleaseVerified: true,
    updaterSignaturesVerified: true, fullArtifactSetVerified: true, manifests, channel, publicFeeds, publicFeedVerified: true, legacy, ...proof }, options.outputDirectory);
}

export function createDependencies(repository, { execFile = execFileSync } = {}) {
  const captured = (args, input) => execFile("gh", args, { input, maxBuffer: 270 * 1024 * 1024, timeout: 180_000, stdio: ["pipe", "pipe", "pipe"] });
  const gh = (args, input, raw = false) => {
    try {
      try { return captured(args, input); }
      catch (error) {
        const stderr = error.stderr?.toString() ?? "";
        // Raw responses can require explicit escape handling in newer gh.
        // Older releases need no flag. Never relax JSON API reads.
        if (!raw || !/response contains terminal escape sequences\b/i.test(stderr) || !stderr.includes("--allow-escape-sequences")) throw error;
        return captured([...args, "--allow-escape-sequences"], input);
      }
    } catch (error) {
      const stderr = stripVTControlCharacters(error.stderr?.toString() ?? "");
      const failure = new Error(`GitHub request failed: ${stderr.replace(/https?:\/\/\S+/g, "[URL]").slice(0, 400) || "transport failure"}`);
      failure.status = Number(stderr.match(/HTTP (\d{3})/)?.[1]); throw failure;
    }
  };
  const api = async (method, path, body) => JSON.parse(gh(["api", path, "--method", method, ...(body ? ["--input", "-"] : [])], body ? JSON.stringify(body) : undefined).toString("utf8"));
  const download = async (url, expectedSize) => {
    const response = await fetch(url, { signal: AbortSignal.timeout(120_000), headers: { Accept: "application/octet-stream" } });
    if (!response.ok || !response.body) throw new Error(`Anonymous download failed: HTTP ${response.status}`);
    const chunks = []; let size = 0;
    for await (const chunk of response.body) { size += chunk.length; if (size > expectedSize) throw new Error("Download exceeds expected asset size"); chunks.push(chunk); }
    return Buffer.concat(chunks);
  };
  return { repository, api, download,
    downloadPrivate: async (assetId) => gh(["api", `repos/${repository}/releases/assets/${assetId}`, "-H", "Accept: application/octet-stream"], undefined, true),
    log: async (jobId) => stripVTControlCharacters(gh(["api", `repos/${repository}/actions/jobs/${jobId}/logs`], undefined, true).toString("utf8")) };
}
async function cli() {
  const [command, ...args] = process.argv.slice(2), flags = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!args[i]?.startsWith("--") || !args[i + 1] || args[i + 1].startsWith("--") || flags[args[i].slice(2)] !== undefined) throw new Error("Expected unique --name value arguments");
    flags[args[i].slice(2)] = args[i + 1];
  }
  const known = ["repository", "tag", "release-id", "release-commit", "platform", "run-id", "output", "expected-asset-id", "expected-sha256", "upgrade-asset-id", "upgrade-release-id"];
  if (Object.keys(flags).some((key) => !known.includes(key)) || !flags.output) throw new Error("Unknown argument or missing --output");
  const options = { repository: flags.repository, tag: flags.tag, releaseId: flags["release-id"], releaseCommit: flags["release-commit"],
    platform: flags.platform, runId: flags["run-id"], outputDirectory: flags.output, expectedAssetId: flags["expected-asset-id"], expectedSha256: flags["expected-sha256"], upgradeAssetId: flags["upgrade-asset-id"], upgradeReleaseId: flags["upgrade-release-id"] };
  let result;
  if (command === "verify") result = await verifyPlatformRelease(options);
  else if (command === "preflight") result = await preflightPlatformRelease(options);
  else if (command === "finalize" || command === "seed") result = await finalizePlatformRelease(options);
  else if (command === "promote-all") result = await promoteAllPlatforms(options);
  else if (command === "previous") {
    result = await previousWindows(options);
    await mkdir(dirname(resolve(flags.output)), { recursive: true });
    await writeFile(flags.output, `${JSON.stringify(result, null, 2)}\n`);
  } else throw new Error("Expected verify, preflight, finalize, seed, promote-all, or previous");
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) cli().catch((error) => { console.error(error.message); process.exitCode = 1; });

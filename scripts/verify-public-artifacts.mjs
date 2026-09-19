import { createHash, createPublicKey, verify } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export function verifyUpdaterSignature(data, encodedSignature, encodedPublicKey) {
  const publicLines = Buffer.from(encodedPublicKey, "base64").toString("utf8").trim().split(/\r?\n/);
  const key = Buffer.from(publicLines[1] ?? "", "base64");
  const lines = Buffer.from(encodedSignature.trim(), "base64").toString("utf8").trim().split(/\r?\n/);
  const signature = Buffer.from(lines[1] ?? "", "base64");
  if (key.length !== 42 || !["Ed", "ED"].includes(key.subarray(0, 2).toString()) ||
      signature.length !== 74 || signature.subarray(0, 2).toString() !== "ED" ||
      !signature.subarray(2, 10).equals(key.subarray(2, 10)) ||
      !lines[2]?.startsWith("trusted comment: ")) {
    throw new Error("Invalid updater signature format or key identity");
  }
  const publicKey = createPublicKey({
    key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), key.subarray(10)]),
    format: "der", type: "spki",
  });
  const detached = signature.subarray(10);
  if (!verify(null, createHash("blake2b512").update(data).digest(), publicKey, detached)) {
    throw new Error("Updater package signature does not verify");
  }
  const trusted = Buffer.concat([detached, Buffer.from(lines[2].slice("trusted comment: ".length))]);
  if (!verify(null, trusted, publicKey, Buffer.from(lines[3] ?? "", "base64"))) {
    throw new Error("Updater trusted-comment signature does not verify");
  }
}

export function artifactNames(version) {
  if (!/^\d+\.\d+\.\d+(?:-beta\.\d+)?$/.test(version)) throw new Error("Invalid release version");
  return ["latest.json", `Quota.Float_${version}_x64-setup.exe`, `Quota.Float_${version}_x64-setup.exe.sig`,
    `Quota.Float_${version}_universal.dmg`, "Quota.Float_universal.app.tar.gz", "Quota.Float_universal.app.tar.gz.sig"];
}

async function download(asset, fetchImpl, pause) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetchImpl(asset.browser_download_url, { signal: AbortSignal.timeout(60_000) });
      if (!response.ok) {
        const error = new Error(`Public artifact download returned HTTP ${response.status}`);
        error.permanent = ![408, 429].includes(response.status) && response.status < 500;
        throw error;
      }
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      if (error.permanent) throw error;
      lastError = error;
      if (attempt < 2) await pause(1000 * 2 ** attempt);
    }
  }
  throw lastError;
}

export async function verifyPublicArtifacts({ release, publicKey, outputDirectory, fetchImpl = fetch,
  pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)) }) {
  const version = release.tag_name?.slice(1);
  const names = artifactNames(version);
  if (release.draft !== false || release.tag_name !== `v${version}` || !/^[a-f0-9]{40}$/i.test(release.target_commitish ?? "")) {
    throw new Error("Expected a public release targeting an exact commit");
  }
  const releaseUrl = new URL(release.html_url);
  if (releaseUrl.protocol !== "https:" || !releaseUrl.pathname.endsWith(`/releases/tag/${release.tag_name}`)) {
    throw new Error("Unexpected public release URL");
  }
  const downloadBase = `${releaseUrl.origin}${releaseUrl.pathname.slice(0, -(`/tag/${release.tag_name}`).length)}/download/${encodeURIComponent(release.tag_name)}/`;
  const selected = names.map((name) => {
    const matches = (release.assets ?? []).filter((asset) => asset.name === name);
    if (matches.length !== 1) throw new Error(`Expected exactly one public asset: ${name}`);
    const asset = matches[0];
    if (asset.browser_download_url !== downloadBase + encodeURIComponent(name) ||
        !/^sha256:[a-f0-9]{64}$/.test(asset.digest ?? "") ||
        !Number.isSafeInteger(asset.size) || asset.size < 1 || asset.size > 256 * 1024 * 1024) {
      throw new Error(`Invalid asset URL, digest or size: ${name}`);
    }
    return asset;
  });
  const buffers = new Map();
  // Independent public GETs; no signing private key or GitHub credential is used.
  await Promise.all(selected.map(async (asset) => {
    const bytes = await download(asset, fetchImpl, pause);
    const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
    if (bytes.length !== asset.size || digest !== asset.digest) throw new Error(`Public artifact digest/size mismatch: ${asset.name}`);
    buffers.set(asset.name, bytes);
  }));
  const manifest = JSON.parse(buffers.get("latest.json").toString("utf8"));
  const requiredPlatforms = ["windows-x86_64", "darwin-aarch64", "darwin-x86_64"];
  if (manifest.version !== version || !manifest.platforms || !requiredPlatforms.every((key) => manifest.platforms[key])) {
    throw new Error("Public updater manifest version or platforms are incomplete");
  }
  for (const [platform, entry] of Object.entries(manifest.platforms)) {
    const name = platform.startsWith("windows-") ? names[1] : platform.startsWith("darwin-") ? names[4] : null;
    if (!name || entry?.url !== downloadBase + encodeURIComponent(name) ||
        typeof entry.signature !== "string" || entry.signature.trim() !== buffers.get(`${name}.sig`).toString("utf8").trim()) {
      throw new Error(`Public updater manifest does not match its package: ${platform}`);
    }
  }
  for (const name of [names[1], names[4]]) {
    verifyUpdaterSignature(buffers.get(name), buffers.get(`${name}.sig`).toString("utf8"), publicKey);
  }
  const report = {
    verifiedAt: new Date().toISOString(), tag: release.tag_name, releaseId: release.id,
    releaseCommit: release.target_commitish, manifestVerified: true, updaterSignaturesVerified: true,
    assets: selected.map(({ id, name, size, digest }) => ({ id, name, size, digest })),
  };
  await mkdir(outputDirectory, { recursive: true });
  for (const [name, bytes] of buffers) await writeFile(join(outputDirectory, name), bytes);
  const reportPath = join(outputDirectory, "verification.json");
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return { report, reportPath };
}

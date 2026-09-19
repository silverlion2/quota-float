function exactlyOne(assets, predicate, label) {
  const matches = assets.filter(predicate);
  if (matches.length !== 1) throw new Error(`Expected exactly one ${label}; found ${matches.length}.`);
  return matches[0];
}

function assertDraft(release, releaseId, tag, releaseSha) {
  if (release.id !== releaseId || release.tag_name !== tag || !release.draft || release.target_commitish !== releaseSha) {
    throw new Error("Updater assembly requires the exact prepared draft, tag, and release SHA.");
  }
}

export async function assembleUpdater({ github, owner, repo, releaseId, tag, releaseSha, serverUrl = "https://github.com" }) {
  if (!Number.isSafeInteger(releaseId) || releaseId <= 0 || !/^v\d+\.\d+\.\d+(?:-beta\.\d+)?$/.test(tag) || !/^[0-9a-f]{40}$/.test(releaseSha)) {
    throw new Error("Invalid prepared release identity.");
  }
  const coordinates = { owner, repo, release_id: releaseId };
  const { data: release } = await github.rest.repos.getRelease(coordinates);
  assertDraft(release, releaseId, tag, releaseSha);
  const installer = exactlyOne(release.assets, (asset) => /_x64-setup\.exe$/.test(asset.name), "Windows installer");
  const archive = exactlyOne(release.assets, (asset) => /_universal\.app\.tar\.gz$/.test(asset.name), "macOS updater archive");
  const dmg = exactlyOne(release.assets, (asset) => /_universal\.dmg$/.test(asset.name), "macOS Universal DMG");
  const version = tag.slice(1);
  if (installer.name !== `Quota.Float_${version}_x64-setup.exe` ||
      dmg.name !== `Quota.Float_${version}_universal.dmg` ||
      archive.name !== "Quota.Float_universal.app.tar.gz") {
    throw new Error("Draft platform asset names do not match this release version and application.");
  }
  const signatures = [installer, archive].map((asset) =>
    exactlyOne(release.assets, (signature) => signature.name === `${asset.name}.sig`, `${asset.name} signature`));
  const manifests = release.assets.filter((asset) => asset.name === "latest.json");
  if (manifests.length > 1) throw new Error("Multiple updater manifests exist in the prepared draft.");
  const readSignature = async (asset) => {
    const { data } = await github.request("GET /repos/{owner}/{repo}/releases/assets/{asset_id}", {
      owner, repo, asset_id: asset.id, headers: { accept: "application/octet-stream" },
    });
    const bytes = Buffer.from(data);
    if (bytes.length > 16_384 || !bytes.toString("utf8").trim()) throw new Error("Missing or oversized updater signature.");
    return bytes.toString("utf8").trim();
  };
  const [windowsSignature, macSignature] = await Promise.all(signatures.map(readSignature));
  const assetUrl = (asset) => `${serverUrl.replace(/\/$/, "")}/${owner}/${repo}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(asset.name)}`;
  const windows = { signature: windowsSignature, url: assetUrl(installer) };
  const mac = { signature: macSignature, url: assetUrl(archive) };
  const manifest = {
    version, notes: release.body || "", pub_date: release.created_at,
    platforms: {
      "windows-x86_64": windows, "windows-x86_64-nsis": windows,
      "darwin-aarch64": mac, "darwin-x86_64": mac,
      "darwin-aarch64-app": mac, "darwin-x86_64-app": mac,
    },
  };
  if (!Number.isFinite(Date.parse(manifest.pub_date))) throw new Error("Prepared draft has no valid creation timestamp.");
  // Recheck before the only mutation: a retry may replace latest.json, never an installer or signature.
  const { data: current } = await github.rest.repos.getRelease(coordinates);
  assertDraft(current, releaseId, tag, releaseSha);
  const expectedAssets = [installer, archive, dmg, ...signatures, ...manifests];
  if (expectedAssets.some((expected) => !current.assets.some((asset) => asset.id === expected.id && asset.name === expected.name)) ||
      current.assets.length !== release.assets.length) {
    throw new Error("Prepared draft assets changed during updater assembly.");
  }
  if (manifests.length === 1) {
    await github.rest.repos.deleteReleaseAsset({ owner, repo, asset_id: manifests[0].id });
  }
  const content = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  const { data: uploaded } = await github.rest.repos.uploadReleaseAsset({
    ...coordinates, name: "latest.json", data: content,
    headers: { "content-type": "application/json", "content-length": content.length },
  });
  return { assetId: uploaded.id, manifest };
}

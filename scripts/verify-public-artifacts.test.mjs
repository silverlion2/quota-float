import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, readdirSync, rmdirSync, unlinkSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { artifactNames, verifyPublicArtifacts, verifyUpdaterSignature } from "./verify-public-artifacts.mjs";

const directories = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    for (const name of readdirSync(directory)) unlinkSync(join(directory, name));
    rmdirSync(directory);
  }
});

function fixture() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const keyId = Buffer.from("0102030405060708", "hex");
  const rawKey = publicKey.export({ format: "der", type: "spki" }).subarray(-32);
  const encodedPublicKey = Buffer.from(`untrusted comment: test key\n${Buffer.concat([Buffer.from("Ed"), keyId, rawKey]).toString("base64")}\n`).toString("base64");
  function signature(bytes) {
    const detached = sign(null, createHash("blake2b512").update(bytes).digest(), privateKey);
    const comment = "timestamp:1\tfile:fixture";
    const record = Buffer.concat([Buffer.from("ED"), keyId, detached]).toString("base64");
    const global = sign(null, Buffer.concat([detached, Buffer.from(comment)]), privateKey).toString("base64");
    return Buffer.from(`untrusted comment: test\n${record}\ntrusted comment: ${comment}\n${global}\n`).toString("base64");
  }
  const names = artifactNames("0.3.20");
  const base = "https://github.com/owner/repo/releases/download/v0.3.20/";
  const bytes = new Map([[names[1], Buffer.from("Windows executable")], [names[3], Buffer.from("DMG")], [names[4], Buffer.from("macOS updater archive")]]);
  for (const name of [names[1], names[4]]) bytes.set(`${name}.sig`, Buffer.from(signature(bytes.get(name))));
  const manifest = { version: "0.3.20", platforms: Object.fromEntries(
    ["windows-x86_64", "windows-x86_64-nsis", "darwin-aarch64", "darwin-x86_64", "darwin-aarch64-app", "darwin-x86_64-app"].map((platform) => {
      const name = platform.startsWith("windows") ? names[1] : names[4];
      return [platform, { url: base + name, signature: bytes.get(`${name}.sig`).toString() }];
    }),
  ) };
  bytes.set("latest.json", Buffer.from(JSON.stringify(manifest)));
  const release = { id: 42, tag_name: "v0.3.20", target_commitish: "a".repeat(40), draft: false,
    html_url: "https://github.com/owner/repo/releases/tag/v0.3.20", assets: [] };
  const refresh = () => {
    release.assets = names.map((name, id) => ({ name, id, size: bytes.get(name).length,
      digest: `sha256:${createHash("sha256").update(bytes.get(name)).digest("hex")}`, browser_download_url: base + name }));
  };
  refresh();
  const outputDirectory = mkdtempSync(join(tmpdir(), "quota-public-verification-"));
  directories.push(outputDirectory);
  const fetchImpl = vi.fn(async (url) => ({ ok: true, arrayBuffer: async () => bytes.get(url.slice(base.length)) }));
  return { release, publicKey: encodedPublicKey, outputDirectory, fetchImpl, bytes, names, manifest, refresh, pause: async () => {} };
}

describe("public release artifact verification", () => {
  it("verifies six hashes, every manifest entry and both cryptographic updater signatures before reporting success", async () => {
    const input = fixture();
    const { report, reportPath } = await verifyPublicArtifacts(input);
    expect(report.assets).toHaveLength(6);
    expect(report.updaterSignaturesVerified).toBe(true);
    expect(JSON.parse(readFileSync(reportPath, "utf8"))).toEqual(report);
    expect(input.fetchImpl).toHaveBeenCalledTimes(6);
  });

  it("rejects tampered package bytes, signature key IDs and trusted comments", () => {
    const input = fixture();
    const data = input.bytes.get(input.names[1]);
    const encoded = input.bytes.get(`${input.names[1]}.sig`).toString();
    expect(() => verifyUpdaterSignature(Buffer.concat([data, Buffer.from("changed")]), encoded, input.publicKey)).toThrow(/package signature/);
    const lines = Buffer.from(encoded, "base64").toString().split("\n");
    lines[2] += "tampered";
    expect(() => verifyUpdaterSignature(data, Buffer.from(lines.join("\n")).toString("base64"), input.publicKey)).toThrow(/trusted-comment/);
    const otherKey = fixture().publicKey;
    expect(() => verifyUpdaterSignature(data, encoded, otherKey)).toThrow(/signature/);
  });

  it("rejects missing/duplicate assets, untrusted URLs and hash mismatches", async () => {
    const input = fixture();
    input.release.assets.push(input.release.assets[0]);
    await expect(verifyPublicArtifacts(input)).rejects.toThrow(/exactly one/);
    input.refresh();
    input.release.assets[0].browser_download_url = "https://unrelated.invalid/latest.json";
    await expect(verifyPublicArtifacts(input)).rejects.toThrow(/Invalid asset URL/);
    input.refresh();
    input.bytes.set(input.names[1], Buffer.from("corrupt"));
    await expect(verifyPublicArtifacts(input)).rejects.toThrow(/digest\/size mismatch/);
    expect(readdirSync(input.outputDirectory)).toEqual([]);
  });

  it("does not trust matching checksums when updater signature or manifest is invalid", async () => {
    const input = fixture();
    input.bytes.set(input.names[1], Buffer.from("different installer with freshly reported hash"));
    input.refresh();
    await expect(verifyPublicArtifacts(input)).rejects.toThrow(/package signature/);
    input.manifest.platforms["darwin-x86_64-app"].url = "https://github.com/owner/repo/releases/download/v0.3.19/old";
    input.bytes.set("latest.json", Buffer.from(JSON.stringify(input.manifest)));
    input.refresh();
    await expect(verifyPublicArtifacts(input)).rejects.toThrow(/manifest does not match/);
  });

  it("retries transient public GETs and fails immediately on a permanent HTTP response", async () => {
    const input = fixture();
    const normalFetch = input.fetchImpl;
    input.fetchImpl = vi.fn().mockRejectedValueOnce(new Error("network EOF")).mockImplementation(normalFetch);
    await verifyPublicArtifacts(input);
    expect(input.fetchImpl).toHaveBeenCalledTimes(7);
    input.fetchImpl = vi.fn(async () => ({ ok: false, status: 403 }));
    await expect(verifyPublicArtifacts(input)).rejects.toThrow(/HTTP 403/);
    expect(input.fetchImpl).toHaveBeenCalledTimes(6);
  });
});

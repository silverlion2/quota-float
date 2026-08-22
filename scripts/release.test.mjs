import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { assertVersionSync, buildChangelog, nextVersion, updateCargoManifest } from "./release.mjs";

describe("release automation", () => {
  it("bumps stable semantic versions", () => {
    expect(nextVersion("1.2.3", "patch")).toBe("1.2.4");
    expect(nextVersion("1.2.3", "minor")).toBe("1.3.0");
    expect(nextVersion("1.2.3", "major")).toBe("2.0.0");
    expect(nextVersion("1.2.3", "3.4.5")).toBe("3.4.5");
    expect(nextVersion("1.2.3", "beta")).toBe("1.2.4-beta.1");
    expect(nextVersion("1.2.4-beta.1", "beta")).toBe("1.2.4-beta.2");
    expect(nextVersion("1.2.4-beta.2", "stable")).toBe("1.2.4");
    expect(() => nextVersion("1.2.3", "1.2.3")).toThrow(/must be newer/);
    expect(() => nextVersion("1.2.3", "1.1.9")).toThrow(/must be newer/);
  });

  it("updates only the Cargo package version", () => {
    const raw = `[package]\nname = "quota-float"\nversion = "0.1.6"\n\n[dependencies]\nother = "9"\n`;
    expect(updateCargoManifest(raw, "0.2.0")).toContain('version = "0.2.0"');
    expect(updateCargoManifest(raw, "0.2.0")).toContain('other = "9"');
  });

  it("rejects mismatched version sources and tags", () => {
    const synchronized = { packageJson: "0.2.0", cargoToml: "0.2.0", tauriConfig: "0.2.0" };
    expect(assertVersionSync(synchronized, "v0.2.0")).toBe("0.2.0");
    expect(() => assertVersionSync({ ...synchronized, cargoToml: "0.1.9" })).toThrow(/Version mismatch/);
    expect(() => assertVersionSync(synchronized, "v0.1.9")).toThrow(/does not match/);
  });

  it("prepends generated release notes to the changelog", () => {
    const result = buildChangelog("# Changelog\n\n## 0.1.6 - 2026-07-16\n\n- Previous.\n", "0.1.7", ["Fix updater", "Add retry"], "2026-07-18");
    expect(result.indexOf("## 0.1.7")).toBeLessThan(result.indexOf("## 0.1.6"));
    expect(result).toContain("- Fix updater\n- Add retry");
  });

  it("promotes detailed Unreleased notes into the target version", () => {
    const result = buildChangelog(
      "# Changelog\n\n## Unreleased\n\n- Add magnetic Bar.\n- Preserve edge anchors.\n\n## 0.2.19 - 2026-08-12\n\n- Previous.\n",
      "0.2.20",
      ["feat: add magnetic side bar"],
      "2026-08-13",
    );
    expect(result).toContain("## 0.2.20 - 2026-08-13\n\n- Add magnetic Bar.\n- Preserve edge anchors.");
    expect(result).not.toContain("## Unreleased");
    expect(result.indexOf("## 0.2.20")).toBeLessThan(result.indexOf("## 0.2.19"));
  });

  it("publishes a per-user NSIS updater on Windows", () => {
    const workflow = readFileSync(new URL("../.github/workflows/release.yml", import.meta.url), "utf8");
    expect(workflow).toMatch(/platform: windows-latest\s+args: "--bundles nsis --config src-tauri\/tauri\.release\.conf\.json"/);
    expect(workflow).toMatch(/platform: macos-latest\s+args: "--target universal-apple-darwin --bundles app,dmg --config src-tauri\/tauri\.release\.conf\.json"/);
    expect(workflow).toMatch(/prerelease:.*contains\(needs\.verify\.outputs\.tag, '-'/);
    expect(workflow).toContain("verify-windows-upgrade.ps1");
    expect(workflow).toContain("Verify Authenticode when configured");
    expect(workflow).toContain("Verify Developer ID signature and notarization when configured");
    expect(workflow).toContain("-Encoding utf8NoBOM");
  });

  it("supports guarded online release preparation", () => {
    const workflow = readFileSync(new URL("../.github/workflows/release.yml", import.meta.url), "utf8");
    const releaseScript = readFileSync(new URL("./release.mjs", import.meta.url), "utf8");
    const createReleaseRefJob = workflow.match(/\n  create-release-ref:\n[\s\S]*?\n  publish-draft:/)?.[0] ?? "";

    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toMatch(/publish:\s+description: Create the release commit\/tag and publish after verification\s+required: true\s+default: false/);
    expect(workflow).toContain("group: quota-float-release");
    expect(workflow).toContain("name: release");
    expect(workflow).toContain("--dry-run --yes");
    expect(workflow).toContain("--verified-by-ci --no-push --yes");
    expect(workflow).toContain("git push --atomic origin");
    expect(createReleaseRefJob).toContain("Install Linux desktop dependencies");
    expect(createReleaseRefJob).toContain("libwebkit2gtk-4.1-dev");
    expect(createReleaseRefJob).toContain("libappindicator3-dev");
    expect(createReleaseRefJob).toContain("librsvg2-dev");
    expect(releaseScript).toContain('process.env.GITHUB_ACTIONS !== "true"');
  });

  it("blocks public release publishing until Defender accepts the exact Windows artifacts", () => {
    const releaseWorkflow = readFileSync(new URL("../.github/workflows/release.yml", import.meta.url), "utf8");
    const ciWorkflow = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
    const defenderScript = readFileSync(new URL("./verify-windows-defender.ps1", import.meta.url), "utf8");
    const ciConfig = JSON.parse(readFileSync(new URL("../src-tauri/tauri.ci.conf.json", import.meta.url), "utf8"));

    expect(releaseWorkflow).not.toContain("defender-preflight:");
    expect(releaseWorkflow).toContain("publish-draft:");
    expect(releaseWorkflow).toContain("releaseDraft: true");
    expect(releaseWorkflow).toContain("verify-windows-defender.ps1 -EnableRealTimeProtection -Path");
    expect(releaseWorkflow).not.toContain("verify-windows-defender.ps1 -UpdateSignatures");
    expect(releaseWorkflow.indexOf("tauri-apps/tauri-action@v0")).toBeLessThan(releaseWorkflow.indexOf("verify-windows-defender.ps1 -EnableRealTimeProtection"));
    expect(releaseWorkflow).toContain("Verify the artifact set and publish the draft");
    expect(releaseWorkflow).toContain("missing: ${missing.join");
    expect(ciWorkflow).toContain("--config src-tauri/tauri.ci.conf.json");
    expect(ciWorkflow).toContain("verify-windows-defender.ps1 -EnableRealTimeProtection -Path");
    expect(defenderScript).toContain("RealTimeProtectionEnabled");
    expect(defenderScript).toContain("Set-MpPreference -DisableRealtimeMonitoring $false");
    expect(defenderScript).toContain("Get-MpThreatDetection");
    expect(ciConfig.bundle.createUpdaterArtifacts).toBe(false);
  });
});

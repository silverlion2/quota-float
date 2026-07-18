import { describe, expect, it } from "vitest";
import { assertVersionSync, buildChangelog, nextVersion, updateCargoManifest } from "./release.mjs";

describe("release automation", () => {
  it("bumps stable semantic versions", () => {
    expect(nextVersion("1.2.3", "patch")).toBe("1.2.4");
    expect(nextVersion("1.2.3", "minor")).toBe("1.3.0");
    expect(nextVersion("1.2.3", "major")).toBe("2.0.0");
    expect(nextVersion("1.2.3", "3.4.5")).toBe("3.4.5");
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
});

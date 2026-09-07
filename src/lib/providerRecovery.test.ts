import { describe, expect, it } from "vitest";
import { providerRecoveryAction } from "./providerRecovery";

describe("provider recovery guidance", () => {
  it("distinguishes local process and sign-in prerequisites", () => {
    expect(providerRecoveryAction("antigravity", "unavailable", "en")).toContain("keep it running");
    expect(providerRecoveryAction("volcengine", "signed_out", "en")).toContain("Sign in through Ark CLI");
    expect(providerRecoveryAction("claude", "signed_out", "zh-CN")).toContain("Claude Code");
  });
  it("does not recommend signing in again for a platform that is unsupported", () => {
    expect(providerRecoveryAction("qoder", "unavailable", "en", "macos")).toContain("Windows only");
    expect(providerRecoveryAction("trae", "unavailable", "en", "macos")).toContain("Windows only");
    expect(providerRecoveryAction("workbuddy", "signed_out", "en", "macos")).toContain("Windows only");
    expect(providerRecoveryAction("qoder", "unavailable", "en", "windows")).toContain("installed and signed in");
  });
  it("prioritizes pause and loading and keeps healthy cards quiet", () => {
    expect(providerRecoveryAction("qoder", "paused", "en", "macos")).toContain("Resume monitoring");
    expect(providerRecoveryAction("codex", "loading", "zh-CN")).toContain("无需重复点击");
    expect(providerRecoveryAction("codex", "ok", "en")).toBeNull();
    expect(providerRecoveryAction("codex", "stale", "en")).toContain("retained quota may have changed");
  });
});

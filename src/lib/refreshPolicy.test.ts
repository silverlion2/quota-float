import { describe, expect, it } from "vitest";
import type { ProviderSnapshot } from "../types";
import {
  BALANCED_ATTENTION_REFRESH_MS,
  BALANCED_REFRESH_MS,
  FOCUS_ATTENTION_REFRESH_MS,
  FOCUS_REFRESH_MS,
  monitoredProviderIds,
  nextProviderRefreshDelay,
  providerRefreshInterval,
  providersDueForRefresh,
} from "./refreshPolicy";

function snapshot(provider: ProviderSnapshot["provider"], status: ProviderSnapshot["status"] = "ok"): ProviderSnapshot {
  return {
    provider,
    displayName: provider.toUpperCase(),
    plan: null,
    shortWindow: null,
    weeklyWindow: { remainingPercent: 70, resetsAt: "2026-09-01T00:00:00Z", windowSeconds: 604_800 },
    resetCredits: null,
    updatedAt: "2026-08-23T00:00:00Z",
    status,
    message: null,
  };
}

describe("provider refresh policy", () => {
  it("isolates healthy and unavailable provider clocks", () => {
    const now = 10_000_000;
    const snapshots = [snapshot("codex"), snapshot("antigravity", "unavailable")];
    const attempts = { codex: now - BALANCED_REFRESH_MS, antigravity: now - BALANCED_REFRESH_MS };

    expect(providersDueForRefresh(snapshots, ["codex", "antigravity"], attempts, "balanced", now)).toEqual(["codex"]);
    expect(providerRefreshInterval(snapshots[1], "balanced")).toBe(BALANCED_ATTENTION_REFRESH_MS);
    expect(nextProviderRefreshDelay(snapshots, ["codex", "antigravity"], attempts, "balanced", now)).toBe(0);
  });

  it("extends normal and attention refreshes in project focus mode", () => {
    expect(providerRefreshInterval(snapshot("codex"), "focus")).toBe(FOCUS_REFRESH_MS);
    expect(providerRefreshInterval(snapshot("volcengine", "signed_out"), "focus")).toBe(FOCUS_ATTENTION_REFRESH_MS);
  });

  it("keeps at least one provider monitored when imported preferences pause every provider", () => {
    expect(monitoredProviderIds(["codex", "claude", "qoder", "trae", "workbuddy", "volcengine", "antigravity"])).toEqual(["codex"]);
    expect(monitoredProviderIds(["qoder"])).not.toContain("qoder");
  });

  it("treats an attempted but undetected provider as attention work instead of a hot loop", () => {
    const now = 10_000_000;
    expect(providersDueForRefresh([], ["antigravity"], { antigravity: now - 60_000 }, "balanced", now)).toEqual([]);
    expect(nextProviderRefreshDelay([], ["antigravity"], { antigravity: now - 60_000 }, "balanced", now)).toBe(BALANCED_ATTENTION_REFRESH_MS - 60_000);
  });
});

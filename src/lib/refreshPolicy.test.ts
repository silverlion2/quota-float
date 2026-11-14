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
  providersToRetryOnReconnect,
  settleProviderFailures,
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
  it("backs off transient failures independently and clears the streak after recovery", () => {
    const stale = snapshot("codex", "stale");
    expect([1, 2, 3, 4, 5, 6, 20].map((count) => providerRefreshInterval(stale, "balanced", count)))
      .toEqual([1, 2, 4, 8, 16, 30, 30].map((minutes) => minutes * 60_000));
    expect(providerRefreshInterval(stale, "focus", 6)).toBe(60 * 60_000);
    expect(providerRefreshInterval(snapshot("claude", "signed_out"), "balanced", 5)).toBe(BALANCED_ATTENTION_REFRESH_MS);
    expect(providerRefreshInterval(undefined, "balanced", 5)).toBe(BALANCED_ATTENTION_REFRESH_MS);
    expect(providerRefreshInterval(snapshot("antigravity", "unavailable"), "balanced", 1)).toBe(BALANCED_ATTENTION_REFRESH_MS);
    expect(settleProviderFailures({ codex: 4, claude: 2 }, [snapshot("codex")], ["codex"]))
      .toEqual({ codex: 0, claude: 2 });
    expect(settleProviderFailures({ codex: 6 }, [stale], ["codex"])).toEqual({ codex: 6 });
  });

  it("uses the same retry deadline in due selection and the next timer", () => {
    const values = [snapshot("codex", "stale"), snapshot("claude")];
    const attempts = { codex: 1000, claude: 1000 };
    expect(nextProviderRefreshDelay(values, ["codex", "claude"], attempts, "balanced", 60_000, { codex: 1 })).toBe(1000);
    expect(providersDueForRefresh(values, ["codex", "claude"], attempts, "balanced", 61_000, { codex: 1 })).toEqual(["codex"]);
  });
  it("keeps due selection and scheduling consistent after a backward clock correction", () => {
    const now = 10_000_000;
    const attempts = { codex: now + 3_600_000, claude: now - 10_000 };
    const snapshots = [snapshot("codex", "stale"), snapshot("claude")];
    expect(providersDueForRefresh(snapshots, ["codex", "claude"], attempts, "focus", now)).toEqual(["codex"]);
    expect(nextProviderRefreshDelay(snapshots, ["codex", "claude"], attempts, "focus", now)).toBe(0);
    expect(nextProviderRefreshDelay(snapshots, ["codex"], { codex: now }, "focus", now)).toBe(FOCUS_ATTENTION_REFRESH_MS);
  });

  it("makes overdue and invalid clocks due without changing attention cooldowns", () => {
    const now = 10_000_000;
    expect(providersDueForRefresh([snapshot("codex")], ["codex"], { codex: Number.NaN }, "balanced", now)).toEqual(["codex"]);
    expect(nextProviderRefreshDelay([], ["codex"], { codex: now - FOCUS_ATTENTION_REFRESH_MS }, "focus", now)).toBe(0);
  });

  it("retries only transient failed monitored sources after reconnect", () => {
    expect(providersToRetryOnReconnect([
      snapshot("codex", "stale"), snapshot("claude", "unavailable"),
      snapshot("qoder", "unavailable"), snapshot("trae", "signed_out"), snapshot("workbuddy"),
    ], ["codex", "claude", "trae", "workbuddy"])).toEqual(["codex", "claude"]);
  });

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

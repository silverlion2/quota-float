import { describe, expect, it } from "vitest";
import { canSendNotification, EMPTY_RUNTIME_STATE, isQuietHour, normalizeRuntimeState, recordSnapshotActivity } from "./activity";
import type { ProviderSnapshot } from "../types";

function snapshot(remainingPercent: number, status: ProviderSnapshot["status"] = "ok"): ProviderSnapshot {
  return {
    provider: "codex", displayName: "CODEX", plan: "PRO", shortWindow: null,
    weeklyWindow: { remainingPercent, resetsAt: "2026-07-25T00:00:00Z", windowSeconds: 604800 },
    resetCredits: 1, updatedAt: "2026-07-19T00:00:00Z", status, message: status === "ok" ? null : "offline",
  };
}

describe("activity timeline and notification policy", () => {
  it("records low quota crossings and provider recovery", () => {
    const low = recordSnapshotActivity(EMPTY_RUNTIME_STATE, [snapshot(30)], [snapshot(12)], null, 15, new Date("2026-07-19T01:00:00Z"));
    expect(low.createdEvents.map((item) => item.kind)).toContain("quota");
    const recovered = recordSnapshotActivity(low.state, [snapshot(12, "stale")], [snapshot(12)], null, 15, new Date("2026-07-19T02:00:00Z"));
    expect(recovered.createdEvents.map((item) => item.kind)).toContain("recovered");
  });

  it("deduplicates unchanged samples for thirty minutes", () => {
    const first = recordSnapshotActivity(EMPTY_RUNTIME_STATE, [], [snapshot(50)], null, 15, new Date("2026-07-19T01:00:00Z"));
    const second = recordSnapshotActivity(first.state, [snapshot(50)], [snapshot(50)], null, 15, new Date("2026-07-19T01:10:00Z"));
    expect(second.state.history).toHaveLength(1);
  });

  it("supports overnight quiet hours and per-alert cooldowns", () => {
    expect(isQuietHour(23, 22, 8)).toBe(true);
    expect(isQuietHour(7, 22, 8)).toBe(true);
    expect(isQuietHour(12, 22, 8)).toBe(false);
    const state = { ...EMPTY_RUNTIME_STATE, lastNotifications: { "quota:codex": "2026-07-19T01:00:00Z" } };
    expect(canSendNotification(state, "quota:codex", 120, new Date("2026-07-19T02:00:00Z"))).toBe(false);
    expect(canSendNotification(state, "quota:codex", 120, new Date("2026-07-19T03:01:00Z"))).toBe(true);
  });

  it("drops malformed imported history, events, layouts, and notification dates", () => {
    const normalized = normalizeRuntimeState({
      schemaVersion: 99,
      history: ["bad", { provider: "unknown", capturedAt: "not-a-date", metric: "many" }],
      events: [null, { id: 3, provider: "codex", kind: "reset", occurredAt: "invalid" }],
      savedLayouts: [{ id: null, name: [], providerOrder: ["unknown"] }],
      lastNotifications: { "quota:codex": "not-a-date", unsafe: 12 },
    });
    expect(normalized).toEqual(EMPTY_RUNTIME_STATE);
  });
});

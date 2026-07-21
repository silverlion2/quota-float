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

  it("creates a reminder when Volcengine usage crosses the even-cycle pace", () => {
    const volcengine = (monthlyRemaining: number): ProviderSnapshot => ({
      provider: "volcengine",
      displayName: "VOLCENGINE",
      plan: "Coding Plan Personal",
      shortWindow: null,
      weeklyWindow: { remainingPercent: 100, resetsAt: "2026-07-26T00:00:00Z", windowSeconds: 604_800 },
      monthlyWindow: { remainingPercent: monthlyRemaining, resetsAt: "2026-08-18T00:00:00Z", windowSeconds: 2_592_000 },
      resetCredits: null,
      updatedAt: "2026-07-19T00:00:00Z",
      status: "ok",
      message: null,
    });
    const update = recordSnapshotActivity(
      EMPTY_RUNTIME_STATE,
      [volcengine(100)],
      [volcengine(99)],
      null,
      15,
      new Date("2026-07-19T00:00:00Z"),
    );
    expect(update.createdEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "warning", provider: "volcengine", title: "VOLCENGINE usage is over pace" }),
    ]));
  });

  it("tracks low-quota crossings for every Volcengine window", () => {
    const volcengine = (shortRemaining: number): ProviderSnapshot => ({
      provider: "volcengine",
      displayName: "VOLCENGINE",
      plan: "Coding Plan Personal",
      shortWindow: { remainingPercent: shortRemaining, resetsAt: "2026-07-19T05:00:00Z", windowSeconds: 18_000 },
      weeklyWindow: { remainingPercent: 80, resetsAt: "2026-07-26T00:00:00Z", windowSeconds: 604_800 },
      monthlyWindow: { remainingPercent: 70, resetsAt: "2026-08-18T00:00:00Z", windowSeconds: 2_592_000 },
      resetCredits: null,
      updatedAt: "2026-07-19T00:00:00Z",
      status: "ok",
      message: null,
    });
    const update = recordSnapshotActivity(
      EMPTY_RUNTIME_STATE,
      [volcengine(30)],
      [volcengine(12)],
      null,
      15,
      new Date("2026-07-19T01:00:00Z"),
    );
    expect(update.createdEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "quota", detail: "12% 5-hour quota remains." }),
    ]));
  });

  it("reminds when the Codex weekly window moves over pace", () => {
    const update = recordSnapshotActivity(
      EMPTY_RUNTIME_STATE,
      [snapshot(100)],
      [snapshot(80)],
      null,
      15,
      new Date("2026-07-19T02:00:00Z"),
    );
    expect(update.createdEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "warning", provider: "codex", title: "CODEX usage is over pace", detail: expect.stringContaining("remains in today's plan") }),
    ]));
    expect(update.notificationCandidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "pace:codex:weekly" }),
    ]));
  });

  it("repeats an over-pace notification after cooldown without duplicating the activity log", () => {
    const current = {
      ...EMPTY_RUNTIME_STATE,
      lastNotifications: { "pace:codex:weekly": "2026-07-18T23:00:00Z" },
    };
    const update = recordSnapshotActivity(
      current,
      [snapshot(80)],
      [snapshot(79)],
      null,
      15,
      new Date("2026-07-19T02:00:00Z"),
      "en",
      120,
    );
    expect(update.createdEvents.filter((item) => item.kind === "warning")).toHaveLength(0);
    expect(update.notificationCandidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "pace:codex:weekly", event: expect.objectContaining({ title: "CODEX usage is over pace" }) }),
    ]));
  });

  it("does not repeat an over-pace notification before cooldown expires", () => {
    const current = {
      ...EMPTY_RUNTIME_STATE,
      lastNotifications: { "pace:codex:weekly": "2026-07-19T01:30:00Z" },
    };
    const update = recordSnapshotActivity(
      current,
      [snapshot(80)],
      [snapshot(79)],
      null,
      15,
      new Date("2026-07-19T02:00:00Z"),
      "en",
      120,
    );
    expect(update.notificationCandidates.some((item) => item.key === "pace:codex:weekly")).toBe(false);
  });

  it("escalates immediately when the fixed daily budget reaches zero", () => {
    const anchored = recordSnapshotActivity(
      EMPTY_RUNTIME_STATE,
      [],
      [snapshot(1)],
      null,
      15,
      new Date("2026-07-19T01:00:00Z"),
      "en",
      120,
    );
    const update = recordSnapshotActivity(
      anchored.state,
      [snapshot(1)],
      [snapshot(0)],
      null,
      15,
      new Date("2026-07-19T02:00:00Z"),
      "en",
      120,
    );
    expect(update.createdEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: "CODEX today's pace budget is used up", detail: expect.stringContaining("0% remains in today's plan") }),
    ]));
    expect(update.notificationCandidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "pace-zero:codex:weekly" }),
    ]));
  });

  it("resets the Codex daily pacing anchor when the weekly quota resets", () => {
    const beforeReset = recordSnapshotActivity(
      {
        ...EMPTY_RUNTIME_STATE,
        lastNotifications: {
          "pace:codex:weekly": "2026-07-19T02:30:00Z",
          "quota:codex": "2026-07-19T02:30:00Z",
          "quota:volcengine": "2026-07-19T02:30:00Z",
        },
      },
      [],
      [snapshot(20)],
      null,
      15,
      new Date("2026-07-19T02:00:00Z"),
    );
    const resetSnapshot = snapshot(100);
    resetSnapshot.weeklyWindow = { ...resetSnapshot.weeklyWindow!, resetsAt: "2026-08-01T00:00:00Z" };
    const afterReset = recordSnapshotActivity(
      beforeReset.state,
      [snapshot(20)],
      [resetSnapshot],
      { resetAt: "2026-07-19T03:00:00Z", detectedAt: "2026-07-19T03:00:00Z", source: "observed" },
      15,
      new Date("2026-07-19T03:00:00Z"),
      "en",
      120,
      {
        score: 90,
        windowHours: 48,
        fetchedAt: "2026-07-19T03:00:00Z",
        resetAnnounced: false,
        sourceUrl: "https://codexresetradar.com/",
      },
    );
    const baseline = afterReset.state.dailyPaceBaselines["codex:weekly"];

    expect(baseline.remainingPercent).toBe(100);
    expect(baseline.resetsAt).toBe("2026-08-01T00:00:00Z");
    expect(baseline.capturedAt).toBe("2026-07-19T03:00:00.000Z");
    expect(baseline.planningResetsAt).toBe("2026-08-01T00:00:00Z");
    expect(baseline.resetForecastScore).toBeNull();
    expect(afterReset.state.lastNotifications).toEqual({ "quota:volcengine": "2026-07-19T02:30:00Z" });
    expect(afterReset.createdEvents).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "reset" })]));

    const usedSnapshot = snapshot(95);
    usedSnapshot.weeklyWindow = { ...usedSnapshot.weeklyWindow!, resetsAt: "2026-08-01T00:00:00Z" };
    const afterRefresh = recordSnapshotActivity(
      afterReset.state,
      [resetSnapshot],
      [usedSnapshot],
      { resetAt: "2026-07-19T03:00:00Z", detectedAt: "2026-07-19T03:00:00Z", source: "window" },
      15,
      new Date("2026-07-19T04:00:00Z"),
    );

    expect(afterRefresh.state.dailyPaceBaselines["codex:weekly"]).toEqual(baseline);
    expect(afterRefresh.createdEvents).not.toEqual(expect.arrayContaining([expect.objectContaining({ kind: "reset" })]));
    expect(afterRefresh.notificationCandidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "pace-zero:codex:weekly" }),
    ]));
  });

  it("loads pre-Radar daily baselines with the weekly reset as their fallback", () => {
    const normalized = normalizeRuntimeState({
      dailyPaceBaselines: {
        "codex:weekly": {
          provider: "codex",
          period: "weekly",
          localDate: "2026-07-19",
          capturedAt: "2026-07-19T01:00:00Z",
          remainingPercent: 50,
          resetsAt: "2026-07-25T00:00:00Z",
        },
      },
    });

    expect(normalized.dailyPaceBaselines["codex:weekly"]).toEqual(expect.objectContaining({
      planningResetsAt: "2026-07-25T00:00:00Z",
      resetForecastScore: null,
      resetForecastWindowHours: null,
    }));
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

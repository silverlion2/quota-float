import { describe, expect, it } from "vitest";
import type { ProviderSnapshot } from "../types";
import { calculateQuotaPace, mostOverPaceWindow, paceBaselineKey, refreshDailyPaceBaselines, trackedQuotaWindows } from "./quotaPace";

function codexSnapshot(remainingPercent: number, resetsAt: string): ProviderSnapshot {
  return {
    provider: "codex",
    displayName: "CODEX",
    plan: "PRO",
    shortWindow: null,
    weeklyWindow: { remainingPercent, resetsAt, windowSeconds: 604_800 },
    resetCredits: 0,
    updatedAt: "2026-07-20T00:00:00Z",
    status: "ok",
    message: null,
  };
}

describe("quota pace", () => {
  it("marks usage below the elapsed share as on track", () => {
    const pace = calculateQuotaPace(
      { remainingPercent: 90, resetsAt: "2026-07-20T05:00:00Z", windowSeconds: 18_000 },
      new Date("2026-07-20T02:00:00Z"),
    );
    expect(pace.status).toBe("on_track");
    expect(pace.recommendedUsedPercent).toBeCloseTo(40);
    expect(pace.todayRemainingPercent).toBeCloseTo(90);
    expect(pace.averageRate).toBeCloseTo(30);
    expect(pace.unit).toBe("hour");
  });

  it("reports how far usage is ahead of an even weekly pace", () => {
    const startsAt = new Date(2026, 6, 20, 0, 0, 0);
    const now = new Date(2026, 6, 22, 0, 0, 0);
    const resetsAt = new Date(2026, 6, 27, 0, 0, 0);
    const pace = calculateQuotaPace(
      { remainingPercent: 50, resetsAt: resetsAt.toISOString(), windowSeconds: (resetsAt.getTime() - startsAt.getTime()) / 1000 },
      now,
    );
    expect(pace.status).toBe("over_pace");
    expect(pace.recommendedUsedPercent).toBeCloseTo(28.571, 2);
    expect(pace.todayRemainingPercent).toBeCloseTo(10, 2);
    expect(pace.overByPercent).toBeCloseTo(21.429, 2);
    expect(pace.averageRate).toBeCloseTo(10, 2);
    expect(pace.unit).toBe("day");
  });

  it("keeps an unused session on track when the reset time is absent", () => {
    const pace = calculateQuotaPace({ remainingPercent: 100, resetsAt: null, windowSeconds: 18_000 });
    expect(pace.status).toBe("on_track");
    expect(pace.recommendedUsedPercent).toBeNull();
    expect(pace.todayRemainingPercent).toBeNull();
  });

  it("rebalances today's budget from the quota and time currently remaining", () => {
    const startsAt = new Date(2026, 6, 20, 0, 0, 0);
    const resetsAt = new Date(startsAt.getTime() + 7 * 86_400_000);
    const pace = calculateQuotaPace(
      { remainingPercent: 90, resetsAt: resetsAt.toISOString(), windowSeconds: 604_800 },
      new Date(2026, 6, 22, 12, 0, 0),
    );
    expect(pace.todayRemainingPercent).toBeCloseTo(10, 2);
    expect(pace.averageRate).toBeCloseTo(20, 2);
  });

  it("automatically increases tomorrow's budget when quota is conserved", () => {
    const startsAt = new Date(2026, 6, 20, 0, 0, 0);
    const resetsAt = new Date(startsAt.getTime() + 7 * 86_400_000);
    const today = calculateQuotaPace(
      { remainingPercent: 80, resetsAt: resetsAt.toISOString(), windowSeconds: 604_800 },
      new Date(2026, 6, 22, 0, 0, 0),
    );
    const tomorrow = calculateQuotaPace(
      { remainingPercent: 75, resetsAt: resetsAt.toISOString(), windowSeconds: 604_800 },
      new Date(2026, 6, 23, 0, 0, 0),
    );

    expect(today.todayRemainingPercent).toBeCloseTo(16, 2);
    expect(tomorrow.todayRemainingPercent).toBeCloseTo(18.75, 2);
  });

  it("keeps the daily suggestion fixed while live usage spends against it", () => {
    const now = new Date(2026, 6, 22, 8, 0, 0);
    const resetsAt = new Date(2026, 6, 25, 20, 0, 0).toISOString();
    const [baseline] = Object.values(refreshDailyPaceBaselines({}, [codexSnapshot(70, resetsAt)], now));
    const initial = calculateQuotaPace(codexSnapshot(70, resetsAt).weeklyWindow!, now, baseline);
    const refreshed = calculateQuotaPace(
      codexSnapshot(65, resetsAt).weeklyWindow!,
      new Date(2026, 6, 22, 13, 0, 0),
      baseline,
    );

    expect(refreshed.averageRate).toBeCloseTo(initial.averageRate, 8);
    expect(refreshed.todayRemainingPercent).toBeCloseTo((initial.todayRemainingPercent ?? 0) - 5, 8);
  });

  it("recalculates next day from leftover quota and the exact projected reset time", () => {
    const resetsAt = new Date(2026, 6, 25, 12, 0, 0).toISOString();
    const firstDay = new Date(2026, 6, 22, 8, 0, 0);
    const first = refreshDailyPaceBaselines({}, [codexSnapshot(70, resetsAt)], firstDay);
    const nextDay = new Date(2026, 6, 23, 0, 0, 0);
    const next = refreshDailyPaceBaselines(first, [codexSnapshot(66, resetsAt)], nextDay);
    const baseline = next[paceBaselineKey("codex", "weekly")];
    const pace = calculateQuotaPace(codexSnapshot(66, resetsAt).weeklyWindow!, nextDay, baseline);

    expect(baseline.localDate).not.toBe(first[paceBaselineKey("codex", "weekly")].localDate);
    // 66% is spread across exactly 2.5 days, so the new full-day allowance is 26.4%.
    expect(pace.todayRemainingPercent).toBeCloseTo(26.4, 8);
    expect(pace.averageRate).toBeCloseTo(26.4, 8);
  });

  it("reanchors immediately when the projected weekly reset timestamp changes", () => {
    const now = new Date(2026, 6, 22, 8, 0, 0);
    const oldReset = new Date(2026, 6, 26, 8, 0, 0).toISOString();
    const newReset = new Date(2026, 6, 25, 8, 0, 0).toISOString();
    const oldBaselines = refreshDailyPaceBaselines({}, [codexSnapshot(70, oldReset)], now);
    const next = refreshDailyPaceBaselines(oldBaselines, [codexSnapshot(68, newReset)], new Date(2026, 6, 22, 9, 0, 0));
    const baseline = next[paceBaselineKey("codex", "weekly")];

    expect(baseline.resetsAt).toBe(newReset);
    expect(baseline.remainingPercent).toBe(68);
    expect(baseline.capturedAt).toBe(new Date(2026, 6, 22, 9, 0, 0).toISOString());
  });

  it("tracks only the weekly Codex window even when compatibility data includes 5h", () => {
    const codex: ProviderSnapshot = {
      provider: "codex",
      displayName: "CODEX",
      plan: "PRO",
      shortWindow: { remainingPercent: 1, resetsAt: "2026-07-20T05:00:00Z", windowSeconds: 18_000 },
      weeklyWindow: { remainingPercent: 90, resetsAt: "2026-07-25T00:00:00Z", windowSeconds: 604_800 },
      resetCredits: 0,
      updatedAt: "2026-07-20T00:00:00Z",
      status: "ok",
      message: null,
    };
    expect(trackedQuotaWindows(codex).map((item) => item.period)).toEqual(["weekly"]);
    expect(mostOverPaceWindow(codex, new Date("2026-07-20T00:00:00Z"))).toBeNull();
  });
});

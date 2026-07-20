import { describe, expect, it } from "vitest";
import type { ProviderSnapshot } from "../types";
import { calculateQuotaPace, mostOverPaceWindow, trackedQuotaWindows } from "./quotaPace";

describe("quota pace", () => {
  it("marks usage below the elapsed share as on track", () => {
    const pace = calculateQuotaPace(
      { remainingPercent: 90, resetsAt: "2026-07-20T05:00:00Z", windowSeconds: 18_000 },
      new Date("2026-07-20T02:00:00Z"),
    );
    expect(pace.status).toBe("on_track");
    expect(pace.recommendedUsedPercent).toBeCloseTo(40);
    expect(pace.todayRemainingPercent).toBeCloseTo(90);
    expect(pace.averageRate).toBeCloseTo(20);
    expect(pace.unit).toBe("hour");
  });

  it("reports how far usage is ahead of an even weekly pace", () => {
    const pace = calculateQuotaPace(
      { remainingPercent: 50, resetsAt: "2026-07-27T00:00:00Z", windowSeconds: 604_800 },
      new Date("2026-07-22T00:00:00Z"),
    );
    expect(pace.status).toBe("over_pace");
    expect(pace.recommendedUsedPercent).toBeCloseTo(28.571, 2);
    expect(pace.todayRemainingPercent).toBe(0);
    expect(pace.overByPercent).toBeCloseTo(21.429, 2);
    expect(pace.averageRate).toBeCloseTo(14.286, 2);
    expect(pace.unit).toBe("day");
  });

  it("keeps an unused session on track when the reset time is absent", () => {
    const pace = calculateQuotaPace({ remainingPercent: 100, resetsAt: null, windowSeconds: 18_000 });
    expect(pace.status).toBe("on_track");
    expect(pace.recommendedUsedPercent).toBeNull();
    expect(pace.todayRemainingPercent).toBeNull();
  });

  it("reports how much of the even-cycle plan remains through local midnight", () => {
    const startsAt = new Date(2026, 6, 20, 0, 0, 0);
    const resetsAt = new Date(startsAt.getTime() + 7 * 86_400_000);
    const pace = calculateQuotaPace(
      { remainingPercent: 90, resetsAt: resetsAt.toISOString(), windowSeconds: 604_800 },
      new Date(2026, 6, 22, 12, 0, 0),
    );
    expect(pace.todayRemainingPercent).toBeCloseTo(32.857, 2);
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

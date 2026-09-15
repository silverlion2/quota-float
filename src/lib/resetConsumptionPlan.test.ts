import { describe, expect, it } from "vitest";
import type { ProviderSnapshot, QuotaHistoryPoint } from "../types";
import { calculateResetConsumptionPlan } from "./resetConsumptionPlan";

const now = new Date("2026-09-15T12:00:00.000Z");
const reset = "2026-09-17T12:00:00.000Z";

function snapshot(remainingPercent = 60, overrides: Partial<ProviderSnapshot> = {}): ProviderSnapshot {
  return {
    provider: "codex",
    displayName: "Codex",
    plan: "Pro",
    shortWindow: null,
    weeklyWindow: { remainingPercent, resetsAt: reset, windowSeconds: 604_800 },
    resetCredits: 0,
    updatedAt: now.toISOString(),
    status: "ok",
    message: null,
    ...overrides,
  };
}

function point(
  minutesAgo: number,
  metric: number,
  overrides: Partial<QuotaHistoryPoint> = {},
): QuotaHistoryPoint {
  return {
    provider: "codex",
    capturedAt: new Date(now.getTime() - minutesAgo * 60_000).toISOString(),
    metric,
    metricKind: "percent",
    status: "ok",
    resetsAt: reset,
    ...overrides,
  };
}

describe("calculateResetConsumptionPlan", () => {
  it("returns the weekly target and an observed burn forecast", () => {
    const plan = calculateResetConsumptionPlan(snapshot(), [point(60, 72), point(30, 66), point(0, 60)], now);
    expect(plan).toMatchObject({
      remainingPercent: 60,
      hoursUntilReset: 48,
      targetPercentPerHour: 1.25,
      observedBurnPercentPerHour: 12,
      forecastHoursToExhaustion: 5,
      forecastUnusedPercentAtReset: 0,
      sampleCount: 3,
      sampleSpanMinutes: 60,
      observationStatus: "observed",
    });
  });

  it("requires three samples spanning at least thirty minutes", () => {
    const plan = calculateResetConsumptionPlan(snapshot(), [point(20, 64), point(10, 62), point(0, 60)], now);
    expect(plan?.observedBurnPercentPerHour).toBeNull();
    expect(plan?.observationStatus).toBe("insufficient_history");
    expect(plan?.sampleSpanMinutes).toBe(20);
  });

  it("rejects a stale current snapshot and a reset that already passed", () => {
    expect(calculateResetConsumptionPlan(snapshot(60, { status: "stale" }), [], now)).toBeNull();
    expect(calculateResetConsumptionPlan(snapshot(60, {
      updatedAt: new Date(now.getTime() - 16 * 60_000).toISOString(),
    }), [], now)).toBeNull();
    expect(calculateResetConsumptionPlan(snapshot(60, {
      weeklyWindow: { remainingPercent: 60, resetsAt: "2026-09-15T11:59:00.000Z", windowSeconds: 604_800 },
    }), [], now)).toBeNull();
  });

  it("does not mistake a short-window history point for weekly history", () => {
    const plan = calculateResetConsumptionPlan(snapshot(), [
      point(60, 72, { resetsAt: "2026-09-15T13:00:00.000Z" }),
      point(30, 66, { resetsAt: "2026-09-15T13:00:00.000Z" }),
      point(0, 60, { resetsAt: "2026-09-15T13:00:00.000Z" }),
    ], now);
    expect(plan?.observedBurnPercentPerHour).toBeNull();
    expect(plan?.observationStatus).toBe("ambiguous_history");
  });

  it("breaks after a refill and uses only the post-refill segment", () => {
    const plan = calculateResetConsumptionPlan(snapshot(), [
      point(120, 80),
      point(90, 70),
      point(60, 75),
      point(30, 68),
      point(0, 60),
    ], now);
    expect(plan?.observationStatus).toBe("observed");
    expect(plan?.sampleCount).toBe(3);
    expect(plan?.sampleSpanMinutes).toBe(60);
  });

  it("breaks across a long gap and reports a fresh contiguous segment", () => {
    const plan = calculateResetConsumptionPlan(snapshot(), [
      point(240, 90),
      point(170, 80),
      point(60, 70),
      point(30, 65),
      point(0, 60),
    ], now);
    expect(plan?.observationStatus).toBe("observed");
    expect(plan?.sampleCount).toBe(3);
    expect(plan?.sampleSpanMinutes).toBe(60);
  });

  it("uses the current snapshot as the freshest sample when identity matches", () => {
    const plan = calculateResetConsumptionPlan(
      snapshot(60, { updatedAt: new Date(now.getTime() - 5 * 60_000).toISOString() }),
      [point(65, 72), point(35, 66)],
      now,
    );
    expect(plan?.observationStatus).toBe("observed");
    expect(plan?.sampleCount).toBe(3);
    expect(plan?.sampleSpanMinutes).toBe(60);
  });

  it("counts duplicate timestamps once and ignores history newer than the snapshot", () => {
    const plan = calculateResetConsumptionPlan(
      snapshot(60, { updatedAt: new Date(now.getTime() - 5 * 60_000).toISOString() }),
      [
        point(65, 72),
        point(35, 66),
        point(35, 67),
        point(0, 50),
      ],
      now,
    );
    expect(plan?.sampleCount).toBe(3);
    expect(plan?.observedBurnPercentPerHour).toBe(12);
  });

  it("reports a flat observed rate and the balance left at reset", () => {
    const plan = calculateResetConsumptionPlan(snapshot(), [point(60, 60), point(30, 60), point(0, 60)], now);
    expect(plan).toMatchObject({
      observationStatus: "observed",
      observedBurnPercentPerHour: 0,
      forecastHoursToExhaustion: null,
      forecastUnusedPercentAtReset: 60,
    });
  });

  it("breaks around stale history instead of carrying an old rate forward", () => {
    const plan = calculateResetConsumptionPlan(snapshot(), [
      point(120, 80),
      point(90, 75, { status: "stale" }),
      point(60, 70),
      point(30, 65),
      point(0, 60),
    ], now);
    expect(plan?.observationStatus).toBe("observed");
    expect(plan?.sampleCount).toBe(3);
  });
});

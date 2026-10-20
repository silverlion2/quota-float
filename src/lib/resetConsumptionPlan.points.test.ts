import { describe, expect, it } from "vitest";
import type { ProviderSnapshot, QuotaHistoryPoint } from "../types";
import { calculateResetConsumptionPlan } from "./resetConsumptionPlan";

const now = new Date("2026-10-21T12:00:00Z");
const reset = "2026-10-22T12:00:00Z";
const snapshot: ProviderSnapshot = {
  provider: "codex", displayName: "CODEX", plan: "Pro", status: "ok", updatedAt: now.toISOString(),
  weeklyWindow: { remainingPercent: 48, resetsAt: reset, windowSeconds: 604800 },
  shortWindow: null, resetCredits: null, message: null,
};
const point = (minutes: number, metric: number, extra: Partial<QuotaHistoryPoint> = {}): QuotaHistoryPoint => ({
  provider: "codex", capturedAt: new Date(now.getTime() - minutes * 60000).toISOString(),
  metric, metricKind: "percent", status: "ok", resetsAt: reset, ...extra,
});

describe("personal quota burndown", () => {
  it("keeps actual measurements, deduplicates and lets the snapshot replace its duplicate", () => {
    const result = calculateResetConsumptionPlan(snapshot, [point(30, 49), point(60, 50), point(0, 99), point(30, 49)], now)!;
    expect(result.points.map((p) => p.remainingPercent)).toEqual([50, 49, 48]);
    expect(result.observationStatus).toBe("observed");
  });
  it.each(["stale", "unavailable", "signed_out"] as const)("does not present a guide for %s data", (status) => {
    expect(calculateResetConsumptionPlan({ ...snapshot, status }, [point(30, 49)], now)).toBeNull();
  });
  it("rejects old snapshots, expired resets and invalid percentages", () => {
    expect(calculateResetConsumptionPlan(snapshot, [], new Date(now.getTime() + 16 * 60000))).toBeNull();
    expect(calculateResetConsumptionPlan({ ...snapshot, weeklyWindow: { ...snapshot.weeklyWindow!, resetsAt: now.toISOString() } }, [], now)).toBeNull();
    expect(calculateResetConsumptionPlan({ ...snapshot, weeklyWindow: { ...snapshot.weeklyWindow!, remainingPercent: NaN } }, [], now)).toBeNull();
  });
  it.each([
    { name: "failure", middle: point(40, 51, { status: "stale" }) },
    { name: "changed reset", middle: point(40, 51, { resetsAt: "2026-10-23T12:00:00Z" }) },
    { name: "ambiguous metric", middle: point(40, 51, { metricKind: "balance" }) },
    { name: "changed plan", middle: point(40, 51, { plan: "Other" }) },
  ])("starts after a $name boundary", ({ middle }) => {
    const result = calculateResetConsumptionPlan(snapshot, [point(60, 60), middle, point(20, 49)], now)!;
    expect(result.points.map((p) => p.remainingPercent)).toEqual([49, 48]);
  });
  it("starts after refill and long gaps; excludes future and outside-six-hour samples", () => {
    expect(calculateResetConsumptionPlan(snapshot, [point(60, 40), point(30, 49)], now)!.points.map((p) => p.remainingPercent)).toEqual([49, 48]);
    expect(calculateResetConsumptionPlan(snapshot, [point(100, 60), point(20, 49)], now)!.points.map((p) => p.remainingPercent)).toEqual([49, 48]);
    expect(calculateResetConsumptionPlan(snapshot, [point(400, 80), point(-10, 40)], now)!.points.map((p) => p.remainingPercent)).toEqual([48]);
  });
  it("retains a single measured point without creating a historical start", () => {
    expect(calculateResetConsumptionPlan(snapshot, [], now)!.points).toEqual([{ capturedAt: snapshot.updatedAt, remainingPercent: 48 }]);
  });
});

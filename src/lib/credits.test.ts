import { describe, expect, it } from "vitest";
import { creditChanges, creditPools, normalizeCreditSample } from "./credits";
import type { ProviderSnapshot, QuotaHistoryPoint } from "../types";

const snapshot: ProviderSnapshot = { provider: "codex", displayName: "CODEX", plan: "PRO", shortWindow: null, weeklyWindow: null,
  resetCredits: 2, balanceRemaining: 125.5, balanceUnit: "credits", status: "ok", message: null, updatedAt: "2026-10-25T12:00:00Z" };
const now = new Date("2026-10-25T12:00:00Z");
const point = (balance: number | null, hour: number, extra: Partial<QuotaHistoryPoint> = {}): QuotaHistoryPoint => ({
  provider: "codex", metric: 70, metricKind: "percent", status: "ok", resetsAt: null, plan: "PRO",
  capturedAt: `2026-10-25T${String(hour).padStart(2, "0")}:00:00Z`, credits: { reset: 2, balance, unit: "credits" }, ...extra,
});

describe("credits independent counters", () => {
  it("keeps extra and reset credits separate with no invented expiry", () => {
    const pools = creditPools(snapshot);
    expect(pools.map(({ kind, remaining }) => [kind, remaining])).toEqual([["reset", 2], ["balance", 125.5]]);
    expect(pools.every((pool) => pool.expirations.length === 0)).toBe(true);
  });
  it("preserves zero, unlimited and mixed known/unknown grant dates", () => {
    expect(creditPools({ ...snapshot, balanceRemaining: 0 })[1].remaining).toBe(0);
    expect(creditPools({ ...snapshot, balanceRemaining: 0, balanceUnit: "unlimited" })[1].unlimited).toBe(true);
    const pools = creditPools({ ...snapshot, provider: "trae", resetCredits: null, balanceGrants: [
      { remaining: 25, expiresAt: null }, { remaining: 100, expiresAt: "2026-10-26T12:00:00Z" },
    ] });
    expect(pools[0].expirations[0].remaining).toBe(100);
    expect(pools[0].expirations[1].expiresAt).toBeNull();
  });
  it("hides stale-looking data on signed-out snapshots and rejects invalid counters", () => {
    expect(creditPools({ ...snapshot, status: "signed_out" }).every((pool) => pool.remaining === null && pool.expirations.length === 0)).toBe(true);
    expect(normalizeCreditSample({ reset: -1, balance: Infinity, unit: "secret" })).toEqual({ reset: null, balance: null, unit: null });
  });
  it("records observed deltas rather than claiming consumption", () => {
    expect(creditChanges([point(100, 8), point(80, 9), point(180, 10)], snapshot, "balance", now).map((row) => row.delta)).toEqual([100, -20, null]);
  });
  it("uses the last observation at an instant instead of inventing same-time consumption", () => {
    expect(creditChanges([point(100, 8), point(80, 8), point(90, 9)], snapshot, "balance", now).map((row) => row.delta)).toEqual([10, null]);
  });
  it("breaks comparisons at failures, unknown values, long gaps and plan boundaries", () => {
    const rows = [point(100, 1), point(80, 8), point(null, 9), point(70, 10), point(60, 11, { plan: "PLUS" }), point(50, 12, { status: "stale" })];
    expect(creditChanges(rows, snapshot, "balance", now).map((row) => row.delta)).toEqual([null, null, null, null]);
  });
  it("keeps known-plan boundaries across unknown plan samples and ignores future points", () => {
    const rows = [point(100, 8), point(90, 9, { plan: null }), point(80, 10, { plan: "PLUS" }), point(60, 13)];
    expect(creditChanges(rows, snapshot, "balance", now).map((row) => row.delta)).toEqual([null, -10, null]);
  });
});

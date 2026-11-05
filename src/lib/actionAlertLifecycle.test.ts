import { describe, expect, it } from "vitest";
import { normalizeActionAlertHistory, reconcileActionAlertHistory } from "./actionAlertLifecycle";
import { buildActionAlerts } from "./actionAlerts";
import { EMPTY_RUNTIME_STATE, normalizeRuntimeState, runtimeStatesEqual } from "./activity";
import { DEFAULT_WIDGET_PREFERENCES as prefs } from "./preferences";
import type { ProviderSnapshot } from "../types";
const now = new Date("2026-11-06T12:00:00Z");
const at = (minutes: number) => new Date(+now + minutes * 60_000).toISOString();
const s: ProviderSnapshot = { provider: "codex", displayName: "Codex", status: "ok", plan: "PRO", updatedAt: at(0),
  shortWindow: null, weeklyWindow: null, resetCredits: 1, resetCreditExpiresAt: [at(2)], message: null };
const alerts = buildActionAlerts([s], prefs, now);
const initial = () => reconcileActionAlertHistory([], alerts, [s], [], now);
describe("local reminder history", () => {
  it("records without notification receipts and persists through normalization", () => {
    const history = initial();
    const state = { ...EMPTY_RUNTIME_STATE, actionAlertHistory: history };
    expect(history[0].status).toBe("active");
    expect(normalizeRuntimeState(state).actionAlertHistory).toEqual(history);
    expect(runtimeStatesEqual(state, EMPTY_RUNTIME_STATE)).toBe(false);
  });
  it("does not write a countdown heartbeat or duplicate urgency escalation", () => {
    const later = new Date(at(1));
    expect(reconcileActionAlertHistory(initial(), buildActionAlerts([s], prefs, later), [s], [], later)).toEqual(initial());
    const early = { ...s, resetCreditExpiresAt: [at(16)] };
    const one = reconcileActionAlertHistory([], buildActionAlerts([early], prefs, now), [early], [], now);
    expect(reconcileActionAlertHistory(one, buildActionAlerts([early], prefs, later), [early], [], later)).toHaveLength(1);
  });
  it("records the deadline passing while offline, without claiming use or loss", () => {
    const history = reconcileActionAlertHistory(initial(), [], [], [], new Date(at(3)));
    expect(history[0]).toMatchObject({ status: "deadline-passed", closedAt: at(3) });
    expect(history[0].detail).not.toMatch(/redeemed|wasted|已使用|已浪费/);
  });
  it("requires a newer healthy observation before closing; failures and paused sources do not resolve", () => {
    const old = initial();
    for (const snapshots of [[], [s], [{ ...s, status: "stale" as const, updatedAt: at(1) }]])
      expect(reconcileActionAlertHistory(old, [], snapshots, [], new Date(at(1)))[0].status).toBe("active");
    const fresh = { ...s, resetCredits: 0, updatedAt: at(1) };
    expect(reconcileActionAlertHistory(old, [], [fresh], ["codex"], new Date(at(1)))[0].status).toBe("active");
    expect(reconcileActionAlertHistory(old, [], [fresh], [], new Date(at(1)))[0].status).toBe("no-longer-observed");
  });
  it("keeps fresh and stale representations as one record", () => {
    const stale = { ...s, status: "stale" as const };
    const history = reconcileActionAlertHistory(initial(), buildActionAlerts([stale], prefs, now), [stale], [], now);
    expect(history).toHaveLength(1);
    expect(history[0].kind).toBe("stale-expiry");
  });
  it("bounds and validates imported records and strips unknown fields", () => {
    const record = initial()[0];
    expect(normalizeActionAlertHistory([{ ...record, secret: "not retained" }, record, { ...record, key: "invalid" }])).toEqual([record]);
    const huge = Array.from({length: 140}, (_, i) => ({ ...record, key: `action:test:${i}` }));
    expect(normalizeActionAlertHistory(huge)).toHaveLength(128);
    expect(normalizeActionAlertHistory([{ ...record, status: "deadline-passed" }])).toEqual([]);
    expect(normalizeActionAlertHistory(null)).toEqual([]);
  });
});

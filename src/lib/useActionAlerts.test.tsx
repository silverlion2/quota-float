// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canDeliverActionAlert, snoozeActionAlert, useActionAlerts } from "./useActionAlerts";
import { buildActionAlerts } from "./actionAlerts";
import { EMPTY_RUNTIME_STATE, normalizeRuntimeState } from "./activity";
import { DEFAULT_WIDGET_PREFERENCES as defaults } from "./preferences";
import { sendDesktopNotification } from "./bridge";
import type { ProviderSnapshot, RuntimeState } from "../types";

vi.mock("./bridge", () => ({ usesSyntheticData: () => false, sendDesktopNotification: vi.fn(async () => true) }));
const now = new Date("2026-10-31T12:00:00Z");
const at = (minutes: number) => new Date(now.getTime() + minutes * 60_000).toISOString();
const snapshot: ProviderSnapshot = { provider: "codex", displayName: "Codex", plan: "PRO", status: "ok", updatedAt: now.toISOString(),
  shortWindow: null, weeklyWindow: null, resetCredits: 1, resetCreditExpiresAt: [at(45)], message: null };
const prefs = { ...defaults, quietHoursStart: 0, quietHoursEnd: 0 };
const alert = buildActionAlerts([snapshot], prefs, now)[0];
const state = () => structuredClone(EMPTY_RUNTIME_STATE);
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); vi.mocked(sendDesktopNotification).mockReset().mockResolvedValue(true); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("deadline delivery policy", () => {
  it("honors master, expiry switch and quiet hours; bypass is opt-in and expiry-only", () => {
    const quiet = { ...prefs, quietHoursStart: now.getHours(), quietHoursEnd: (now.getHours() + 1) % 24 };
    expect(canDeliverActionAlert(alert, quiet, state(), now)).toBe(false);
    expect(canDeliverActionAlert(alert, { ...quiet, urgentExpiryDuringQuietHours: true }, state(), now)).toBe(true);
    expect(canDeliverActionAlert({ ...alert, kind: "low-quota" }, { ...quiet, urgentExpiryDuringQuietHours: true }, state(), now)).toBe(false);
    expect(canDeliverActionAlert(alert, { ...prefs, notificationsEnabled: false }, state(), now)).toBe(false);
    expect(canDeliverActionAlert(alert, { ...prefs, notifyOnCreditExpiry: false }, state(), now)).toBe(false);
  });
  it("clamps snooze before deadline and persists it through runtime normalization", () => {
    const imminent = { ...alert, deadline: at(2) };
    const deferred = snoozeActionAlert(state(), imminent, now);
    expect(deferred.alertSnoozes?.[imminent.id]).toBe(at(1));
    expect(normalizeRuntimeState(deferred).alertSnoozes).toEqual(deferred.alertSnoozes);
    expect(canDeliverActionAlert(imminent, prefs, deferred, now)).toBe(false);
    expect(canDeliverActionAlert(imminent, prefs, deferred, new Date(at(1)))).toBe(true);
    expect(canDeliverActionAlert({ ...imminent, id: `${imminent.id}:escalated` }, prefs, deferred, now)).toBe(true);
  });
  it("preserves the configured regular cooldown but bypasses it on expiry escalation", () => {
    const delivered = { ...state(), lastNotifications: { [alert.id]: at(-30) } };
    expect(canDeliverActionAlert(alert, { ...prefs, notificationCooldownMinutes: 1440 }, delivered, now)).toBe(true);
    expect(canDeliverActionAlert({ ...alert, kind: "low-quota" }, { ...prefs, notificationCooldownMinutes: 1440 }, delivered, now)).toBe(false);
  });
});

describe("live reminder checking", () => {
  function setup(options = prefs, initialSnapshots = [snapshot]) {
    const runtime = { current: state() };
    const commit = vi.fn((next: RuntimeState) => { runtime.current = next; });
    const hook = renderHook(({ snapshots, preferences }) => useActionAlerts(snapshots, preferences, runtime, commit),
      { initialProps: { snapshots: initialSnapshots, preferences: options } });
    return { ...hook, runtime, commit };
  }
  it("sends on startup without previous snapshots and preserves concurrent state updates", async () => {
    let finish!: (result: boolean) => void;
    vi.mocked(sendDesktopNotification).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const app = setup();
    app.runtime.current = { ...app.runtime.current, lastNotifications: { unrelated: at(-1) } };
    await act(async () => { finish(true); });
    expect(app.runtime.current.lastNotifications).toMatchObject({ unrelated: at(-1), [alert.id]: now.toISOString() });
    expect(sendDesktopNotification).toHaveBeenCalledWith(alert.title, expect.any(String), false);
    await act(async () => { vi.advanceTimersByTime(30_000); });
    expect(sendDesktopNotification).toHaveBeenCalledTimes(1);
  });
  it.each(["denied", "native failure"])("does not mark %s delivery and retries; a visible action remains", async (failure) => {
    if (failure === "denied") vi.mocked(sendDesktopNotification).mockResolvedValueOnce(false);
    else vi.mocked(sendDesktopNotification).mockRejectedValueOnce(new Error("native submission failed"));
    const app = setup();
    await act(async () => {});
    expect(app.runtime.current.lastNotifications[alert.id]).toBeUndefined();
    expect(app.result.current.deliveryIssue).toBe(true);
    expect(app.result.current.alerts).toHaveLength(1);
    await act(async () => { vi.advanceTimersByTime(60_000); });
    expect(app.runtime.current.lastNotifications[alert.id]).toBeDefined();
    expect(app.result.current.deliveryIssue).toBe(false);
  });
  it("catches up when quiet hours end without a new snapshot", async () => {
    vi.setSystemTime(new Date(at(59)));
    const end = (now.getHours() + 1) % 24;
    setup({ ...prefs, quietHoursStart: now.getHours(), quietHoursEnd: end }, [{ ...snapshot, updatedAt: at(59), resetCreditExpiresAt: [at(90)] }]);
    await act(async () => {});
    expect(sendDesktopNotification).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(60_000); });
    expect(sendDesktopNotification).toHaveBeenCalledOnce();
  });
  it("escalates on the timer with unchanged snapshots despite the previous delivery cooldown", async () => {
    setup(prefs, [{ ...snapshot, resetCreditExpiresAt: [at(16)] }]);
    await act(async () => {});
    expect(sendDesktopNotification).toHaveBeenCalledOnce();
    await act(async () => { vi.advanceTimersByTime(30_000); });
    expect(sendDesktopNotification).toHaveBeenCalledOnce();
    await act(async () => { vi.advanceTimersByTime(30_000); });
    expect(sendDesktopNotification).toHaveBeenCalledTimes(2);
  });
  it("honors a requested short snooze before expiry even after the first notification was sent", async () => {
    const app = setup(prefs, [{ ...snapshot, resetCreditExpiresAt: [at(0.5)] }]);
    await act(async () => {});
    expect(sendDesktopNotification).toHaveBeenCalledOnce();
    act(() => app.result.current.snooze(app.result.current.alerts[0]));
    await act(async () => { vi.advanceTimersByTime(14_999); });
    expect(sendDesktopNotification).toHaveBeenCalledOnce();
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(sendDesktopNotification).toHaveBeenCalledTimes(2);
    await act(async () => { vi.advanceTimersByTime(15_000); });
    expect(app.result.current.alerts).toHaveLength(0);
    expect(sendDesktopNotification).toHaveBeenCalledTimes(2);
  });
  it("removes the action when fresh data shows the card was consumed, without claiming redemption", async () => {
    const app = setup();
    await act(async () => {});
    app.rerender({ snapshots: [{ ...snapshot, resetCredits: 0 }], preferences: prefs });
    expect(app.result.current.alerts).toEqual([]);
    expect(app.runtime.current.events.some((event) => event.title.includes("redeemed"))).toBe(false);
  });
});

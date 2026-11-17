// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canDeliverActionAlert, recordActionAlertDeliveries, snoozeActionAlert, useActionAlerts } from "./useActionAlerts";
import { buildActionAlerts } from "./actionAlerts";
import { buildAiHotActionAlerts, buildAiHotSignals } from "./aihotIntegration";
import type { AiHotReport } from "./aihot";
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

describe("public AIHOT reminder delivery", () => {
  const publicReport: AiHotReport = { checkedAt: now.toISOString(), sources: [{ provider: "codex", status: "healthy", updatedAt: now.toISOString(),
    sourceUrl: "https://aihot.news/codex-reset", error: null, events: [{ id: "synthetic-reset", title: "Reset credit", status: "confirmed",
      updatedAt: at(-5), reportedAt: at(-5), scope: null, url: "https://aihot.news/codex-reset" }] }] };
  const publicPrefs = { ...prefs, aihotEnabled: true, aihotNotificationsEnabled: true };
  const alertsAt = (date: Date) => buildAiHotActionAlerts(buildAiHotSignals(publicReport, { enabled: true, enabledProviders: ["codex"] }, date), "en");
  const publicAlert = alertsAt(now)[0];

  it("keeps public receipts when a personal batch fills its independent budget", () => {
    const previous = { legacy: at(-10), [publicAlert.id]: at(-10), ...Object.fromEntries(Array.from({ length: 256 }, (_, index) => [`action:personal-${index}`, at(-10)])) };
    const personalBatch = Array.from({ length: 300 }, (_, index) => ({ ...alert, id: `action:new-personal-${index}` }));
    const receipts = recordActionAlertDeliveries(previous, personalBatch, at(0));
    expect(receipts[publicAlert.id]).toBe(at(-10));
    expect(receipts.legacy).toBe(at(-10));
    expect(Object.keys(receipts).filter(key => key.startsWith("action:") && !key.startsWith("action:aihot:"))).toHaveLength(256);
    expect(canDeliverActionAlert(publicAlert, publicPrefs, { ...state(), lastNotifications: receipts }, now)).toBe(false);
  });

  it("bounds public receipts independently and preserves personal and legacy cooldowns", () => {
    const previous = { legacy: at(-10), [alert.id]: at(-10) };
    const publicBatch = Array.from({ length: 300 }, (_, index) => ({ ...publicAlert, id: `action:aihot:codex:synthetic-${index}:confirmed` }));
    const receipts = recordActionAlertDeliveries(previous, publicBatch, at(0));
    expect(Object.keys(receipts).filter(key => key.startsWith("action:aihot:"))).toHaveLength(256);
    expect(receipts[alert.id]).toBe(at(-10));
    expect(receipts.legacy).toBe(at(-10));
    expect(receipts[publicBatch.at(-1)!.id]).toBe(at(0));
    expect(normalizeRuntimeState({ ...state(), lastNotifications: receipts }).lastNotifications).toEqual(receipts);
  });

  it("requires separate opt-ins, confirmed status, unread/fresh state and enabled provider", () => {
    expect(canDeliverActionAlert(publicAlert, publicPrefs, state(), now)).toBe(true);
    for (const changed of [{ aihotEnabled: false }, { aihotNotificationsEnabled: false }, { notificationsEnabled: false },
      { pausedProviders: ["codex"] as const }, { hiddenProviders: ["codex"] as const }]) {
      expect(canDeliverActionAlert(publicAlert, { ...publicPrefs, ...changed } as typeof publicPrefs, state(), now)).toBe(false);
    }
    expect(canDeliverActionAlert({ ...publicAlert, publicStatus: "pending" }, publicPrefs, state(), now)).toBe(false);
    expect(canDeliverActionAlert(publicAlert, publicPrefs, { ...state(), aihotReadKeys: [publicAlert.publicReadKey!] }, now)).toBe(false);
    expect(canDeliverActionAlert(publicAlert, publicPrefs, state(), new Date(publicAlert.validUntil!))).toBe(false);
    const quiet = { ...publicPrefs, quietHoursStart: now.getHours(), quietHoursEnd: (now.getHours() + 1) % 24, urgentExpiryDuringQuietHours: true };
    expect(canDeliverActionAlert(publicAlert, quiet, state(), now)).toBe(false);
  });

  it("shows public reminders with desktop opt-in off and persists one receipt on repeated polls", async () => {
    const runtime = { current: state() };
    const commit = (next: RuntimeState) => { runtime.current = next; };
    const hook = renderHook(({ preferences }) => useActionAlerts([], preferences, runtime, commit, alertsAt), { initialProps: { preferences: { ...publicPrefs, aihotNotificationsEnabled: false } } });
    expect(hook.result.current.alerts).toHaveLength(1);
    await act(async () => {});
    expect(sendDesktopNotification).not.toHaveBeenCalled();
    hook.rerender({ preferences: publicPrefs });
    await act(async () => {});
    expect(sendDesktopNotification).toHaveBeenCalledOnce();
    expect(runtime.current.lastNotifications[publicAlert.id]).toBeDefined();
    await act(async () => { vi.advanceTimersByTime(60_000); });
    expect(sendDesktopNotification).toHaveBeenCalledOnce();
    expect(runtime.current.events[0].detail).toContain("not confirmation of your account");
  });

  it("revalidates the public callback immediately before submission", async () => {
    const runtime = { current: state() };
    const commit = (next: RuntimeState) => { runtime.current = next; };
    const getPublic = vi.fn().mockReturnValueOnce([publicAlert]).mockReturnValue([]);
    renderHook(() => useActionAlerts([], publicPrefs, runtime, commit, getPublic));
    await act(async () => {});
    expect(getPublic.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(sendDesktopNotification).not.toHaveBeenCalled();
    expect(runtime.current.lastNotifications[publicAlert.id]).toBeUndefined();
  });

  it("expires public freshness without interpreting a personal balance change", async () => {
    const runtime = { current: state() };
    const commit = (next: RuntimeState) => { runtime.current = next; };
    const getPublic = (date: Date) => date.getTime() < now.getTime() + 10_000 ? [{ ...publicAlert, validUntil: at(1 / 6) }] : [];
    const hook = renderHook(() => useActionAlerts([], { ...publicPrefs, aihotNotificationsEnabled: false }, runtime, commit, getPublic));
    expect(hook.result.current.alerts).toHaveLength(1);
    await act(async () => { vi.advanceTimersByTime(10_000); });
    expect(hook.result.current.alerts).toEqual([]);
    expect(runtime.current.actionAlertHistory?.[0].status).toBe("no-longer-observed");
    expect(runtime.current.events).toEqual([]);
  });
});

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
  it("submits simultaneous imminent resources in one batch before either expires", async () => {
    const codex = { ...snapshot, resetCreditExpiresAt: [at(0.25)] };
    const trae: ProviderSnapshot = { ...snapshot, provider: "trae", displayName: "TRAE", resetCredits: 0,
      balanceUnit: "credits", balanceRemaining: 20, balanceGrants: [{ remaining: 20, expiresAt: at(0.25) }] };
    const app = setup(prefs, [codex, trae]);
    await act(async () => {});
    expect(sendDesktopNotification).toHaveBeenCalledOnce();
    expect(vi.mocked(sendDesktopNotification).mock.calls[0][0]).toContain("2");
    expect(vi.mocked(sendDesktopNotification).mock.calls[0][1]).toContain("TRAE");
    expect(Object.keys(app.runtime.current.lastNotifications)).toHaveLength(2);
    await act(async () => { vi.advanceTimersByTime(15_000); });
    expect(app.runtime.current.actionAlertHistory?.every(item => item.status === "deadline-passed")).toBe(true);
  });
  it("delivers a new candidate after an in-flight submission without delaying it for the polling interval", async () => {
    let release!: (value: boolean) => void;
    vi.mocked(sendDesktopNotification).mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const app = setup();
    await act(async () => {});
    const second = { ...snapshot, provider: "claude" as const, displayName: "Claude", resetCreditExpiresAt: [at(0.25)] };
    app.rerender({ snapshots: [snapshot, second], preferences: prefs });
    await act(async () => { release(true); });
    expect(sendDesktopNotification).toHaveBeenCalledTimes(2);
    expect(Object.keys(app.runtime.current.lastNotifications)).toHaveLength(2);
  });
  it("does not record a failed batch as submitted and still records local observations", async () => {
    vi.mocked(sendDesktopNotification).mockResolvedValue(false);
    const app = setup(prefs, [snapshot, { ...snapshot, provider: "claude", displayName: "Claude" }]);
    await act(async () => {});
    expect(app.runtime.current.lastNotifications).toEqual({});
    expect(app.runtime.current.actionAlertHistory).toHaveLength(2);
    expect(app.result.current.deliveryIssue).toBe(true);
  });
  it("keeps history when desktop alerts are off and closes only on a newer successful read", async () => {
    const off = { ...prefs, notificationsEnabled: false };
    const app = setup(off);
    await act(async () => {});
    expect(app.runtime.current.actionAlertHistory).toHaveLength(1);
    vi.setSystemTime(new Date(at(1)));
    app.rerender({ snapshots: [{ ...snapshot, resetCredits: 0, updatedAt: at(1) }], preferences: off });
    expect(app.runtime.current.actionAlertHistory?.[0].status).toBe("no-longer-observed");
    expect(sendDesktopNotification).not.toHaveBeenCalled();
  });
  it("resumes an explicitly snoozed action immediately", async () => {
    const app = setup();
    await act(async () => {});
    act(() => app.result.current.snooze(app.result.current.alerts[0]));
    expect(sendDesktopNotification).toHaveBeenCalledOnce();
    await act(async () => app.result.current.resume(app.result.current.alerts[0]));
    expect(sendDesktopNotification).toHaveBeenCalledTimes(2);
  });
  it("makes the unused cycle reminder independently configurable and sends it only once", async () => {
    const cycle: ProviderSnapshot = { ...snapshot, resetCredits: 0, weeklyWindow: { remainingPercent: 70, windowSeconds: 604800, resetsAt: at(300) } };
    const off = { ...prefs, notifyOnUnusedQuota: false };
    const app = setup(off, [cycle]);
    await act(async () => {});
    expect(app.result.current.alerts[0].kind).toBe("quota-reset-unused");
    expect(sendDesktopNotification).not.toHaveBeenCalled();
    app.rerender({ snapshots: [cycle], preferences: { ...off, notifyOnUnusedQuota: true } });
    await act(async () => {});
    expect(sendDesktopNotification).toHaveBeenCalledOnce();
    await act(async () => { vi.advanceTimersByTime(60_000); });
    expect(sendDesktopNotification).toHaveBeenCalledOnce();
  });
});

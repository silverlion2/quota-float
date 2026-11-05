import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { ProviderSnapshot, RuntimeState, WidgetPreferences } from "../types";
import { actionAlertDue, actionAlertSnoozed, buildActionAlerts, type ActionAlert } from "./actionAlerts";
import { isQuietHour } from "./activity";
import { sendDesktopNotification, usesSyntheticData } from "./bridge";
import { deliverNotificationOnce } from "./notificationDelivery";
import { reconcileActionAlertHistory } from "./actionAlertLifecycle";

export function canDeliverActionAlert(alert: ActionAlert, preferences: WidgetPreferences, state: RuntimeState, now: Date): boolean {
  const expiry = alert.kind === "reset-expiry" || alert.kind === "credit-expiry" || alert.kind === "stale-expiry";
  if (!preferences.notificationsEnabled || (expiry && preferences.notifyOnCreditExpiry === false)) return false;
  if (alert.kind === "quota-reset-unused" && preferences.notifyOnUnusedQuota === false) return false;
  if (isQuietHour(now.getHours(), preferences.quietHoursStart, preferences.quietHoursEnd)
    && !(expiry && alert.severity === "critical" && preferences.urgentExpiryDuringQuietHours)) return false;
  if (actionAlertSnoozed(alert, state.alertSnoozes, now)) return false;
  const resumeAt = Date.parse(state.alertSnoozes?.[alert.id] ?? "");
  const lastSent = Date.parse(state.lastNotifications[alert.id] ?? "");
  // A user-requested reminder is due when the snooze ends, even if the
  // ordinary repeat cooldown is longer. A later receipt consumes this wake-up.
  if (Number.isFinite(resumeAt) && resumeAt <= now.getTime() && (!Number.isFinite(lastSent) || lastSent < resumeAt)) return true;
  return actionAlertDue(expiry ? alert : { ...alert, repeatMinutes: Math.max(alert.repeatMinutes, preferences.notificationCooldownMinutes) }, state.lastNotifications, now);
}

export function snoozeActionAlert(state: RuntimeState, alert: ActionAlert, now: Date): RuntimeState {
  // Always leave another chance before the deadline; escalation has a different id.
  const left = alert.deadline ? Date.parse(alert.deadline) - now.getTime() : Infinity;
  if (left <= 0) return state;
  const until = new Date(now.getTime() + Math.min(15 * 60_000, left / 2)).toISOString();
  const retained = Object.entries(state.alertSnoozes ?? {}).filter(([, value]) => Date.parse(value) > now.getTime()).slice(-255);
  return { ...state, alertSnoozes: { ...Object.fromEntries(retained), [alert.id]: until } };
}

export function useActionAlerts(
  snapshots: ProviderSnapshot[], preferences: WidgetPreferences,
  runtime: RefObject<RuntimeState>, commit: (next: RuntimeState) => void,
) {
  const [now, setNow] = useState(() => new Date());
  const [deliveryIssue, setDeliveryIssue] = useState(false);
  const current = useRef({ snapshots, preferences });
  current.current = { snapshots, preferences };
  const attempts = useRef(new Map<string, number>());
  const delivering = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const alerts = useMemo(() => buildActionAlerts(snapshots, preferences, now), [snapshots, preferences, now]);
  useEffect(() => {
    const previous = runtime.current.actionAlertHistory ?? [];
    const history = reconcileActionAlertHistory(previous, alerts, snapshots, preferences.pausedProviders, now);
    if (JSON.stringify(previous) !== JSON.stringify(history)) commit({ ...runtime.current, actionAlertHistory: history });
  }, [alerts, snapshots, preferences.pausedProviders, now, runtime, commit]);
  useEffect(() => {
    const tick = () => setNow(new Date());
    const wall = Date.now();
    let delay = 30_000;
    for (const item of alerts) {
      const deadline = Date.parse(item.deadline ?? "");
      for (const when of [Date.parse(runtime.current.alertSnoozes?.[item.id] ?? ""), deadline,
        ...[15, 60, 360, 1440].map((minutes) => deadline - minutes * 60_000)]) {
        if (when > wall) delay = Math.min(delay, when - wall);
      }
    }
    const timer = window.setTimeout(tick, delay);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => { window.clearTimeout(timer); window.removeEventListener("focus", tick); document.removeEventListener("visibilitychange", tick); };
  }, [alerts, runtime]);
  useEffect(() => {
    if (usesSyntheticData() || delivering.current) return;
    const checkedAt = new Date();
    const due = alerts.filter((item) => {
      const lastAttempt = attempts.current.get(item.id);
      return canDeliverActionAlert(item, preferences, runtime.current, checkedAt)
        && (lastAttempt === undefined || checkedAt.getTime() < lastAttempt || checkedAt.getTime() - lastAttempt >= 60_000);
    });
    if (!due.length) return;
    for (const alert of due) attempts.current.set(alert.id, checkedAt.getTime());
    while (attempts.current.size > 256) attempts.current.delete(attempts.current.keys().next().value!);
    let cancelled = false;
    let submitted: ActionAlert[] = [];
    delivering.current = true;
    void deliverNotificationOnce("action:delivery-batch",
      () => !due.some(alert => canDeliverActionAlert(alert, current.current.preferences, runtime.current, new Date())),
      () => {
        for (const alert of submitted) attempts.current.delete(alert.id);
        const deliveredAt = new Date().toISOString();
        const state = runtime.current;
        // Keep legacy cooldowns, bound only this feature's delivery receipts.
        const legacy = Object.entries(state.lastNotifications).filter(([key]) => !key.startsWith("action:"));
        const sentIds = new Set(submitted.map(alert => alert.id));
        const receipts = Object.entries(state.lastNotifications).filter(([key]) => key.startsWith("action:") && !sentIds.has(key));
        const nextReceipts = [...receipts, ...submitted.map(alert => [alert.id, deliveredAt])].slice(-256);
        const events = submitted.map(alert => ({ id: `${alert.id}:sent`, provider: alert.provider, kind: "warning" as const,
          occurredAt: deliveredAt, title: alert.title, detail: alert.detail }));
        const eventIds = new Set(events.map(event => event.id));
        commit({ ...state,
          lastNotifications: Object.fromEntries([...legacy, ...nextReceipts]),
          events: [...events, ...state.events.filter(item => !eventIds.has(item.id))].slice(0, 200),
        });
        if (!cancelled) setDeliveryIssue(false);
      },
      async () => {
        const at = new Date();
        const candidates = new Set(due.map(item => item.id));
        submitted = buildActionAlerts(current.current.snapshots, current.current.preferences, at)
          .filter(item => candidates.has(item.id) && canDeliverActionAlert(item, current.current.preferences, runtime.current, at));
        if (!submitted.length) return false;
        const en = current.current.preferences.language === "en";
        const title = submitted.length === 1 ? submitted[0].title : (en ? `${submitted.length} reminders · ${submitted[0].title}` : `${submitted.length} 项待办 · ${submitted[0].title}`);
        const detail = submitted.length === 1 ? submitted[0].detail : submitted.slice(0, 3).map(item => item.title).join("\n")
          + (submitted.length > 3 ? (en ? `\n+${submitted.length - 3} more in the queue.` : `\n另有 ${submitted.length - 3} 项，展开查看全部。`) : "");
        const sent = await sendDesktopNotification(title, `${detail} ${en ? "Open Quota Float for actions." : "打开 Quota Float 查看待办并操作。"}`, false).catch(() => false);
        if (!sent && !cancelled) setDeliveryIssue(true);
        return sent;
      }).finally(() => {
        delivering.current = false;
        if (mounted.current) setNow(new Date());
      });
    return () => { cancelled = true; };
  }, [alerts, preferences, runtime, commit]);
  const snooze = useCallback((alert: ActionAlert) => {
    commit(snoozeActionAlert(runtime.current, alert, new Date()));
    setNow(new Date());
  }, [commit, runtime]);
  const resume = useCallback((alert: ActionAlert) => {
    // An explicit resume acts like a completed snooze, without changing other alert receipts.
    const at = new Date();
    const state = runtime.current;
    const receipts = { ...state.lastNotifications };
    delete receipts[alert.id];
    attempts.current.delete(alert.id);
    commit({ ...state, lastNotifications: receipts, alertSnoozes: { ...state.alertSnoozes, [alert.id]: at.toISOString() } });
    setNow(at);
  }, [commit, runtime]);
  return { alerts, now, snooze, resume, deliveryIssue: deliveryIssue && preferences.notificationsEnabled && alerts.length > 0 };
}

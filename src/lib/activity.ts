import type { ActivityEvent, DailyPaceBaseline, Language, ProviderId, ProviderSnapshot, QuotaHistoryPoint, ResetForecast, RuntimeState } from "../types";
import type { RecentCodexReset } from "./resetDetection";
import { DEFAULT_PROVIDER_ORDER, normalizeProviderOrder } from "./providers";
import { calculateQuotaPace, mostOverPaceWindow, paceBaselineKey, refreshDailyPaceBaselines, trackedQuotaWindows, type NamedQuotaWindow, type QuotaPace } from "./quotaPace";

export const EMPTY_RUNTIME_STATE: RuntimeState = {
  schemaVersion: 1,
  history: [],
  events: [],
  savedLayouts: [],
  lastNotifications: {},
  dailyPaceBaselines: {},
};

const providerSet = new Set<ProviderId>(DEFAULT_PROVIDER_ORDER);
const statusSet = new Set(["ok", "stale", "loading", "unavailable", "signed_out"]);
const metricKindSet = new Set(["percent", "balance", "unlimited", "none"]);
const eventKindSet = new Set(["quota", "reset", "warning", "recovered", "update"]);

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function validProvider(value: unknown): value is ProviderId {
  return providerSet.has(value as ProviderId);
}

function providerList(value: unknown): ProviderId[] {
  return Array.isArray(value) ? [...new Set(value.filter(validProvider))] : [];
}

function historyPoint(value: unknown): QuotaHistoryPoint | null {
  const candidate = record(value);
  if (!candidate || !validProvider(candidate.provider) || !validDate(candidate.capturedAt)
    || !statusSet.has(String(candidate.status)) || !metricKindSet.has(String(candidate.metricKind))) return null;
  const metric = candidate.metric === null || candidate.metric === undefined
    ? null
    : typeof candidate.metric === "number" && Number.isFinite(candidate.metric) ? candidate.metric : undefined;
  if (metric === undefined) return null;
  const resetsAt = candidate.resetsAt === null || candidate.resetsAt === undefined ? null : validDate(candidate.resetsAt) ? candidate.resetsAt : undefined;
  if (resetsAt === undefined) return null;
  return { provider: candidate.provider, capturedAt: candidate.capturedAt, metric, metricKind: candidate.metricKind as QuotaHistoryPoint["metricKind"], status: candidate.status as QuotaHistoryPoint["status"], resetsAt };
}

function activityEvent(value: unknown): ActivityEvent | null {
  const candidate = record(value);
  if (!candidate || typeof candidate.id !== "string" || candidate.id.length === 0 || candidate.id.length > 160
    || (candidate.provider !== null && !validProvider(candidate.provider)) || !eventKindSet.has(String(candidate.kind))
    || !validDate(candidate.occurredAt) || typeof candidate.title !== "string" || typeof candidate.detail !== "string") return null;
  return {
    id: candidate.id,
    provider: candidate.provider as ProviderId | null,
    kind: candidate.kind as ActivityEvent["kind"],
    occurredAt: candidate.occurredAt,
    title: candidate.title.slice(0, 200),
    detail: candidate.detail.slice(0, 500),
  };
}

function savedLayout(value: unknown): RuntimeState["savedLayouts"][number] | null {
  const candidate = record(value);
  if (!candidate || typeof candidate.id !== "string" || candidate.id.length === 0 || candidate.id.length > 160
    || typeof candidate.name !== "string" || candidate.name.trim().length === 0 || !validDate(candidate.createdAt)) return null;
  const layoutMode = candidate.layoutMode === "compact" || candidate.layoutMode === "detailed" ? candidate.layoutMode : candidate.layoutMode === "standard" ? "standard" : null;
  const accentColor = typeof candidate.accentColor === "string" && /^#[0-9a-f]{6}$/i.test(candidate.accentColor) ? candidate.accentColor : null;
  if (!layoutMode || !accentColor) return null;
  return {
    id: candidate.id,
    name: candidate.name.trim().slice(0, 80),
    createdAt: candidate.createdAt,
    providerOrder: normalizeProviderOrder(Array.isArray(candidate.providerOrder) ? candidate.providerOrder as ProviderId[] : []),
    hiddenProviders: providerList(candidate.hiddenProviders),
    collapsedProviders: providerList(candidate.collapsedProviders),
    layoutMode,
    accentColor,
  };
}

function dailyPaceBaseline(value: unknown): DailyPaceBaseline | null {
  const candidate = record(value);
  const period = candidate?.period;
  if (!candidate || !validProvider(candidate.provider) || !["5h", "weekly", "monthly"].includes(String(period))
    || typeof candidate.localDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(candidate.localDate)
    || !validDate(candidate.capturedAt) || !validDate(candidate.resetsAt)
    || typeof candidate.remainingPercent !== "number" || !Number.isFinite(candidate.remainingPercent)) return null;
  const periodSeconds = period === "5h" ? 18_000 : period === "weekly" ? 604_800 : 2_592_000;
  const inferredCycleStartedAt = new Date(Date.parse(candidate.resetsAt) - periodSeconds * 1000).toISOString();
  return {
    provider: candidate.provider,
    period: period as DailyPaceBaseline["period"],
    localDate: candidate.localDate,
    capturedAt: candidate.capturedAt,
    remainingPercent: Math.min(100, Math.max(0, candidate.remainingPercent)),
    resetsAt: candidate.resetsAt,
    cycleStartedAt: validDate(candidate.cycleStartedAt) ? candidate.cycleStartedAt : inferredCycleStartedAt,
    cycleStartRemainingPercent: typeof candidate.cycleStartRemainingPercent === "number" && Number.isFinite(candidate.cycleStartRemainingPercent)
      ? Math.min(100, Math.max(0, candidate.cycleStartRemainingPercent))
      : 100,
    planningResetsAt: validDate(candidate.planningResetsAt) ? candidate.planningResetsAt : candidate.resetsAt,
    resetForecastScore: typeof candidate.resetForecastScore === "number" && Number.isFinite(candidate.resetForecastScore)
      ? Math.min(100, Math.max(0, candidate.resetForecastScore))
      : null,
    resetForecastWindowHours: typeof candidate.resetForecastWindowHours === "number" && Number.isFinite(candidate.resetForecastWindowHours)
      ? Math.max(0, candidate.resetForecastWindowHours)
      : null,
  };
}

export function normalizeRuntimeState(value: unknown): RuntimeState {
  if (!value || typeof value !== "object") return structuredClone(EMPTY_RUNTIME_STATE);
  const candidate = value as Partial<RuntimeState>;
  const lastNotifications: Record<string, string> = {};
  for (const [key, timestamp] of Object.entries(record(candidate.lastNotifications) ?? {})) {
    if (key.length > 0 && key.length <= 160 && validDate(timestamp)) lastNotifications[key] = timestamp;
  }
  const dailyPaceBaselines: Record<string, DailyPaceBaseline> = {};
  for (const [key, value] of Object.entries(record(candidate.dailyPaceBaselines) ?? {})) {
    const baseline = dailyPaceBaseline(value);
    if (baseline && key === paceBaselineKey(baseline.provider, baseline.period)) dailyPaceBaselines[key] = baseline;
  }
  return {
    schemaVersion: 1,
    history: Array.isArray(candidate.history) ? candidate.history.map(historyPoint).filter((item): item is QuotaHistoryPoint => item !== null).slice(-1000) : [],
    events: Array.isArray(candidate.events) ? candidate.events.map(activityEvent).filter((item): item is ActivityEvent => item !== null).slice(0, 200) : [],
    savedLayouts: Array.isArray(candidate.savedLayouts) ? candidate.savedLayouts.map(savedLayout).filter((item): item is RuntimeState["savedLayouts"][number] => item !== null).slice(0, 12) : [],
    lastNotifications,
    dailyPaceBaselines,
  };
}

function metric(snapshot: ProviderSnapshot): Pick<QuotaHistoryPoint, "metric" | "metricKind" | "resetsAt"> {
  if (snapshot.balanceUnit === "unlimited") return { metric: null, metricKind: "unlimited", resetsAt: null };
  if (snapshot.weeklyWindow) return { metric: snapshot.weeklyWindow.remainingPercent, metricKind: "percent", resetsAt: snapshot.weeklyWindow.resetsAt };
  if (snapshot.balanceRemaining !== null && snapshot.balanceRemaining !== undefined) return { metric: snapshot.balanceRemaining, metricKind: "balance", resetsAt: null };
  return { metric: null, metricKind: "none", resetsAt: null };
}

function event(kind: ActivityEvent["kind"], provider: ProviderId | null, occurredAt: string, title: string, detail: string): ActivityEvent {
  return { id: `${occurredAt}-${kind}-${provider ?? "app"}`, provider, kind, occurredAt, title, detail };
}

export interface RuntimeUpdate {
  state: RuntimeState;
  createdEvents: ActivityEvent[];
  notificationCandidates: Array<{ key: string; event: ActivityEvent }>;
}

function pacePeriodLabel(period: NamedQuotaWindow["period"], language: Language): string {
  if (language === "zh-CN") return period === "5h" ? "5 小时" : period === "weekly" ? "周度" : "月度";
  return period === "5h" ? "5-hour" : period;
}

function paceReminderEvent(
  snapshot: ProviderSnapshot,
  period: NamedQuotaWindow["period"],
  pace: QuotaPace,
  occurredAt: string,
  language: Language,
): ActivityEvent {
  const periodLabel = pacePeriodLabel(period, language);
  const todayRemaining = pace.todayRemainingPercent ?? 0;
  const depleted = todayRemaining <= 0.05;
  if (language === "zh-CN") {
    return event(
      "warning",
      snapshot.provider,
      occurredAt,
      depleted ? `${snapshot.displayName} 今日计划额度已用完` : `${snapshot.displayName} 用量进度偏快`,
      depleted
        ? `${periodLabel}额度已超出当前计划 ${pace.overByPercent.toFixed(1)}%；今日计划还可用 0%，建议暂停使用，等待计划进度追上。`
        : `${periodLabel}额度已超出当前计划 ${pace.overByPercent.toFixed(1)}%；今日计划还可用 ${todayRemaining.toFixed(1)}%。`,
    );
  }
  return event(
    "warning",
    snapshot.provider,
    occurredAt,
    depleted ? `${snapshot.displayName} today's pace budget is used up` : `${snapshot.displayName} usage is over pace`,
    depleted
      ? `${periodLabel} usage is ${pace.overByPercent.toFixed(1)}% ahead of plan; 0% remains in today's plan. Pause usage until the plan catches up.`
      : `${periodLabel} usage is ${pace.overByPercent.toFixed(1)}% ahead of plan; ${todayRemaining.toFixed(1)}% remains in today's plan.`,
  );
}

export function recordSnapshotActivity(
  current: RuntimeState,
  previousSnapshots: ProviderSnapshot[],
  nextSnapshots: ProviderSnapshot[],
  recentReset: RecentCodexReset | null,
  alertThreshold: number,
  now = new Date(),
  language: Language = "en",
  notificationCooldownMinutes = 120,
  resetForecast: ResetForecast | null = null,
): RuntimeUpdate {
  const occurredAt = now.toISOString();
  const isNewReset = recentReset !== null
    && !current.events.some((item) => item.kind === "reset" && item.occurredAt === recentReset.resetAt);
  const resetProviders = isNewReset ? new Set<string>(["codex"]) : new Set<string>();
  const dailyPaceBaselines = refreshDailyPaceBaselines(current.dailyPaceBaselines, nextSnapshots, now, resetProviders, resetForecast);
  const lastNotifications = isNewReset
    ? Object.fromEntries(Object.entries(current.lastNotifications).filter(([key]) => !key.split(":").includes("codex")))
    : current.lastNotifications;
  const previousByProvider = new Map(previousSnapshots.map((snapshot) => [snapshot.provider, snapshot]));
  const latestHistory = new Map<ProviderId, QuotaHistoryPoint>();
  for (let index = current.history.length - 1; index >= 0; index -= 1) {
    const point = current.history[index];
    if (!latestHistory.has(point.provider)) latestHistory.set(point.provider, point);
  }

  const additions: QuotaHistoryPoint[] = [];
  const createdEvents: ActivityEvent[] = [];
  const notificationKeyOverrides = new Map<ActivityEvent, string>();
  const repeatedNotifications: Array<{ key: string; event: ActivityEvent }> = [];
  for (const snapshot of nextSnapshots) {
    const value = metric(snapshot);
    const point: QuotaHistoryPoint = { provider: snapshot.provider, capturedAt: occurredAt, status: snapshot.status, ...value };
    const latest = latestHistory.get(snapshot.provider);
    const unchanged = latest
      && latest.metric === point.metric
      && latest.metricKind === point.metricKind
      && latest.status === point.status
      && latest.resetsAt === point.resetsAt;
    const recentEnough = latest && now.getTime() - new Date(latest.capturedAt).getTime() < 30 * 60_000;
    if (!unchanged || !recentEnough) additions.push(point);

    const previous = previousByProvider.get(snapshot.provider);
    if (!previous) continue;
    if (previous.status !== "ok" && snapshot.status === "ok") {
      createdEvents.push(event("recovered", snapshot.provider, occurredAt, `${snapshot.displayName} recovered`, "Quota data is available again."));
    } else if (previous.status === "ok" && snapshot.status !== "ok") {
      createdEvents.push(event("warning", snapshot.provider, occurredAt, `${snapshot.displayName} needs attention`, `Provider status changed to ${snapshot.status}; automatic retry is active.`));
    }
    const quotaWindows = trackedQuotaWindows(snapshot);
    if (quotaWindows.length > 0) {
      const previousWindows = new Map(trackedQuotaWindows(previous).map((item) => [item.period, item.window]));
      for (const item of quotaWindows) {
        const previousWindow = previousWindows.get(item.period);
        if (previousWindow && previousWindow.remainingPercent > alertThreshold && item.window.remainingPercent <= alertThreshold) {
          const period = language === "zh-CN"
            ? item.period === "5h" ? "5 小时" : item.period === "weekly" ? "周度" : "月度"
            : item.period === "5h" ? "5-hour" : item.period;
          createdEvents.push(event(
            "quota",
            snapshot.provider,
            occurredAt,
            language === "zh-CN" ? `${snapshot.displayName} 额度偏低` : `${snapshot.displayName} quota is low`,
            language === "zh-CN" ? `${period}额度剩余 ${Math.round(item.window.remainingPercent)}%。` : `${Math.round(item.window.remainingPercent)}% ${period} quota remains.`,
          ));
        }
      }
      const nextPace = mostOverPaceWindow(snapshot, now, dailyPaceBaselines);
      if (nextPace) {
        const previousWindow = trackedQuotaWindows(previous).find((item) => item.period === nextPace.period);
        const baseline = dailyPaceBaselines[paceBaselineKey(snapshot.provider, nextPace.period)] ?? null;
        const previousPace = previousWindow ? calculateQuotaPace(previousWindow.window, now, baseline) : null;
        const wasOverPace = previousPace?.status === "over_pace";
        const isDepleted = (nextPace.pace.todayRemainingPercent ?? 0) <= 0.05;
        const wasDepleted = wasOverPace && (previousPace?.todayRemainingPercent ?? 0) <= 0.05;
        const key = `pace${isDepleted ? "-zero" : ""}:${snapshot.provider}:${nextPace.period}`;
        const reminder = paceReminderEvent(snapshot, nextPace.period, nextPace.pace, occurredAt, language);
        if (!wasOverPace || (isDepleted && !wasDepleted)) {
          createdEvents.push(reminder);
          notificationKeyOverrides.set(reminder, key);
        } else if (canSendNotification(current, key, notificationCooldownMinutes, now)) {
          repeatedNotifications.push({ key, event: reminder });
        }
      }
    }
  }
  if (recentReset && isNewReset) {
    createdEvents.push(event("reset", "codex", recentReset.resetAt, "Codex quota reset", `Detected from ${recentReset.source} data.`));
  }

  const notificationCandidates = createdEvents.map((item) => ({
    key: notificationKeyOverrides.get(item) ?? `${item.kind}:${item.provider ?? "app"}`,
    event: item,
  }));

  return {
    state: {
      ...current,
      history: [...current.history, ...additions].slice(-1000),
      events: [...createdEvents, ...current.events].slice(0, 200),
      lastNotifications,
      dailyPaceBaselines,
    },
    createdEvents,
    notificationCandidates: [...notificationCandidates, ...repeatedNotifications],
  };
}

export function isQuietHour(hour: number, start: number, end: number): boolean {
  if (start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

export function canSendNotification(state: RuntimeState, key: string, cooldownMinutes: number, now = new Date()): boolean {
  const previous = state.lastNotifications[key];
  return !previous || now.getTime() - new Date(previous).getTime() >= cooldownMinutes * 60_000;
}

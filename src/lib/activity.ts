import type { ActivityEvent, Language, ProviderId, ProviderSnapshot, QuotaHistoryPoint, RuntimeState } from "../types";
import type { RecentCodexReset } from "./resetDetection";
import { DEFAULT_PROVIDER_ORDER, normalizeProviderOrder } from "./providers";
import { mostOverPaceWindow, trackedQuotaWindows } from "./quotaPace";

export const EMPTY_RUNTIME_STATE: RuntimeState = {
  schemaVersion: 1,
  history: [],
  events: [],
  savedLayouts: [],
  lastNotifications: {},
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

export function normalizeRuntimeState(value: unknown): RuntimeState {
  if (!value || typeof value !== "object") return structuredClone(EMPTY_RUNTIME_STATE);
  const candidate = value as Partial<RuntimeState>;
  const lastNotifications: Record<string, string> = {};
  for (const [key, timestamp] of Object.entries(record(candidate.lastNotifications) ?? {})) {
    if (key.length > 0 && key.length <= 160 && validDate(timestamp)) lastNotifications[key] = timestamp;
  }
  return {
    schemaVersion: 1,
    history: Array.isArray(candidate.history) ? candidate.history.map(historyPoint).filter((item): item is QuotaHistoryPoint => item !== null).slice(-1000) : [],
    events: Array.isArray(candidate.events) ? candidate.events.map(activityEvent).filter((item): item is ActivityEvent => item !== null).slice(0, 200) : [],
    savedLayouts: Array.isArray(candidate.savedLayouts) ? candidate.savedLayouts.map(savedLayout).filter((item): item is RuntimeState["savedLayouts"][number] => item !== null).slice(0, 12) : [],
    lastNotifications,
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
}

export function recordSnapshotActivity(
  current: RuntimeState,
  previousSnapshots: ProviderSnapshot[],
  nextSnapshots: ProviderSnapshot[],
  recentReset: RecentCodexReset | null,
  alertThreshold: number,
  now = new Date(),
  language: Language = "en",
): RuntimeUpdate {
  const occurredAt = now.toISOString();
  const previousByProvider = new Map(previousSnapshots.map((snapshot) => [snapshot.provider, snapshot]));
  const latestHistory = new Map<ProviderId, QuotaHistoryPoint>();
  for (let index = current.history.length - 1; index >= 0; index -= 1) {
    const point = current.history[index];
    if (!latestHistory.has(point.provider)) latestHistory.set(point.provider, point);
  }

  const additions: QuotaHistoryPoint[] = [];
  const createdEvents: ActivityEvent[] = [];
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
      const nextPace = mostOverPaceWindow(snapshot, now);
      const previousPace = mostOverPaceWindow(previous, now);
      if (nextPace && !previousPace) {
        const period = language === "zh-CN"
          ? nextPace.period === "5h" ? "5 小时" : nextPace.period === "weekly" ? "周度" : "月度"
          : nextPace.period === "5h" ? "5-hour" : nextPace.period;
        createdEvents.push(event(
          "warning",
          snapshot.provider,
          occurredAt,
          language === "zh-CN" ? `${snapshot.displayName} 用量进度偏快` : `${snapshot.displayName} usage is over pace`,
          language === "zh-CN"
            ? `${period}用量超出平均周期建议 ${nextPace.pace.overByPercent.toFixed(1)}%。`
            : `${period} usage is ${nextPace.pace.overByPercent.toFixed(1)}% ahead of the even-cycle recommendation.`,
        ));
      }
    }
  }
  if (recentReset && !current.events.some((item) => item.kind === "reset" && item.occurredAt === recentReset.resetAt)) {
    createdEvents.push(event("reset", "codex", recentReset.resetAt, "Codex quota reset", `Detected from ${recentReset.source} data.`));
  }

  return {
    state: {
      ...current,
      history: [...current.history, ...additions].slice(-1000),
      events: [...createdEvents, ...current.events].slice(0, 200),
    },
    createdEvents,
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

import type { DailyPaceBaseline, ProviderSnapshot, UsageWindow } from "../types";

export type QuotaPeriod = "5h" | "weekly" | "monthly";
export type QuotaPaceStatus = "on_track" | "over_pace" | "unknown";
export type QuotaPaceUnit = "hour" | "day";

export interface NamedQuotaWindow {
  period: QuotaPeriod;
  window: UsageWindow;
}

export interface QuotaPace {
  status: QuotaPaceStatus;
  usedPercent: number;
  recommendedUsedPercent: number | null;
  todayRemainingPercent: number | null;
  overByPercent: number;
  averageRate: number;
  unit: QuotaPaceUnit;
}

const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;
const SCHEDULE_TOLERANCE_PERCENT = 0.5;
const CLOCK_TOLERANCE_MS = 2 * 60_000;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function endOfLocalDay(now: Date): number {
  const end = new Date(now);
  end.setHours(24, 0, 0, 0);
  return end.getTime();
}

export function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function paceBaselineKey(provider: ProviderSnapshot["provider"], period: QuotaPeriod): string {
  return `${provider}:${period}`;
}

export function refreshDailyPaceBaselines(
  current: Record<string, DailyPaceBaseline>,
  snapshots: ProviderSnapshot[],
  now = new Date(),
  resetProviders: ReadonlySet<string> = new Set(),
): Record<string, DailyPaceBaseline> {
  const next: Record<string, DailyPaceBaseline> = {};
  const localDate = localDateKey(now);
  for (const snapshot of snapshots) {
    for (const { period, window } of trackedQuotaWindows(snapshot)) {
      if (!window.resetsAt || !Number.isFinite(Date.parse(window.resetsAt))) continue;
      const key = paceBaselineKey(snapshot.provider, period);
      const existing = current[key];
      const quotaRestored = existing && window.remainingPercent > existing.remainingPercent + SCHEDULE_TOLERANCE_PERCENT;
      const canReuse = existing
        && !resetProviders.has(snapshot.provider)
        && !quotaRestored
        && existing.localDate === localDate
        && existing.resetsAt === window.resetsAt;
      next[key] = canReuse ? existing : {
        provider: snapshot.provider,
        period,
        localDate,
        capturedAt: now.toISOString(),
        remainingPercent: clamp(window.remainingPercent, 0, 100),
        resetsAt: window.resetsAt,
      };
    }
  }
  return next;
}

export function providerQuotaWindows(snapshot: ProviderSnapshot): NamedQuotaWindow[] {
  const windows: NamedQuotaWindow[] = [];
  if (snapshot.shortWindow) windows.push({ period: "5h", window: snapshot.shortWindow });
  if (snapshot.weeklyWindow) windows.push({ period: "weekly", window: snapshot.weeklyWindow });
  if (snapshot.monthlyWindow) windows.push({ period: "monthly", window: snapshot.monthlyWindow });
  return windows;
}

export function trackedQuotaWindows(snapshot: ProviderSnapshot): NamedQuotaWindow[] {
  const windows = providerQuotaWindows(snapshot);
  return snapshot.provider === "codex"
    ? windows.filter((item) => item.period === "weekly")
    : windows;
}

export function calculateQuotaPace(window: UsageWindow, now = new Date(), baseline: DailyPaceBaseline | null = null): QuotaPace {
  const durationMs = Math.max(1, window.windowSeconds * 1000);
  const unit: QuotaPaceUnit = durationMs <= DAY_MS ? "hour" : "day";
  const unitMs = unit === "hour" ? HOUR_MS : DAY_MS;
  const usedPercent = 100 - clamp(window.remainingPercent, 0, 100);
  const baselineRate = 100 / (durationMs / unitMs);
  const resetAt = window.resetsAt ? Date.parse(window.resetsAt) : Number.NaN;

  if (!Number.isFinite(resetAt)) {
    return {
      status: usedPercent <= SCHEDULE_TOLERANCE_PERCENT ? "on_track" : "unknown",
      usedPercent,
      recommendedUsedPercent: null,
      todayRemainingPercent: null,
      overByPercent: 0,
      averageRate: baselineRate,
      unit,
    };
  }

  const startsAt = resetAt - durationMs;
  const nowMs = now.getTime();
  if (nowMs < startsAt - CLOCK_TOLERANCE_MS || nowMs > resetAt + CLOCK_TOLERANCE_MS) {
    return { status: "unknown", usedPercent, recommendedUsedPercent: null, todayRemainingPercent: null, overByPercent: 0, averageRate: baselineRate, unit };
  }

  const recommendedUsedPercent = clamp(((nowMs - startsAt) / durationMs) * 100, 0, 100);
  const remainingPercent = clamp(window.remainingPercent, 0, 100);
  const baselineAt = baseline && baseline.localDate === localDateKey(now) && baseline.resetsAt === window.resetsAt
    ? Date.parse(baseline.capturedAt)
    : nowMs;
  const baselineRemaining = baselineAt <= nowMs && Number.isFinite(baselineAt)
    ? clamp(baseline?.remainingPercent ?? remainingPercent, 0, 100)
    : remainingPercent;
  const baselineRemainingMs = Math.max(0, resetAt - baselineAt);
  const planningHorizon = Math.min(resetAt, endOfLocalDay(new Date(baselineAt)));
  const horizonMs = Math.max(0, planningHorizon - baselineAt);
  const dailyBudget = baselineRemainingMs > 0
    ? clamp(baselineRemaining * (horizonMs / baselineRemainingMs), 0, baselineRemaining)
    : 0;
  const consumedToday = Math.max(0, baselineRemaining - remainingPercent);
  const averageRate = baselineRemainingMs > 0 ? baselineRemaining / (baselineRemainingMs / unitMs) : 0;
  const todayRemainingPercent = clamp(dailyBudget - consumedToday, 0, remainingPercent);
  const overByPercent = Math.max(0, usedPercent - recommendedUsedPercent);
  return {
    status: overByPercent <= SCHEDULE_TOLERANCE_PERCENT ? "on_track" : "over_pace",
    usedPercent,
    recommendedUsedPercent,
    todayRemainingPercent,
    overByPercent,
    averageRate,
    unit,
  };
}

export function mostOverPaceWindow(
  snapshot: ProviderSnapshot,
  now = new Date(),
  baselines: Record<string, DailyPaceBaseline> = {},
): (NamedQuotaWindow & { pace: QuotaPace }) | null {
  return trackedQuotaWindows(snapshot)
    .map((item) => ({ ...item, pace: calculateQuotaPace(item.window, now, baselines[paceBaselineKey(snapshot.provider, item.period)] ?? null) }))
    .filter((item) => item.pace.status === "over_pace")
    .sort((left, right) => right.pace.overByPercent - left.pace.overByPercent)[0] ?? null;
}

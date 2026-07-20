import type { ProviderSnapshot, UsageWindow } from "../types";

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

export function calculateQuotaPace(window: UsageWindow, now = new Date()): QuotaPace {
  const durationMs = Math.max(1, window.windowSeconds * 1000);
  const unit: QuotaPaceUnit = durationMs <= DAY_MS ? "hour" : "day";
  const unitMs = unit === "hour" ? HOUR_MS : DAY_MS;
  const usedPercent = 100 - clamp(window.remainingPercent, 0, 100);
  const averageRate = 100 / (durationMs / unitMs);
  const resetAt = window.resetsAt ? Date.parse(window.resetsAt) : Number.NaN;

  if (!Number.isFinite(resetAt)) {
    return {
      status: usedPercent <= SCHEDULE_TOLERANCE_PERCENT ? "on_track" : "unknown",
      usedPercent,
      recommendedUsedPercent: null,
      overByPercent: 0,
      averageRate,
      unit,
    };
  }

  const startsAt = resetAt - durationMs;
  const nowMs = now.getTime();
  if (nowMs < startsAt - CLOCK_TOLERANCE_MS || nowMs > resetAt + CLOCK_TOLERANCE_MS) {
    return { status: "unknown", usedPercent, recommendedUsedPercent: null, overByPercent: 0, averageRate, unit };
  }

  const recommendedUsedPercent = clamp(((nowMs - startsAt) / durationMs) * 100, 0, 100);
  const overByPercent = Math.max(0, usedPercent - recommendedUsedPercent);
  return {
    status: overByPercent <= SCHEDULE_TOLERANCE_PERCENT ? "on_track" : "over_pace",
    usedPercent,
    recommendedUsedPercent,
    overByPercent,
    averageRate,
    unit,
  };
}

export function mostOverPaceWindow(snapshot: ProviderSnapshot, now = new Date()): (NamedQuotaWindow & { pace: QuotaPace }) | null {
  return trackedQuotaWindows(snapshot)
    .map((item) => ({ ...item, pace: calculateQuotaPace(item.window, now) }))
    .filter((item) => item.pace.status === "over_pace")
    .sort((left, right) => right.pace.overByPercent - left.pace.overByPercent)[0] ?? null;
}

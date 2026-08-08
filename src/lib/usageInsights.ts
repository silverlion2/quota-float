import { clampPercent } from "./format";
import type { DailyUsageSummary, ProviderId, QuotaHistoryPoint } from "../types";

export interface UsageCalendarDay {
  localDate: string;
  date: Date;
  observedUsedPercent: number | null;
  sampleCount: number;
  level: 0 | 1 | 2 | 3 | 4;
}

function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function usageLevel(value: number | null): UsageCalendarDay["level"] {
  if (value === null || value <= 0) return 0;
  if (value < 3) return 1;
  if (value < 8) return 2;
  if (value < 16) return 3;
  return 4;
}

function usageFromHistory(history: QuotaHistoryPoint[], provider: ProviderId): Map<string, number> {
  const points = history
    .filter((point) => point.provider === provider && point.metricKind === "percent" && point.metric !== null)
    .sort((left, right) => Date.parse(left.capturedAt) - Date.parse(right.capturedAt));
  const totals = new Map<string, number>();
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const point = points[index];
    if (previous.resetsAt !== point.resetsAt || previous.metric === null || point.metric === null) continue;
    const delta = Math.max(0, previous.metric - point.metric);
    if (delta <= 0) continue;
    const key = dateKey(new Date(point.capturedAt));
    totals.set(key, Math.min(100, (totals.get(key) ?? 0) + delta));
  }
  return totals;
}

export function buildUsageCalendar(
  summaries: DailyUsageSummary[],
  history: QuotaHistoryPoint[],
  provider: ProviderId,
  now = new Date(),
  dayCount = 90,
): UsageCalendarDay[] {
  const saved = new Map(
    summaries
      .filter((item) => item.provider === provider)
      .map((item) => [item.localDate, item] as const),
  );
  const recovered = usageFromHistory(history, provider);
  const days: UsageCalendarDay[] = [];
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  cursor.setDate(cursor.getDate() - Math.max(0, dayCount - 1));
  for (let index = 0; index < dayCount; index += 1) {
    const date = new Date(cursor);
    const localDate = dateKey(date);
    const summary = saved.get(localDate);
    const recoveredValue = recovered.get(localDate);
    const observedUsedPercent = summary || recoveredValue !== undefined
      ? Math.max(summary?.observedUsedPercent ?? 0, recoveredValue ?? 0)
      : null;
    days.push({
      localDate,
      date,
      observedUsedPercent,
      sampleCount: summary?.sampleCount ?? (recoveredValue !== undefined ? 2 : 0),
      level: usageLevel(observedUsedPercent),
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export function recentQuotaTrend(
  history: QuotaHistoryPoint[],
  provider: ProviderId,
  currentRemaining: number | null,
  now = new Date(),
  hours = 24,
): Array<{ capturedAt: string; remainingPercent: number }> {
  const cutoff = now.getTime() - hours * 60 * 60_000;
  const all = history
    .filter((point) => point.provider === provider && point.metricKind === "percent" && point.metric !== null)
    .map((point) => ({ capturedAt: point.capturedAt, remainingPercent: clampPercent(point.metric!) }))
    .sort((left, right) => Date.parse(left.capturedAt) - Date.parse(right.capturedAt));
  let points = all.filter((point) => Date.parse(point.capturedAt) >= cutoff);
  if (points.length < 2) points = all.slice(-12);
  if (currentRemaining !== null) {
    const last = points.at(-1);
    if (!last || Math.abs(last.remainingPercent - currentRemaining) > 0.01) {
      points = [...points, { capturedAt: now.toISOString(), remainingPercent: clampPercent(currentRemaining) }];
    }
  }
  return points;
}

export function usageSummary(days: UsageCalendarDay[]): { activeDays: number; observedUsedPercent: number; averageActiveDayPercent: number; todayUsedPercent: number | null } {
  const known = days.filter((day) => day.observedUsedPercent !== null);
  const activeDays = known.filter((day) => (day.observedUsedPercent ?? 0) > 0).length;
  const observedUsedPercent = known.reduce((total, day) => total + (day.observedUsedPercent ?? 0), 0);
  return {
    activeDays,
    observedUsedPercent,
    averageActiveDayPercent: activeDays > 0 ? observedUsedPercent / activeDays : 0,
    todayUsedPercent: days.at(-1)?.observedUsedPercent ?? null,
  };
}

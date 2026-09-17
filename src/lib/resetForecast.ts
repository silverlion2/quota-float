import type { ResetForecast } from "../types";

const MAX_AGE_MS = 6 * 60 * 60_000;
const FUTURE_TOLERANCE_MS = 5 * 60_000;

export type ResetForecastLoadStatus = "loading" | "ready" | "cached" | "unavailable";

export function settleResetForecast(previous: ResetForecast | null, incoming: ResetForecast | null, now: Date): { forecast: ResetForecast | null; status: ResetForecastLoadStatus } {
  const fresh = freshResetForecast(incoming, now);
  if (fresh) return { forecast: fresh, status: "ready" };
  const cached = freshResetForecast(previous, now);
  return { forecast: cached, status: cached ? "cached" : "unavailable" };
}

export function freshResetForecast(forecast: ResetForecast | null | undefined, now: Date): ResetForecast | null {
  if (!forecast || forecast.windowHours !== 48 || !Number.isFinite(forecast.score)
    || forecast.score < 0 || forecast.score > 100) return null;
  const age = now.getTime() - Date.parse(forecast.fetchedAt);
  return Number.isFinite(age) && age >= -FUTURE_TOLERANCE_MS && age <= MAX_AGE_MS ? forecast : null;
}

export function resetSignalSummary(forecast: ResetForecast, english: boolean): string {
  if (forecast.quality === "conflicting") return english ? "Sources conflict · no estimate" : "来源冲突 · 暂不估计";
  if (forecast.quality === "limited") return english ? "Limited evidence" : "证据不足";
  const scores = (forecast.sources ?? []).filter((source) => source.included !== false).map((source) => source.score);
  const low = scores.length ? Math.min(...scores) : forecast.score;
  const high = scores.length ? Math.max(...scores) : forecast.score;
  const range = low === high ? `${low}` : `${low}–${high}`;
  return english ? `48h signal · ${range}/100` : `48小时信号 · ${range}/100`;
}

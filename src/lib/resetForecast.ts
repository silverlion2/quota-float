import type { ResetForecast, ResetPrediction } from "../types";

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
  if (forecast.prediction) {
    const modelAge = now.getTime() - Date.parse(forecast.prediction.generatedAt);
    const expiry = Date.parse(forecast.prediction.validUntil);
    if (!Number.isFinite(modelAge) || modelAge < -FUTURE_TOLERANCE_MS || modelAge > MAX_AGE_MS
      || !Number.isFinite(expiry) || expiry <= now.getTime()
      || expiry <= Date.parse(forecast.prediction.generatedAt)) return null;
  }
  return Number.isFinite(age) && age >= -FUTURE_TOLERANCE_MS && age <= MAX_AGE_MS ? forecast : null;
}

export function resetSignalSummary(forecast: ResetForecast, english: boolean): string {
  const prediction = resetPrediction(forecast);
  return prediction.basis === "source_model"
    ? english ? `48h estimate · ${prediction.estimate48h}%` : `48小时估计 · ${prediction.estimate48h}%`
    : english ? `48h reference · ${prediction.estimate48h}/100` : `48小时参考 · ${prediction.estimate48h}/100`;
}

/** Old caches can supply a named source reference, never a manufactured consensus probability. */
export function resetPrediction(forecast: ResetForecast): ResetPrediction {
  const candidate = forecast.prediction;
  if (candidate && Number.isFinite(candidate.estimate48h) && candidate.estimate48h >= 0 && candidate.estimate48h <= 100
    && Number.isFinite(Date.parse(candidate.generatedAt)) && Date.parse(candidate.validUntil) > Date.parse(candidate.generatedAt)) return candidate;
  const primary = forecast.sources?.find((source) => source.included !== false && source.sourceUrl === forecast.sourceUrl)
    ?? forecast.sources?.find((source) => source.included !== false);
  const generatedAt = primary && Number.isFinite(Date.parse(primary.fetchedAt)) ? primary.fetchedAt : forecast.fetchedAt;
  return {
    sourceName: primary?.name ?? "Public tracker", sourceUrl: primary?.sourceUrl ?? forecast.sourceUrl,
    basis: "source_signal", reportedLastResetAt: primary?.lastResetAt ?? null,
    generatedAt, validUntil: new Date(Date.parse(generatedAt) + 48 * 3_600_000).toISOString(),
    estimate24h: null, estimate48h: primary && Number.isFinite(primary.score) && primary.score >= 0 && primary.score <= 100 ? primary.score : forecast.score,
    range24h: null, range48h: null, calibration: "uncalibrated", expectedWindow: null, watchWindow: null,
    confidence: "low", reason: "Legacy reference.",
  };
}

export function resetForecastAdvice(prediction: ResetPrediction, english: boolean): string {
  if (prediction.basis !== "source_model") return english
    ? "This is a tracker score, not a reset probability. Keep your quota plan; recheck reported windows."
    : "信号分数不代表概率。按现有额度安排，复查来源窗口。";
  if ((prediction.range48h?.upper ?? prediction.estimate48h) < 50) return english
    ? "A reset is not the leading 48-hour outcome. Work within your quota; do not wait for a refill."
    : "模型不倾向48小时内重置。按现有额度安排，不必等待回补。";
  if (prediction.estimate48h >= 60) return english
    ? `${prediction.watchWindow ? "Recheck during the watch window" : "Check again before a long session"}; keep a quota reserve until an observed refill.`
    : `${prediction.watchWindow ? "可在观察时段复查" : "开始长任务前再次检查"}；回补前保留余量。`;
  return english
    ? "Outcome uncertain. Keep your plan and recheck before a long session."
    : "结果不明确。继续当前安排，长任务前复查。";
}

export function activeResetWindow(window: ResetPrediction["watchWindow"], now: Date, validUntil: string): ResetPrediction["watchWindow"] {
  if (!window) return null;
  const start = Date.parse(window.startAt), end = Date.parse(window.endAt);
  return Number.isFinite(start) && end > start && end > now.getTime() && end <= Date.parse(validUntil) ? window : null;
}

import { describe, expect, it } from "vitest";
import type { ResetForecast, ResetPrediction } from "../types";
import { activeResetWindow, freshResetForecast, resetForecastAdvice, resetPrediction, resetSignalSummary, settleResetForecast } from "./resetForecast";

const now = new Date("2026-09-15T12:00:00Z");
const forecast: ResetForecast = { score: 66, windowHours: 48, fetchedAt: now.toISOString(), resetAnnounced: false, sourceUrl: "https://codex-reset.com/" };
const prediction: ResetPrediction = {
  sourceName: "Codex Reset", sourceUrl: forecast.sourceUrl, basis: "source_model",
  reportedLastResetAt: "2026-09-12T08:00:00Z", generatedAt: now.toISOString(), validUntil: "2026-09-17T12:00:00Z",
  estimate24h: 19, estimate48h: 34, range24h: { lower: 12, upper: 29 }, range48h: { lower: 22, upper: 48 },
  calibration: "experimental", expectedWindow: null, watchWindow: null, confidence: "low", reason: "Historical reset model",
};

describe("public reset evidence presentation", () => {
  it("retains valid data on failure without extending its expiry, then recovers", () => {
    expect(settleResetForecast(forecast, null, now)).toEqual({ forecast, status: "cached" });
    expect(settleResetForecast(forecast, null, new Date(now.getTime() + 6 * 60 * 60_000 + 1))).toEqual({ forecast: null, status: "unavailable" });
    expect(settleResetForecast(null, null, now)).toEqual({ forecast: null, status: "unavailable" });
    const next = { ...forecast, score: 42 };
    expect(settleResetForecast(forecast, next, now)).toEqual({ forecast: next, status: "ready" });
  });
  it("retains a primary reference when reset baselines conflict or evidence is limited", () => {
    expect(resetSignalSummary({ ...forecast, quality: "conflicting" }, true)).toBe("48h reference · 66/100");
    expect(resetSignalSummary({ ...forecast, quality: "limited" }, false)).toBe("48小时参考 · 66/100");
  });
  it("uses the primary source without averaging excluded scores", () => {
    const sources = [42, 51, 91].map((score, index) => ({ name: `source ${index}`, score, fetchedAt: now.toISOString(), sourceUrl: forecast.sourceUrl, included: index < 2 }));
    expect(resetSignalSummary({ ...forecast, quality: "consistent", sources }, true)).toBe("48h reference · 42/100");
  });
  it("rejects stale, future, malformed and mismatched-horizon forecasts", () => {
    expect(freshResetForecast(forecast, now)).toBe(forecast);
    for (const invalid of [
      { fetchedAt: "invalid" }, { fetchedAt: "2026-09-15T05:59:59Z" },
      { fetchedAt: "2026-09-15T12:05:01Z" }, { windowHours: 24 }, { score: NaN }, { score: 101 },
    ]) expect(freshResetForecast({ ...forecast, ...invalid }, now)).toBeNull();
  });
  it.each(["invalid", "2026-09-15T12:01:00Z", "2026-09-15T12:02:00Z"])("rejects invalid or non-forward model expiry %s without manufacturing a cache deadline", (validUntil) => {
    // A generation time within the clock-skew allowance makes the invalid
    // ordering observable even when both timestamps are still in the future.
    const model = { ...forecast, prediction: { ...prediction, generatedAt: "2026-09-15T12:02:00Z" } };
    expect(freshResetForecast(model, now)).toBe(model);
    const invalid = { ...model, prediction: { ...model.prediction, validUntil } };
    expect(freshResetForecast(invalid, now)).toBeNull();
    expect(settleResetForecast(null, invalid, now)).toEqual({ forecast: null, status: "unavailable" });
    expect(settleResetForecast(invalid, null, now)).toEqual({ forecast: null, status: "unavailable" });
  });
  it("keeps the primary model estimate visible when tracker baselines conflict", () => {
    const model = { ...forecast, quality: "conflicting" as const, prediction };
    expect(resetSignalSummary(model, true)).toBe("48h estimate · 34%");
    expect(resetPrediction(model)).toBe(prediction);
    expect(resetSignalSummary({ ...model, prediction: { ...prediction, basis: "source_signal" } }, true)).toBe("48h reference · 34/100");
  });
  it("anchors legacy references to the original primary-source data time", () => {
    const sourceTime = "2026-09-15T10:00:00Z";
    const reference = resetPrediction({ ...forecast, sources: [{ name: "Primary", score: 24, fetchedAt: sourceTime, sourceUrl: forecast.sourceUrl }] });
    expect(reference.generatedAt).toBe(sourceTime);
    expect(Date.parse(reference.validUntil)).toBe(Date.parse("2026-09-17T10:00:00Z"));
    expect(reference.basis).toBe("source_signal");
    expect(reference.estimate48h).toBe(24);
  });
  it("does not refresh model age or fixed expiry when an otherwise fresh cache is retained", () => {
    const cached = { ...forecast, prediction: { ...prediction, generatedAt: "2026-09-15T10:00:00Z", validUntil: "2026-09-17T10:00:00Z" } };
    const retained = settleResetForecast(cached, null, now);
    expect(retained.status).toBe("cached");
    expect(retained.forecast).toBe(cached);
    expect(retained.forecast?.prediction?.generatedAt).toBe("2026-09-15T10:00:00Z");
    expect(retained.forecast?.prediction?.validUntil).toBe("2026-09-17T10:00:00Z");
    const refreshedEnvelope = { ...cached, fetchedAt: "2026-09-15T17:00:00Z" };
    expect(settleResetForecast(refreshedEnvelope, null, new Date("2026-09-15T17:00:00Z"))).toEqual({ forecast: null, status: "unavailable" });
    expect(freshResetForecast({ ...forecast, prediction: { ...prediction, validUntil: now.toISOString() } }, now)).toBeNull();
  });
  it("expires a fixed watch window without moving its endpoints forward", () => {
    const window = { startAt: "2026-09-15T13:00:00Z", endAt: "2026-09-15T14:00:00Z" };
    expect(activeResetWindow(window, now, prediction.validUntil)).toBe(window);
    expect(activeResetWindow(window, new Date("2026-09-15T13:30:00Z"), prediction.validUntil)).toBe(window);
    expect(activeResetWindow(window, new Date(window.endAt), prediction.validUntil)).toBeNull();
    expect(activeResetWindow({ startAt: window.endAt, endAt: window.startAt }, now, prediction.validUntil)).toBeNull();
    expect(activeResetWindow({ ...window, endAt: "2026-09-18T12:00:00Z" }, now, prediction.validUntil)).toBeNull();
  });
  it("does not advise checking a watch window that the high estimate does not supply", () => {
    const high = { ...prediction, estimate48h: 75, range48h: { lower: 55, upper: 90 } };
    expect(resetForecastAdvice(high, true)).toContain("Check again before a long session");
    expect(resetForecastAdvice(high, true)).not.toContain("watch window");
    expect(resetForecastAdvice(high, false)).toContain("开始长任务前再次检查");
    expect(resetForecastAdvice(high, false)).not.toContain("观察时段");
    expect(resetForecastAdvice({ ...high, watchWindow: { startAt: "2026-09-15T13:00:00Z", endAt: "2026-09-15T14:00:00Z" } }, true)).toContain("Recheck during the watch window");
  });
});

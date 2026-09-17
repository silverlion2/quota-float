import { describe, expect, it } from "vitest";
import type { CodexTokenUsageBucket, CodexTokenUsageReport } from "../types";
import {
  buildApiBudgetForecast, buildModelBreakdown, buildTokenFilterOptions,
  buildTokenHeatmap, buildTokenSeries, summarizeTokenReport,
  usageRangeBounds, validateCustomUsageRange,
} from "./tokenUsage";
import { buildUsageCsv, buildUsageJson, buildUsageShareSvg } from "./usageExport";

const now = new Date(2026, 8, 17, 12);
const range = { startDate: "2026-09-14", endDate: "2026-09-15" };
const bucket = (day: number, hour: number, totalTokens: number, projectId = "private-id"): CodexTokenUsageBucket => ({
  bucketStart: new Date(2026, 8, day, hour).toISOString(), model: "gpt-5.6-sol", contextTier: "short",
  project: "private-project", projectId, terminal: "Desktop", sessionKey: "private-session",
  inputTokens: totalTokens, cachedInputTokens: 0, cacheWriteInputTokens: 0, outputTokens: 0,
  reasoningOutputTokens: 0, totalTokens, requests: 1,
});
const report: CodexTokenUsageReport = {
  generatedAt: now.toISOString(), rangeDays: 90, scannedFiles: 1, indexedFiles: 1, reusedFiles: 0,
  incrementalFiles: 0, skippedFiles: 0, scannedBytes: 100, matchedEvents: 5, scanDurationMs: 1,
  cacheStatus: "reused", truncated: false,
  buckets: [bucket(12, 0, 10), bucket(13, 23, 20), bucket(14, 0, 100), bucket(15, 23, 200), bucket(16, 0, 1000)],
};

describe("custom local usage dates", () => {
  it("includes both selected dates and excludes the next midnight, with an equal-duration comparison", () => {
    const bounds = usageRangeBounds(range, now);
    expect(bounds.start).toEqual(new Date(2026, 8, 14));
    expect(bounds.end).toEqual(new Date(2026, 8, 16));
    expect(bounds.previousStart).toEqual(new Date(2026, 8, 12));
    expect(bounds.previousEnd).toEqual(bounds.start);
    const summary = summarizeTokenReport(report, range, now);
    expect(summary.current.totalTokens).toBe(300);
    expect(summary.previous.totalTokens).toBe(30);
  });

  it("uses identical bounds for totals, trends, heatmaps, model ledger and exports", () => {
    const filtered = { ...report, buckets: [...report.buckets, bucket(15, 12, 999, "another-project")] };
    const filters = { projectId: "private-id" };
    const summary = summarizeTokenReport(filtered, range, now, filters).current;
    const series = buildTokenSeries(filtered, range, now, filters);
    expect(series.map((point) => point.key)).toEqual(["2026-09-14", "2026-09-15"]);
    expect(series.reduce((sum, point) => sum + point.totalTokens, 0)).toBe(summary.totalTokens);
    expect(buildTokenHeatmap(filtered, range, now, filters).reduce((sum, cell) => sum + cell.tokens, 0)).toBe(300);
    const models = buildModelBreakdown(filtered, range, now, filters);
    expect(models[0].totalTokens).toBe(300);
    expect(buildTokenFilterOptions(filtered, range, now).projects).toHaveLength(2);
    const json = JSON.parse(buildUsageJson(filtered, range, filters, now));
    expect(json.rows).toHaveLength(2);
    expect(json.period).toEqual({ start: new Date(2026, 8, 14).toISOString(), endExclusive: new Date(2026, 8, 16).toISOString() });
    expect(json.range).toEqual(range);
    expect(JSON.stringify(json)).not.toContain("private-");
    const csv = buildUsageCsv(filtered, range, filters, now);
    expect(csv.split("\r\n")).toHaveLength(3);
    expect(csv).not.toContain("private-");
    const budget = buildApiBudgetForecast(summary, range, 50, now, now, 12);
    expect(budget.dailyAverageUsd).toBeCloseTo(summary.cost.totalUsd / 2);
    expect(budget.currentMonthUsd).toBe(12);
    expect(buildUsageShareSvg(summary, models, budget, range, "en", now)).toContain("2026-09-14 → 2026-09-15");
  });

  it("caps today's range at now and permits a single local day", () => {
    const today = { startDate: "2026-09-17", endDate: "2026-09-17" };
    expect(validateCustomUsageRange(today, now)).toBe(true);
    expect(usageRangeBounds(today, now).end).toEqual(now);
    expect(buildTokenSeries(report, today, now)).toHaveLength(1);
  });

  it("keeps local midnight boundaries across daylight-saving changes and compares equal elapsed durations", () => {
    for (const [month, day, date] of [[2, 8, "2026-03-08"], [10, 1, "2026-11-01"]] as const) {
      const selection = { startDate: date, endDate: date };
      const after = new Date(2026, 11, 1);
      const bounds = usageRangeBounds(selection, after);
      expect(bounds.start).toEqual(new Date(2026, month, day));
      expect(bounds.end).toEqual(new Date(2026, month, day + 1));
      expect(bounds.previousEnd.getTime() - bounds.previousStart.getTime()).toBe(bounds.end.getTime() - bounds.start.getTime());
      expect(buildTokenSeries(report, selection, after).map((point) => point.key)).toEqual([date]);
    }
  });

  it("rejects malformed, impossible, reversed, future and oversized dates without widening the query", () => {
    for (const invalid of [
      { startDate: "", endDate: "2026-09-15" },
      { startDate: "2026-02-30", endDate: "2026-03-01" },
      { startDate: "2026-09-16", endDate: "2026-09-15" },
      { startDate: "2026-09-17", endDate: "2026-09-18" },
      { startDate: "2025-09-15", endDate: "2026-09-16" },
      { startDate: "2026-9-14", endDate: "2026-09-15" },
    ]) {
      expect(validateCustomUsageRange(invalid, now)).toBe(false);
      expect(summarizeTokenReport(report, invalid, now).current.totalTokens).toBe(0);
      expect(buildTokenSeries(report, invalid, now)).toEqual([]);
      expect(JSON.parse(buildUsageJson(report, invalid, {}, now)).rows).toEqual([]);
    }
    expect(validateCustomUsageRange({ startDate: "2024-01-01", endDate: "2024-12-31" }, now)).toBe(true);
  });

  it("keeps the oldest partial day in rolling charts so their total matches the summary", () => {
    const rolling = { ...report, buckets: [bucket(10, 13, 25), bucket(17, 11, 50)] };
    expect(buildTokenSeries(rolling, "7d", now).reduce((sum, point) => sum + point.totalTokens, 0)).toBe(75);
    expect(summarizeTokenReport(rolling, "7d", now).current.totalTokens).toBe(75);
    const hourly = { ...report, buckets: [bucket(16, 12, 25), bucket(17, 11, 50)] };
    expect(buildTokenSeries(hourly, "24h", now).reduce((sum, point) => sum + point.totalTokens, 0)).toBe(75);
  });
});

import { describe, expect, it } from "vitest";
import type { CodexTokenUsageBucket, CodexTokenUsageReport } from "../types";
import { buildApiBudgetForecast, buildModelBreakdown, buildTokenFilterOptions, buildTokenHeatmap, buildTokenSeries, estimateBucketCost, relativeChange, summarizeTokenReport, usageCoverageStart } from "./tokenUsage";

const bucket = (overrides: Partial<CodexTokenUsageBucket> = {}): CodexTokenUsageBucket => ({
  bucketStart: "2026-08-16T02:00:00Z",
  model: "gpt-5.6-sol",
  contextTier: "short",
  project: "quota-float",
  terminal: "Desktop",
  sessionKey: "s-test",
  inputTokens: 1_000_000,
  cachedInputTokens: 600_000,
  cacheWriteInputTokens: 100_000,
  outputTokens: 100_000,
  reasoningOutputTokens: 40_000,
  totalTokens: 1_100_000,
  requests: 4,
  ...overrides,
});

describe("token usage", () => {
  it("estimates API-equivalent cost with cached and cache-write rates", () => {
    const cost = estimateBucketCost(bucket());
    expect(cost?.inputUsd).toBeCloseTo(1.5);
    expect(cost?.cachedInputUsd).toBeCloseTo(.3);
    expect(cost?.cacheWriteUsd).toBeCloseTo(.625);
    expect(cost?.outputUsd).toBeCloseTo(3);
    expect(cost?.totalUsd).toBeCloseTo(5.425);
  });

  it("uses long-context rates and leaves unknown models unpriced", () => {
    expect(estimateBucketCost(bucket({ contextTier: "long" }))?.totalUsd).toBeGreaterThan(estimateBucketCost(bucket())!.totalUsd);
    expect(estimateBucketCost(bucket({ model: "unknown-model" }))).toBeNull();
  });

  it("summarizes the selected and previous rolling windows", () => {
    const report: CodexTokenUsageReport = {
      generatedAt: "2026-08-16T12:00:00Z", rangeDays: 90, scannedFiles: 2, indexedFiles: 2, reusedFiles: 0, incrementalFiles: 0, skippedFiles: 0, scannedBytes: 100, matchedEvents: 2, scanDurationMs: 10, cacheStatus: "rebuilt", truncated: false,
      buckets: [bucket({ bucketStart: "2026-08-16T02:00:00Z" }), bucket({ bucketStart: "2026-08-15T02:00:00Z", totalTokens: 550_000 })],
    };
    const summary = summarizeTokenReport(report, "24h", new Date("2026-08-16T12:00:00Z"));
    expect(summary.current.totalTokens).toBe(1_100_000);
    expect(summary.current.activeDays).toBe(1);
    expect(summary.current.sessions).toBe(1);
    expect(summary.current.cacheHitRate).toBeCloseTo(.6);
    expect(summary.previous.totalTokens).toBe(550_000);
    expect(relativeChange(summary.current.totalTokens, summary.previous.totalTokens)).toBe(100);
  });

  it("places local hourly totals in a Monday-first heatmap", () => {
    const report: CodexTokenUsageReport = {
      generatedAt: "2026-08-16T12:00:00Z", rangeDays: 90, scannedFiles: 1, indexedFiles: 1, reusedFiles: 0, incrementalFiles: 0, skippedFiles: 0, scannedBytes: 100, matchedEvents: 1, scanDurationMs: 10, cacheStatus: "rebuilt", truncated: false,
      buckets: [bucket()],
    };
    const cells = buildTokenHeatmap(report, "7d", new Date("2026-08-16T12:00:00Z"));
    expect(cells).toHaveLength(168);
    expect(cells.reduce((total, cell) => total + cell.tokens, 0)).toBe(1_100_000);
  });

  it("builds filter options, model breakdown, and a monthly budget outlook", () => {
    const report: CodexTokenUsageReport = {
      generatedAt: "2026-08-16T12:00:00Z", rangeDays: 90, scannedFiles: 2, indexedFiles: 2, reusedFiles: 0, incrementalFiles: 0, skippedFiles: 0, scannedBytes: 100, matchedEvents: 2, scanDurationMs: 10, cacheStatus: "incremental", truncated: false,
      buckets: [bucket(), bucket({ model: "gpt-5.6-luna", project: "atlas", terminal: "CLI", sessionKey: "s-two", totalTokens: 550_000 })],
    };
    const now = new Date("2026-08-16T12:00:00Z");
    expect(buildTokenFilterOptions(report, "7d", now)).toEqual({ models: ["gpt-5.6-luna", "gpt-5.6-sol"], projects: ["atlas", "quota-float"], terminals: ["CLI", "Desktop"] });
    const breakdown = buildModelBreakdown(report, "7d", now);
    expect(breakdown).toHaveLength(2);
    expect(breakdown.reduce((total, model) => total + model.share, 0)).toBeCloseTo(1);
    const filtered = summarizeTokenReport(report, "7d", now, { project: "atlas" }).current;
    expect(filtered.models).toBe(1);
    expect(filtered.sessions).toBe(1);
    expect(buildApiBudgetForecast(filtered, "7d", .1, now).status).toBe("over");
  });

  it("covers all retained Codex metadata and groups the full history by month", () => {
    const report: CodexTokenUsageReport = {
      generatedAt: "2026-08-16T12:00:00Z",
      rangeDays: 959,
      coverageStart: "2024-01-02T02:00:00Z",
      coverageEnd: "2026-08-16T02:00:00Z",
      scannedFiles: 2,
      indexedFiles: 2,
      reusedFiles: 0,
      incrementalFiles: 0,
      skippedFiles: 0,
      scannedBytes: 100,
      matchedEvents: 2,
      scanDurationMs: 10,
      cacheStatus: "rebuilt",
      truncated: false,
      buckets: [
        bucket({ bucketStart: "2024-01-02T02:00:00Z", sessionKey: "s-old" }),
        bucket({ bucketStart: "2026-08-16T02:00:00Z", sessionKey: "s-new" }),
      ],
    };
    const now = new Date("2026-08-16T12:00:00Z");

    expect(usageCoverageStart(report, now).toISOString()).toBe("2024-01-02T02:00:00.000Z");
    const summary = summarizeTokenReport(report, "all", now);
    expect(summary.current.totalTokens).toBe(2_200_000);
    expect(summary.previous.totalTokens).toBe(0);
    const series = buildTokenSeries(report, "all", now);
    expect(series[0].key).toBe("2024-01");
    expect(series.at(-1)?.key).toBe("2026-08");
    expect(series.reduce((total, point) => total + point.totalTokens, 0)).toBe(2_200_000);
  });
});

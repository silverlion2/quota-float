import { describe, expect, it } from "vitest";
import type { CodexTokenUsageBucket, CodexTokenUsageReport } from "../types";
import { buildApiBudgetForecast, buildCurrentPeriodUsageReport, buildModelBreakdown, buildTokenFilterOptions, buildTokenHeatmap, buildTokenSeries, estimateBucketCost, relativeChange, summarizeCurrentMonthTokenUsage, summarizeTokenBuckets, summarizeTokenReport, usageCoverageStart } from "./tokenUsage";

const bucket = (overrides: Partial<CodexTokenUsageBucket> = {}): CodexTokenUsageBucket => ({
  bucketStart: "2026-08-16T02:00:00Z",
  model: "gpt-5.6-sol",
  contextTier: "short",
  project: "quota-float",
  projectId: "p-quota-float",
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
    expect(cost?.inputUsd).toBeCloseTo(1.2);
    expect(cost?.cachedInputUsd).toBeCloseTo(.24);
    expect(cost?.cacheWriteUsd).toBeCloseTo(.5);
    expect(cost?.outputUsd).toBeCloseTo(2);
    expect(cost?.totalUsd).toBeCloseTo(3.94);
  });

  it("prices Astra, uses long-context rates, and leaves unknown models unpriced", () => {
    expect(estimateBucketCost(bucket({ model: "gpt-6-astra" }))?.totalUsd).toBeCloseTo(9.85);
    expect(estimateBucketCost(bucket({ contextTier: "long" }))?.totalUsd).toBeGreaterThan(estimateBucketCost(bucket())!.totalUsd);
    expect(estimateBucketCost(bucket({ model: "unknown-model" }))).toBeNull();
  });

  it("counts Astra as priced while unknown models still reduce coverage", () => {
    const summary = summarizeTokenBuckets([
      bucket({ model: "gpt-6-astra", sessionKey: "s-astra" }),
      bucket({ model: "future-model", sessionKey: "s-unknown" }),
    ]);
    expect(summary.pricedTokenCoverage).toBe(.5);
    expect(summary.unpricedModels).toEqual(["future-model"]);
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
      buckets: [bucket(), bucket({ model: "gpt-5.6-luna", project: "atlas", projectId: "p-atlas", terminal: "CLI", sessionKey: "s-two", totalTokens: 550_000 })],
    };
    const now = new Date("2026-08-16T12:00:00Z");
    expect(buildTokenFilterOptions(report, "7d", now)).toEqual({ models: ["gpt-5.6-luna", "gpt-5.6-sol"], projects: [{ id: "p-atlas", name: "atlas", label: "atlas" }, { id: "p-quota-float", name: "quota-float", label: "quota-float" }], terminals: ["CLI", "Desktop"] });
    const breakdown = buildModelBreakdown(report, "7d", now);
    expect(breakdown).toHaveLength(2);
    expect(breakdown.reduce((total, model) => total + model.share, 0)).toBeCloseTo(1);
    const filtered = summarizeTokenReport(report, "7d", now, { projectId: "p-atlas" }).current;
    expect(filtered.models).toBe(1);
    expect(filtered.sessions).toBe(1);
    expect(buildApiBudgetForecast(filtered, "7d", .1, now).status).toBe("over");
  });

  it("keeps same-name projects distinct by opaque identity", () => {
    const now = new Date("2026-08-16T12:00:00Z");
    const report: CodexTokenUsageReport = {
      generatedAt: now.toISOString(), rangeDays: 90, scannedFiles: 2, indexedFiles: 2, reusedFiles: 0, incrementalFiles: 0, skippedFiles: 0, scannedBytes: 100, matchedEvents: 2, scanDurationMs: 10, cacheStatus: "rebuilt", truncated: false,
      buckets: [
        bucket({ project: "quota-float", projectId: "p-aaaaaaaa", sessionKey: "s-one" }),
        bucket({ project: "quota-float", projectId: "p-bbbbbbbb", sessionKey: "s-two" }),
      ],
    };

    expect(buildTokenFilterOptions(report, "7d", now).projects).toEqual([
      { id: "p-aaaaaaaa", name: "quota-float", label: "quota-float · aaaaaa" },
      { id: "p-bbbbbbbb", name: "quota-float", label: "quota-float · bbbbbb" },
    ]);
    expect(summarizeTokenReport(report, "7d", now, { projectId: "p-aaaaaaaa" }).current.sessions).toBe(1);
    expect(summarizeTokenBuckets(report.buckets).projects).toBe(2);
  });

  it("builds explicit weekly summaries without treating record-free hours as missing or zero", () => {
    const now = new Date(2026, 8, 8, 20, 0, 0);
    const start = new Date(2026, 8, 7, 0, 0, 0);
    const report: CodexTokenUsageReport = {
      generatedAt: now.toISOString(), rangeDays: 2, coverageStart: new Date(start.getTime() + 12 * 3_600_000).toISOString(), coverageEnd: new Date(now.getTime() - 3_600_000).toISOString(), scannedFiles: 1, indexedFiles: 1, reusedFiles: 0, incrementalFiles: 0, skippedFiles: 0, scannedBytes: 100, matchedEvents: 1, scanDurationMs: 10, cacheStatus: "rebuilt", truncated: false,
      buckets: [bucket({ bucketStart: new Date(start.getTime() + 13 * 3_600_000).toISOString() })],
    };

    const summary = buildCurrentPeriodUsageReport(report, "week", now);
    expect(summary.start).toBe(start.toISOString());
    expect(summary.end).toBe(now.toISOString());
    expect(summary.summary.totalTokens).toBe(1_100_000);
    expect(summary.coverageStatus).toBe("recorded");
    expect(summary.recordedHours).toBe(1);
    expect(summary.unrecordedHours).toBe(summary.elapsedHours - 1);
    expect(summary.end).toBe(now.toISOString());
  });

  it("uses truncation as known incomplete evidence", () => {
    const now = new Date(2026, 8, 8, 20, 0, 0);
    const report: CodexTokenUsageReport = {
      generatedAt: now.toISOString(), rangeDays: 2, scannedFiles: 1, indexedFiles: 1, reusedFiles: 0, incrementalFiles: 0, skippedFiles: 2, scannedBytes: 100, matchedEvents: 1, scanDurationMs: 10, cacheStatus: "rebuilt", truncated: true,
      buckets: [bucket({ bucketStart: new Date(2026, 8, 8, 12, 0, 0).toISOString() })],
    };

    const summary = buildCurrentPeriodUsageReport(report, "week", now);
    expect(summary.coverageStatus).toBe("truncated");
    expect(summary.indexTruncated).toBe(true);
  });

  it("uses the local month boundary and excludes future time", () => {
    const now = new Date(2026, 8, 8, 20, 30, 0);
    const monthStart = new Date(2026, 8, 1, 0, 0, 0);
    const report: CodexTokenUsageReport = {
      generatedAt: now.toISOString(), rangeDays: 40, scannedFiles: 2, indexedFiles: 2, reusedFiles: 0, incrementalFiles: 0, skippedFiles: 0, scannedBytes: 100, matchedEvents: 2, scanDurationMs: 10, cacheStatus: "rebuilt", truncated: false,
      buckets: [
        bucket({ bucketStart: new Date(2026, 7, 31, 23, 0, 0).toISOString(), sessionKey: "s-previous-month" }),
        bucket({ bucketStart: new Date(2026, 8, 1, 0, 0, 0).toISOString(), sessionKey: "s-current-month" }),
      ],
    };

    const summary = buildCurrentPeriodUsageReport(report, "month", now);
    expect(summary.start).toBe(monthStart.toISOString());
    expect(summary.end).toBe(now.toISOString());
    expect(summary.summary.totalTokens).toBe(1_100_000);
    expect(summary.elapsedHours).toBe(Math.ceil((now.getTime() - monthStart.getTime()) / 3_600_000));
  });

  it("keeps selected-range projection separate from retained month-to-date cost", () => {
    const now = new Date("2026-09-08T12:00:00Z");
    const report: CodexTokenUsageReport = {
      generatedAt: now.toISOString(), rangeDays: 90, scannedFiles: 2, indexedFiles: 2, reusedFiles: 0, incrementalFiles: 0, skippedFiles: 0, scannedBytes: 100, matchedEvents: 2, scanDurationMs: 10, cacheStatus: "incremental", truncated: false,
      buckets: [
        bucket({ bucketStart: "2026-08-31T02:00:00Z", sessionKey: "s-august" }),
        bucket({ bucketStart: "2026-09-03T02:00:00Z", sessionKey: "s-september" }),
      ],
    };
    const selected = summarizeTokenReport(report, "7d", now).current;
    const monthToDate = summarizeCurrentMonthTokenUsage(report, now);
    const budget = buildApiBudgetForecast(selected, "7d", 100, now, usageCoverageStart(report, now), monthToDate.cost.totalUsd);

    expect(monthToDate.totalTokens).toBe(1_100_000);
    expect(budget.selectedRangeUsd).toBeCloseTo(selected.cost.totalUsd);
    expect(budget.currentMonthUsd).toBeCloseTo(monthToDate.cost.totalUsd);
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

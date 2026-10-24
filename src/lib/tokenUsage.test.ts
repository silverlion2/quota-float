import { describe, expect, it } from "vitest";
import type { CodexTokenUsageBucket, CodexTokenUsageReport } from "../types";
import { formatUsageCost, usagePricingStatus } from "./tokenUsage";
import { buildApiBudgetForecast, buildCurrentPeriodUsageReport, buildModelBreakdown, buildTokenFilterOptions, buildTokenHeatmap, buildTokenSeries, buildUsageBreakdown, estimateBucketCost, relativeChange, summarizeCurrentMonthTokenUsage, summarizeTokenBuckets, summarizeTokenReport, usageCoverageStart } from "./tokenUsage";

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

describe("pricing completeness", () => {
  it("distinguishes unknown, partial, complete and record-free usage without guessing prices", () => {
    const unknown = summarizeTokenBuckets([bucket({ model: "unknown-future-model" })]);
    const partial = summarizeTokenBuckets([bucket(), bucket({ model: "unknown-future-model" })]);
    const complete = summarizeTokenBuckets([bucket()]);
    expect(usagePricingStatus(unknown)).toBe("unpriced");
    expect(formatUsageCost(unknown.cost.totalUsd, "unpriced", "en")).toBe("Unpriced");
    expect(usagePricingStatus(partial)).toBe("partial");
    expect(partial.cost.totalUsd).toBe(complete.cost.totalUsd);
    expect(formatUsageCost(partial.cost.totalUsd, "partial", "en")).toMatch(/^Priced subtotal \$/);
    expect(usagePricingStatus(complete)).toBe("complete");
    expect(usagePricingStatus(summarizeTokenBuckets([]))).toBe("no_records");
  });
  it("does not extrapolate unknown or partial prices into a monthly total or healthy budget", () => {
    for (const buckets of [[bucket({ model: "unknown-future-model" })], [bucket(), bucket({ model: "unknown-future-model" })]]) {
      const forecast = buildApiBudgetForecast(summarizeTokenBuckets(buckets), "7d", 100);
      expect(forecast.projectedMonthlyUsd).toBeNull();
      expect(forecast.dailyAverageUsd).toBeNull();
      expect(["unpriced", "partial"]).toContain(forecast.status);
      expect(forecast.utilization).toBe(0);
    }
  });
  it("marks unknown-only and mixed trend buckets and heat cells", () => {
    const report = { buckets: [bucket(), bucket({ model: "unknown-future-model" })] } as CodexTokenUsageReport;
    const now = new Date("2026-08-16T12:00:00Z");
    expect(buildTokenSeries(report, "7d", now).find((point) => point.totalTokens > 0)?.pricingStatus).toBe("partial");
    expect(buildTokenHeatmap({ ...report, buckets: [bucket({ model: "unknown-future-model" })] }, "7d", now).find((cell) => cell.tokens > 0)?.pricingStatus).toBe("unpriced");
    expect(buildTokenSeries({ ...report, buckets: [bucket({ model: "unknown-future-model" })] }, "7d", now).find((point) => point.totalTokens > 0)?.costUsd).toBeNull();
  });
});

describe("local usage distributions", () => {
  const now = new Date("2026-08-16T12:00:00Z");
  const reportWith = (buckets: CodexTokenUsageBucket[]): CodexTokenUsageReport => ({
    generatedAt: now.toISOString(), rangeDays: 90, scannedFiles: 2, indexedFiles: 2, reusedFiles: 0, incrementalFiles: 0,
    skippedFiles: 0, scannedBytes: 100, matchedEvents: buckets.length, scanDurationMs: 10, cacheStatus: "rebuilt", truncated: false, buckets,
  });

  it("groups projects by identity, keeps same-name projects distinct, and counts sessions once per group", () => {
    const report = reportWith([
      bucket({ projectId: "p-aaaaaaaa", project: "shared", totalTokens: 200, sessionKey: "same-session" }),
      bucket({ projectId: "p-aaaaaaaa", project: "shared", totalTokens: 100, sessionKey: "same-session", bucketStart: "2026-08-16T03:00:00Z" }),
      bucket({ projectId: "p-bbbbbbbb", project: "shared", totalTokens: 100, sessionKey: "other-session" }),
    ]);
    const rows = buildUsageBreakdown(report, "24h", now);
    expect(rows.map((row) => ({ key: row.key, label: row.label, tokens: row.totalTokens, share: row.tokenShare, sessions: row.sessions, buckets: row.bucketCount, requests: row.requests }))).toEqual([
      { key: "p-aaaaaaaa", label: "shared · aaaaaa", tokens: 300, share: .75, sessions: 1, buckets: 2, requests: 8 },
      { key: "p-bbbbbbbb", label: "shared · bbbbbb", tokens: 100, share: .25, sessions: 1, buckets: 1, requests: 4 },
    ]);
    expect(rows[0].costUsd).toBeCloseTo(7.88);
    expect(rows[0].costShare).toBeCloseTo(2 / 3);
    expect(rows[1].costShare).toBeCloseTo(1 / 3);
  });

  it("marks unknown groups explicitly and combines only equivalent terminal names", () => {
    const report = reportWith([
      bucket({ projectId: "", project: "", terminal: "", totalTokens: 100 }),
      bucket({ projectId: "unknown", project: "unattributed", terminal: "Other", totalTokens: 200 }),
      bucket({ projectId: "p-cli", project: "", terminal: "CLI", totalTokens: 300 }),
    ]);
    const projects = buildUsageBreakdown(report, "24h", now);
    expect(projects.find((row) => row.key === "unknown")).toMatchObject({ label: "Unknown", totalTokens: 300, bucketCount: 2 });
    expect(projects.find((row) => row.key === "p-cli")).toMatchObject({ label: "Unknown · p-cli", totalTokens: 300 });
    const terminals = buildUsageBreakdown(report, "24h", now, {}, "terminal");
    expect(terminals.map((row) => ({ key: row.key, label: row.label, tokens: row.totalTokens, share: row.tokenShare }))).toEqual([
      { key: "CLI", label: "CLI", tokens: 300, share: .5 },
      { key: "Other", label: "Other", tokens: 300, share: .5 },
    ]);
  });

  it("distinguishes a partial priced subtotal from complete group cost and suppresses incomplete cost shares", () => {
    const report = reportWith([
      bucket({ projectId: "mixed", totalTokens: 200 }),
      bucket({ projectId: "mixed", model: "future-model", totalTokens: 100 }),
      bucket({ projectId: "priced", totalTokens: 100 }),
      bucket({ projectId: "unpriced", model: "future-model", totalTokens: 100 }),
    ]);
    const rows = buildUsageBreakdown(report, "24h", now);
    expect(rows.find((row) => row.key === "mixed")).toMatchObject({ costUsd: null, knownCostUsd: 3.94, pricedTokenCoverage: 2 / 3, unpricedModels: ["future-model"] });
    expect(rows.find((row) => row.key === "priced")).toMatchObject({ costUsd: 3.94, knownCostUsd: 3.94, pricedTokenCoverage: 1, unpricedModels: [] });
    expect(rows.find((row) => row.key === "unpriced")).toMatchObject({ costUsd: null, knownCostUsd: 0, pricedTokenCoverage: 0, unpricedModels: ["future-model"] });
    expect(rows.every((row) => row.costShare === null)).toBe(true);
    expect(rows.reduce((sum, row) => sum + row.tokenShare, 0)).toBeCloseTo(1);
  });

  it("applies custom local date bounds and all dimension filters before aggregation", () => {
    const start = new Date(2026, 7, 15);
    const end = new Date(2026, 7, 16);
    const report = reportWith([
      bucket({ bucketStart: start.toISOString(), totalTokens: 100, terminal: "CLI" }),
      bucket({ bucketStart: end.toISOString(), totalTokens: 900, terminal: "CLI" }),
      bucket({ bucketStart: new Date(start.getTime() - 1).toISOString(), totalTokens: 900, terminal: "CLI" }),
      bucket({ bucketStart: start.toISOString(), totalTokens: 900, terminal: "Desktop" }),
      bucket({ bucketStart: start.toISOString(), totalTokens: 900, terminal: "CLI", model: "future-model" }),
      bucket({ bucketStart: start.toISOString(), totalTokens: 900, terminal: "CLI", projectId: "excluded" }),
      bucket({ bucketStart: "invalid", totalTokens: 900, terminal: "CLI" }),
    ]);
    const range = { startDate: "2026-08-15", endDate: "2026-08-15" };
    const filters = { model: "gpt-5.6-sol", projectId: "p-quota-float", terminal: "CLI" };
    for (const dimension of ["project", "terminal"] as const) {
      const rows = buildUsageBreakdown(report, range, now, filters, dimension);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ totalTokens: 100, bucketCount: 1, tokenShare: 1, costShare: 1 });
      expect(rows[0].totalTokens).toBe(summarizeTokenReport(report, range, now, filters).current.totalTokens);
    }
    expect(buildUsageBreakdown(report, range, now, { projectId: "absent" })).toEqual([]);
    expect(buildUsageBreakdown(reportWith([]), "all", now)).toEqual([]);
  });

  it("returns deterministic labels and ordering when source bucket order changes", () => {
    const buckets = [
      bucket({ projectId: "p-b", project: "beta", totalTokens: 100 }),
      bucket({ projectId: "p-a", project: "alpha-renamed", totalTokens: 50 }),
      bucket({ projectId: "p-a", project: "alpha", totalTokens: 50 }),
    ];
    const rows = buildUsageBreakdown(reportWith(buckets), "24h", now);
    expect(rows.map((row) => row.key)).toEqual(["p-a", "p-b"]);
    expect(rows[0].label).toBe("alpha");
    expect(buildUsageBreakdown(reportWith([...buckets].reverse()), "24h", now)).toEqual(rows);
  });

  it("keeps known zero usage finite without treating an unpriced zero bucket as a known price", () => {
    const zero = bucket({ totalTokens: 0, inputTokens: 0, cachedInputTokens: 0, cacheWriteInputTokens: 0, outputTokens: 0, reasoningOutputTokens: 0, requests: 0 });
    const [known] = buildUsageBreakdown(reportWith([zero]), "24h", now);
    expect(known).toMatchObject({ totalTokens: 0, tokenShare: 0, costUsd: 0, costShare: 0 });
    const [unpriced] = buildUsageBreakdown(reportWith([{ ...zero, model: "future-model" }]), "24h", now);
    expect(unpriced).toMatchObject({ totalTokens: 0, tokenShare: 0, costUsd: null, knownCostUsd: 0, costShare: null });
  });
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

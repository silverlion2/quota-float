import { describe, expect, it } from "vitest";
import type { CodexTokenUsageReport } from "../types";
import { buildApiBudgetForecast, buildCurrentPeriodUsageReport, buildModelBreakdown, summarizeTokenReport } from "./tokenUsage";
import { buildPeriodUsageJson, buildPricingCatalogJson, buildUsageCsv, buildUsageJson, buildUsageShareSvg } from "./usageExport";

const report: CodexTokenUsageReport = {
  generatedAt: "2026-08-16T12:00:00Z",
  rangeDays: 90,
  scannedFiles: 1,
  indexedFiles: 1,
  reusedFiles: 0,
  incrementalFiles: 0,
  skippedFiles: 0,
  scannedBytes: 100,
  matchedEvents: 2,
  scanDurationMs: 10,
  cacheStatus: "rebuilt",
  truncated: false,
  buckets: [{
    bucketStart: "2026-08-16T02:00:00Z",
    model: "gpt-5.6-sol",
    contextTier: "short",
    project: "private-project-name",
    projectId: "p-secret-project-id",
    terminal: "Desktop",
    sessionKey: "secret-session-key",
    inputTokens: 1_000_000,
    cachedInputTokens: 600_000,
    cacheWriteInputTokens: 100_000,
    outputTokens: 100_000,
    reasoningOutputTokens: 40_000,
    totalTokens: 1_100_000,
    requests: 2,
  }],
};

describe("usage export", () => {
  it("exports anonymized CSV and JSON without session or project identifiers", () => {
    const now = new Date("2026-08-16T12:00:00Z");
    const csv = buildUsageCsv(report, "7d", {}, now);
    const json = buildUsageJson(report, "7d", {}, now);
    expect(csv).toContain("Project 1");
    expect(json).toContain("Project 1");
    expect(csv).not.toContain("private-project-name");
    expect(json).not.toContain("secret-session-key");
    expect(csv).not.toContain("p-secret-project-id");
    expect(json).not.toContain("p-secret-project-id");
    expect(csv).toContain("2026-09-07.1");
    expect(json).toContain('"verifiedAt": "2026-09-07"');
    expect(json).toContain('"pricingTier": "standard"');
    expect(json).toContain("including historical rows");
    expect(json).not.toContain("effectiveAt");
  });

  it("builds a standalone share card and versioned pricing catalog", () => {
    const now = new Date("2026-08-16T12:00:00Z");
    const summary = summarizeTokenReport(report, "7d", now).current;
    const models = buildModelBreakdown(report, "7d", now);
    const budget = buildApiBudgetForecast(summary, "7d", 500, now);
    const svg = buildUsageShareSvg(summary, models, budget, "7d", "zh-CN", now);
    expect(svg).toContain("<svg");
    expect(svg).toContain("API 等价费用");
    const catalog = buildPricingCatalogJson();
    expect(catalog).toContain('"schemaVersion": 2');
    expect(catalog).toContain('"model": "gpt-6-astra"');
    expect(catalog).toContain('"pricingTier": "standard"');
  });

  it("exports an aggregate period summary without project identity", () => {
    const now = new Date("2026-08-16T12:00:00Z");
    const json = buildPeriodUsageJson(buildCurrentPeriodUsageReport(report, "month", now, { projectId: "p-secret-project-id" }));

    expect(json).toContain('"reportType": "monthly_usage_summary"');
    expect(json).toContain('"apiEquivalentUsd"');
    expect(json).toContain('"unrecordedHours"');
    expect(json).toContain("idle or uncollected");
    expect(json).toContain('"projectFiltered": true');
    expect(json).toContain('"modelFiltered": false');
    expect(json).not.toContain("private-project-name");
    expect(json).not.toContain("p-secret-project-id");
    expect(json).not.toContain("secret-session-key");
  });
});

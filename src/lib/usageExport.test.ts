import { describe, expect, it } from "vitest";
import type { CodexTokenUsageReport } from "../types";
import { buildApiBudgetForecast, buildCurrentPeriodUsageReport, buildModelBreakdown, summarizeTokenReport } from "./tokenUsage";
import { buildPeriodUsageJson, buildPricingCatalogJson, buildUsageCsv, buildUsageJson, buildUsageMarkdown, buildUsageShareSvg } from "./usageExport";

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

  it("exports readable Markdown with anonymized dimensions and traceable estimates", () => {
    const markdown = buildUsageMarkdown(report, "7d", {}, new Date("2026-08-16T12:00:00Z"), "en");
    expect(markdown).toContain("# Quota Float · Local usage");
    expect(markdown).toContain("2026-08-09T12:00:00.000Z → 2026-08-16T12:00:00.000Z");
    expect(markdown).toContain("| gpt-5.6-sol | 1,100,000 | 1 | $3.940000 |");
    expect(markdown).toContain("| Project 1 | 1,100,000 | 1 | $3.940000 |");
    expect(markdown).toContain("Range hours recorded/unrecorded: 1 / 167");
    expect(markdown).toContain("2026-09-07.1");
    expect(markdown).toContain("not bills/subscriptions");
    expect(markdown).toContain("Reasoning (in output): 40,000");
    for (const privateValue of ["private-project-name", "p-secret-project-id", "secret-session-key"]) {
      expect(markdown).not.toContain(privateValue);
    }
  });

  it("applies range and all dimension filters before the Markdown summary and tables", () => {
    const filteredReport = {
      ...report,
      buckets: [
        ...report.buckets,
        { ...report.buckets[0], bucketStart: "2026-08-01T02:00:00Z", totalTokens: 800 },
        { ...report.buckets[0], bucketStart: "2026-08-16T12:00:00Z", totalTokens: 900 },
        { ...report.buckets[0], model: "gpt-5.6-luna", totalTokens: 200 },
        { ...report.buckets[0], projectId: "second-private-id", totalTokens: 300 },
        { ...report.buckets[0], terminal: "CLI", totalTokens: 400 },
      ],
    };
    const markdown = buildUsageMarkdown(filteredReport, "7d", { model: "gpt-5.6-sol", projectId: "p-secret-project-id", terminal: "Desktop" }, new Date("2026-08-16T12:00:00Z"), "en");
    expect(markdown).toContain("Model Filtered; Project Filtered; Terminal Filtered");
    expect(markdown).toContain("Token: 1,100,000;");
    expect(markdown).not.toContain("gpt-5.6-luna");
    expect(markdown).not.toContain("Project 2");
    expect(markdown).not.toContain("second-private-id");
  });

  it("reports incomplete indexing and unknown pricing without implying a zero bill", () => {
    const partialReport = {
      ...report, truncated: true, skippedFiles: 1,
      buckets: [...report.buckets, { ...report.buckets[0], model: "gpt-future", projectId: "another-private-project", sessionKey: "another-secret-session", totalTokens: 1_100_000 }],
    };
    const markdown = buildUsageMarkdown(partialReport, "7d", {}, new Date("2026-08-16T12:00:00Z"), "en");
    expect(markdown).toContain("API-equivalent cost: Priced subtotal $3.940000");
    expect(markdown).toContain("Priced Token: 50.0%");
    expect(markdown).toContain("| gpt-future | 1,100,000 | 1 | Unknown |");
    expect(markdown).toContain("Index truncated: Yes (partial)");
    expect(markdown).toContain("no records may be idle/uncollected");
    expect(markdown).toContain("| Project 1 |");
    expect(markdown).toContain("| Project 2 |");
    expect(markdown).not.toContain("another-private-project");
    expect(markdown).not.toContain("another-secret-session");
  });

  it("keeps custom date semantics and an empty summary explicit", () => {
    const now = new Date(2026, 7, 16, 12);
    const emptyReport = { ...report, buckets: [] };
    const markdown = buildUsageMarkdown(emptyReport, { startDate: "2026-08-15", endDate: "2026-08-16" }, {}, now);
    expect(markdown).toContain(`${new Date(2026, 7, 15).toISOString()} → ${now.toISOString()}`);
    expect(markdown).toContain("区间小时 记录/无记录: 0 / 36");
    expect(markdown).toContain("全索引区间: 未知 → 未知");
    expect(markdown).toContain("无记录≠零用量");
    expect(markdown).toContain("日期含结束日");
  });

  it("does not emit unsafe free-form metadata as Markdown or raw paths", () => {
    const unsafe = "C:\\private-account\\secret-model|\n<script>";
    const unsafeReport = { ...report, buckets: [{ ...report.buckets[0], model: unsafe, project: unsafe, terminal: unsafe, accountId: "private-account-id" }] };
    const markdown = buildUsageMarkdown(unsafeReport, "7d", { model: unsafe, terminal: unsafe }, new Date("2026-08-16T12:00:00Z"), "en");
    expect(markdown).toContain("| Unknown model 1 | 1,100,000 | 1 | Unknown |");
    expect(markdown).not.toContain("private-account");
    expect(markdown).not.toContain("<script>");
    expect(markdown).not.toContain("secret-session-key");
  });
});

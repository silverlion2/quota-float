import { describe, expect, it } from "vitest";
import type { CodexTokenUsageBucket, CodexTokenUsageReport } from "../types";
import { buildCodexBillingPlanComparison } from "./billingPlan";

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

const report = (buckets: CodexTokenUsageBucket[]): CodexTokenUsageReport => ({
  generatedAt: "2026-08-30T12:00:00Z",
  rangeDays: 90,
  scannedFiles: buckets.length,
  indexedFiles: buckets.length,
  reusedFiles: 0,
  incrementalFiles: 0,
  skippedFiles: 0,
  scannedBytes: 100,
  matchedEvents: buckets.length,
  scanDurationMs: 10,
  cacheStatus: "rebuilt",
  truncated: false,
  buckets,
});

describe("Codex billing plan comparison", () => {
  it("uses completed billing cycles for a keep recommendation", () => {
    const comparison = buildCodexBillingPlanComparison(report([
      bucket({ bucketStart: "2026-06-20T02:00:00Z", sessionKey: "baseline", totalTokens: 90_000_000, requests: 90 }),
      bucket({ bucketStart: "2026-07-20T02:00:00Z", sessionKey: "full-20x", totalTokens: 372_000_000, requests: 372 }),
      bucket({ bucketStart: "2026-08-20T02:00:00Z", sessionKey: "current-20x", totalTokens: 225_000_000, requests: 225 }),
    ]), "2026-07-15", new Date(2026, 7, 30, 12));

    expect(comparison).not.toBeNull();
    expect(comparison!.baseline.elapsedDays).toBe(30);
    expect(comparison!.latestCompleted20x?.elapsedDays).toBe(31);
    expect(comparison!.completedCycleRatio).toBe(4);
    expect(comparison!.currentCycleRatio).toBeCloseTo(4.84, 2);
    expect(comparison!.targetTokensPerDay).toBe(6_000_000);
    expect(comparison!.targetTokensPerWeek).toBe(42_000_000);
    expect(comparison!.recommendation).toBe("keep");
  });

  it("recommends downgrading only after a complete under-target cycle", () => {
    const comparison = buildCodexBillingPlanComparison(report([
      bucket({ bucketStart: "2026-06-20T02:00:00Z", sessionKey: "baseline", totalTokens: 90_000_000 }),
      bucket({ bucketStart: "2026-07-20T02:00:00Z", sessionKey: "full-20x", totalTokens: 279_000_000 }),
    ]), "2026-07-15", new Date(2026, 7, 30, 12), 4);

    expect(comparison?.completedCycleRatio).toBe(3);
    expect(comparison?.recommendation).toBe("downgrade");
  });

  it("keeps the recommendation pending before a full 20x cycle", () => {
    const comparison = buildCodexBillingPlanComparison(report([
      bucket({ bucketStart: "2026-06-20T02:00:00Z", sessionKey: "baseline", totalTokens: 90_000_000 }),
      bucket({ bucketStart: "2026-07-20T02:00:00Z", sessionKey: "partial-20x", totalTokens: 100_000_000 }),
    ]), "2026-07-15", new Date(2026, 6, 30, 12));

    expect(comparison?.completedCycleRatio).toBeNull();
    expect(comparison?.recommendation).toBe("pending");
  });
});

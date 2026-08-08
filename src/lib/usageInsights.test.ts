import { describe, expect, it } from "vitest";
import { buildUsageCalendar, recentQuotaTrend, usageSummary } from "./usageInsights";
import type { QuotaHistoryPoint } from "../types";

const history: QuotaHistoryPoint[] = [
  { provider: "codex", capturedAt: "2026-08-07T01:00:00Z", metric: 90, metricKind: "percent", status: "ok", resetsAt: "2026-08-12T00:00:00Z" },
  { provider: "codex", capturedAt: "2026-08-07T02:00:00Z", metric: 84, metricKind: "percent", status: "ok", resetsAt: "2026-08-12T00:00:00Z" },
  { provider: "codex", capturedAt: "2026-08-08T02:00:00Z", metric: 80, metricKind: "percent", status: "ok", resetsAt: "2026-08-12T00:00:00Z" },
];

describe("usage insights", () => {
  it("builds an honest 90-day calendar and recovers observed use from history", () => {
    const days = buildUsageCalendar([], history, "codex", new Date("2026-08-08T08:00:00Z"));
    expect(days).toHaveLength(90);
    expect(days.at(-1)?.observedUsedPercent).toBe(4);
    expect(usageSummary(days)).toEqual(expect.objectContaining({ activeDays: 2, observedUsedPercent: 10 }));
    expect(days[0].observedUsedPercent).toBeNull();
  });

  it("prefers persisted summaries when they contain more complete observation", () => {
    const days = buildUsageCalendar([{
      provider: "codex", localDate: "2026-08-08", observedUsedPercent: 11, sampleCount: 8, updatedAt: "2026-08-08T08:00:00Z",
    }], history, "codex", new Date("2026-08-08T08:00:00Z"));
    expect(days.at(-1)).toEqual(expect.objectContaining({ observedUsedPercent: 11, sampleCount: 8, level: 3 }));
  });

  it("returns recent remaining-quota points for the trajectory", () => {
    const points = recentQuotaTrend(history, "codex", 79, new Date("2026-08-08T08:00:00Z"));
    expect(points.at(-1)?.remainingPercent).toBe(79);
    expect(points.length).toBeGreaterThanOrEqual(2);
  });
});

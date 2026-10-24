import { describe, expect, it } from "vitest";
import type { QuotaHistoryPoint } from "../types";
import { priorKnownPlan } from "./quotaContinuity";

const history: readonly QuotaHistoryPoint[] = Object.freeze([
  { provider: "codex", plan: "PLUS", capturedAt: "2026-10-25T01:00:00Z", metric: 90, metricKind: "percent", resetsAt: null, status: "ok" },
  { provider: "codex", plan: null, capturedAt: "2026-10-25T02:00:00Z", metric: 80, metricKind: "percent", resetsAt: null, status: "ok" },
  { provider: "claude", plan: "Other", capturedAt: "2026-10-25T02:30:00Z", metric: 70, metricKind: "percent", resetsAt: null, status: "ok" },
  { provider: "codex", plan: "PRO", capturedAt: "2026-10-25T04:00:00Z", metric: 40, metricKind: "percent", resetsAt: null, status: "ok" },
]);

describe("prior known quota plan", () => {
  it("uses the previous matching provider's explicit plan before older history", () => {
    expect(priorKnownPlan({ provider: "codex", plan: "Team" }, history, "codex")).toBe("Team");
  });
  it("skips other providers, unknown and future samples without rewriting history", () => {
    expect(priorKnownPlan({ provider: "codex", plan: null }, history, "codex", Date.parse("2026-10-25T03:00:00Z"))).toBe("PLUS");
    expect(history[1].plan).toBeNull();
    expect(priorKnownPlan({ provider: "claude", plan: "Other" }, history, "codex")).toBe("PRO");
    expect(priorKnownPlan(null, history, "codex", Date.parse("2026-10-25T00:00:00Z"))).toBeNull();
    expect(priorKnownPlan(null, [], "codex")).toBeNull();
  });
});

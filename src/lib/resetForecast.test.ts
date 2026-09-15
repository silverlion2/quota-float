import { describe, expect, it } from "vitest";
import type { ResetForecast } from "../types";
import { freshResetForecast, resetSignalSummary } from "./resetForecast";

const now = new Date("2026-09-15T12:00:00Z");
const forecast: ResetForecast = { score: 66, windowHours: 48, fetchedAt: now.toISOString(), resetAnnounced: false, sourceUrl: "https://codex-reset.com/" };

describe("public reset evidence presentation", () => {
  it("suppresses a consensus number when reset baselines conflict or evidence is limited", () => {
    expect(resetSignalSummary({ ...forecast, quality: "conflicting" }, true)).toBe("Sources conflict · no estimate");
    expect(resetSignalSummary({ ...forecast, quality: "limited" }, false)).toBe("证据不足");
  });
  it("shows eligible source spread, without allowing excluded scores to inflate it", () => {
    const sources = [42, 51, 91].map((score, index) => ({ name: `source ${index}`, score, fetchedAt: now.toISOString(), sourceUrl: forecast.sourceUrl, included: index < 2 }));
    expect(resetSignalSummary({ ...forecast, quality: "consistent", sources }, true)).toBe("48h signal · 42–51/100");
  });
  it("rejects stale, future, malformed and mismatched-horizon forecasts", () => {
    expect(freshResetForecast(forecast, now)).toBe(forecast);
    for (const invalid of [
      { fetchedAt: "invalid" }, { fetchedAt: "2026-09-15T05:59:59Z" },
      { fetchedAt: "2026-09-15T12:05:01Z" }, { windowHours: 24 }, { score: NaN }, { score: 101 },
    ]) expect(freshResetForecast({ ...forecast, ...invalid }, now)).toBeNull();
  });
});

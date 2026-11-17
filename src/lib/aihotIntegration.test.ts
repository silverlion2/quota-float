import { describe, expect, it } from "vitest";
import { AIHOT_SIGNAL_LIMIT, aiHotEventKey, aiHotLocalProvider, buildAiHotActionAlerts, buildAiHotSignals, enabledAiHotProviders, markAiHotSignalsRead, matchesAiHotCreditProvider } from "./aihotIntegration";
import type { AiHotEvent, AiHotReport, AiHotSource } from "./aihot";

const now = new Date("2026-11-17T12:00:00Z");
const at = (hours: number) => new Date(now.getTime() + hours * 3600_000).toISOString();
const event: AiHotEvent = { id: "synthetic-public-1", title: "Reset credit", updatedAt: at(-1), status: "announced", scope: null, reportedAt: null, url: "https://aihot.news/codex-reset" };
const source: AiHotSource = { provider: "codex", status: "healthy", updatedAt: at(-0.1), sourceUrl: event.url, events: [event], error: null };
const report = (patch: Partial<AiHotSource> = {}): AiHotReport => ({ checkedAt: at(0), sources: [{ ...source, ...patch }] });
const options = { enabled: true, enabledProviders: ["codex", "claude", "antigravity"] as const };

describe("public AIHOT relevance and freshness", () => {
  it("maps supported monitors and hides disabled, hidden and paused platforms without inspecting login data", () => {
    expect(aiHotLocalProvider("grok-bot")).toBeNull();
    expect(buildAiHotSignals(report({ provider: "grok-bot" }), options, now)).toEqual([]);
    expect(buildAiHotSignals(report(), { ...options, enabled: false }, now)).toEqual([]);
    expect(buildAiHotSignals(report(), { ...options, enabledProviders: ["claude"] }, now)).toEqual([]);
    expect(enabledAiHotProviders({ hiddenProviders: ["codex"], pausedProviders: ["claude"] })).not.toEqual(expect.arrayContaining(["codex", "claude"]));
  });
  it.each(["stale", "unavailable"] as const)("does not use %s sources as active signals", status => {
    expect(buildAiHotSignals(report({ status }), options, now)).toEqual([]);
  });
  it("uses the verification watermark rather than a recent request timestamp", () => {
    for (const updatedAt of [null, at(-6), at(1), "2026-02-30T12:00:00Z", "2026-11-17", "not-a-date"]) {
      expect(buildAiHotSignals(report({ updatedAt }), options, now)).toEqual([]);
    }
  });
  it("expires without a new poll and provides a validity deadline distinct from quota deadlines", () => {
    const signal = buildAiHotSignals(report(), options, now)[0];
    expect(signal.expiresAt).toBe(at(5.9));
    expect(buildAiHotSignals(report(), options, new Date(at(5.9)))).toEqual([]);
    const alert = buildAiHotActionAlerts([signal], "en")[0];
    expect(alert.deadline).toBeNull();
    expect(alert.validUntil).toBe(signal.expiresAt);
  });
  it.each(["expired_unconfirmed", "likely_completed"] as const)("excludes %s inference from actionable reminders", status => {
    expect(buildAiHotSignals(report({ events: [{ ...event, status }] }), options, now)).toEqual([]);
  });
  it("keeps pending and unknown scope explicit without claiming account eligibility", () => {
    const signals = buildAiHotSignals(report(), options, now);
    expect(signals[0]).toMatchObject({ status: "pending", unread: true, event: { scope: null } });
    expect(buildAiHotActionAlerts(signals, "en")[0]).toMatchObject({ publicStatus: "pending", action: "aihot", severity: "notice", deadline: null });
    expect(buildAiHotActionAlerts(signals, "en")[0].detail).toContain("Eligibility was not specified");
    expect(buildAiHotActionAlerts(signals, "en")[0].detail).toContain("not confirmation of your account");
  });
  it("rejects expired/future event times and does not revive an old confirmation after an edit", () => {
    for (const updatedAt of [null, at(-168), at(1), "invalid"]) {
      expect(buildAiHotSignals(report({ events: [{ ...event, updatedAt }] }), options, now)).toEqual([]);
    }
    expect(buildAiHotSignals(report({ events: [{ ...event, status: "confirmed", reportedAt: at(-169) }] }), options, now)).toEqual([]);
    expect(buildAiHotSignals(report({ events: [{ ...event, status: "confirmed", reportedAt: at(1) }] }), options, now)).toEqual([]);
  });
  it("honors event exclusions and handles invalid clocks", () => {
    const key = aiHotEventKey("codex", event);
    expect(buildAiHotSignals(report(), { ...options, excludedEventKeys: [key] }, now)).toEqual([]);
    expect(buildAiHotSignals(report(), options, new Date(NaN))).toEqual([]);
  });
});

describe("stable public event read semantics", () => {
  it("bounds actionable signals before read filtering so marking 300 source events read cannot cycle older alerts", () => {
    const largeReport: AiHotReport = { checkedAt: at(0), sources: options.enabledProviders.map(provider => ({ ...source, provider,
      events: Array.from({ length: 100 }, (_, index) => ({ ...event, id: `synthetic-${provider}-${index}`, updatedAt: at(-index / 100) })) })) };
    const signals = buildAiHotSignals(largeReport, options, now);
    expect(signals).toHaveLength(AIHOT_SIGNAL_LIMIT);
    expect(largeReport.sources.flatMap(item => item.events)).toHaveLength(300);
    const readEventKeys = markAiHotSignalsRead([], signals);
    const repeated = buildAiHotSignals(largeReport, { ...options, readEventKeys }, now);
    expect(repeated.map(signal => signal.key)).toEqual(signals.map(signal => signal.key));
    expect(repeated.filter(signal => signal.unread)).toEqual([]);
    expect(buildAiHotActionAlerts(repeated, "en")).toEqual([]);
    const reversed = { ...largeReport, sources: [...largeReport.sources].reverse().map(item => ({ ...item, events: [...item.events].reverse() })) };
    expect(buildAiHotSignals(reversed, { ...options, readEventKeys }, now).map(signal => signal.key)).toEqual(signals.map(signal => signal.key));
  });
  it("does not create new unread events for repeated polls, edits or pending progress", () => {
    const first = buildAiHotSignals(report(), options, now);
    const readEventKeys = markAiHotSignalsRead([], first);
    const later = buildAiHotSignals(report({ updatedAt: at(0), events: [{ ...event, title: "Edited translation", updatedAt: at(0), status: "in_progress" }] }), { ...options, readEventKeys }, now);
    expect(later[0].key).toBe(first[0].key);
    expect(later[0].unread).toBe(false);
    expect(buildAiHotActionAlerts(later, "en")).toEqual([]);
  });
  it("a confirmation becomes unread once and ignores request timestamp churn", () => {
    const readEventKeys = markAiHotSignalsRead([], buildAiHotSignals(report(), options, now));
    const confirmed = { ...event, status: "confirmed" as const, reportedAt: at(-0.5) };
    const signals = buildAiHotSignals(report({ events: [confirmed] }), { ...options, readEventKeys }, now);
    expect(signals[0].unread).toBe(true);
    expect(buildAiHotSignals(report({ events: [confirmed] }), { ...options, readEventKeys: markAiHotSignalsRead(readEventKeys, signals) }, now)[0].unread).toBe(false);
  });
  it("deduplicates provider events, chooses newest metadata, and prefers confirmation over pending", () => {
    const confirmed = { ...event, status: "confirmed" as const, reportedAt: at(-0.5) };
    const signals = buildAiHotSignals(report({ events: [event, confirmed, { ...confirmed, updatedAt: at(-0.1), title: "Newest" }] }), options, now);
    expect(signals).toHaveLength(1);
    expect(signals[0].event.title).toBe("Newest");
    expect(aiHotEventKey("codex", event)).not.toBe(aiHotEventKey("claude", event));
    expect(aiHotEventKey("codex", { ...event, id: "synthetic-public-2" })).not.toBe(signals[0].key);
  });
  it("keeps long and Unicode IDs bounded for reminder persistence", () => {
    const key = aiHotEventKey("antigravity", { ...event, id: "长标识".repeat(50) });
    expect(`action:${key}`.length).toBeLessThan(160);
    expect(markAiHotSignalsRead(["invalid", "invalid"], [])).toEqual([]);
  });
  it("filters catalogue brands conservatively without fuzzy account inference", () => {
    expect(matchesAiHotCreditProvider(" OpenAI ", ["codex"])).toBe(true);
    expect(matchesAiHotCreditProvider("Anthropic", ["codex"])).toBe(false);
    expect(matchesAiHotCreditProvider("OpenAI-compatible relay", ["codex"])).toBe(false);
    expect(matchesAiHotCreditProvider("Google", ["antigravity"])).toBe(false);
    expect(matchesAiHotCreditProvider("火山方舟", ["volcengine"])).toBe(true);
  });
});

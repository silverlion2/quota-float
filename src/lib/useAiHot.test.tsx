// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAiHot, AIHOT_REFRESH_MS } from "./useAiHot";
import { DEFAULT_WIDGET_PREFERENCES as defaults, normalizeWidgetPreferences } from "./preferences";
import { EMPTY_RUNTIME_STATE, normalizeRuntimeState, runtimeStatesEqual } from "./activity";
import { fetchAiHotCredits, fetchAiHotResets } from "./bridge";
import type { AiHotCreditsReport, AiHotReport } from "./aihot";

vi.mock("./bridge", () => ({ fetchAiHotResets: vi.fn(), fetchAiHotCredits: vi.fn() }));
const now = new Date("2026-11-17T08:00:00Z");
const report: AiHotReport = { checkedAt: now.toISOString(), sources: [{ provider: "codex", status: "healthy", updatedAt: now.toISOString(), sourceUrl: "https://aihot.news/codex-reset", error: null,
  events: [{ id: "event", title: "Public announcement", status: "announced", scope: null, updatedAt: now.toISOString(), reportedAt: null, url: "https://aihot.news/codex-reset" }] }] };
const credits: AiHotCreditsReport = { status: "healthy", checkedAt: now.toISOString(), updatedAt: now.toISOString(), sourceUrl: "https://aihot.news/free-tokens", offers: [], error: null };
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); vi.mocked(fetchAiHotResets).mockReset().mockResolvedValue(report); vi.mocked(fetchAiHotCredits).mockReset().mockResolvedValue(credits); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
const flush = async () => { await act(async () => { await Promise.resolve(); }); };

describe("shared AIHOT monitoring", () => {
  it("does not request on app/panel mount by default; manual refresh is single-flight and cannot enable reminders", async () => {
    const { result } = renderHook(() => useAiHot(defaults, [], true));
    expect(fetchAiHotResets).not.toHaveBeenCalled();
    await act(async () => { await Promise.all([result.current.refresh(), result.current.refresh()]); });
    expect(fetchAiHotResets).toHaveBeenCalledTimes(1);
    expect(fetchAiHotCredits).toHaveBeenCalledTimes(1);
    expect(result.current.report).toEqual(report);
    expect(result.current.signals).toEqual([]);
  });
  it("waits for startup state, polls only while opted in, and reacts to disabled platforms/read state", async () => {
    const prefs = { ...defaults, aihotEnabled: true };
    const { result, rerender } = renderHook(({ ready, preferences, read }) => useAiHot(preferences, read, ready), { initialProps: { ready: false, preferences: prefs, read: [] as string[] } });
    expect(fetchAiHotResets).not.toHaveBeenCalled();
    rerender({ ready: true, preferences: prefs, read: [] }); await flush();
    expect(result.current.signals).toHaveLength(1);
    const key = result.current.signals[0].key;
    rerender({ ready: true, preferences: prefs, read: [key] });
    expect(result.current.signals[0].unread).toBe(false);
    rerender({ ready: true, preferences: { ...prefs, pausedProviders: ["codex"] }, read: [] });
    expect(result.current.signals).toEqual([]);
    await act(async () => { await vi.advanceTimersByTimeAsync(AIHOT_REFRESH_MS); });
    expect(fetchAiHotResets).toHaveBeenCalledTimes(2);
    rerender({ ready: true, preferences: { ...prefs, aihotEnabled: false }, read: [] });
    await act(async () => { await vi.advanceTimersByTimeAsync(AIHOT_REFRESH_MS * 2); });
    expect(fetchAiHotResets).toHaveBeenCalledTimes(2);
  });
  it("retains failed-source data as stale and stops its reminders while the catalogue still refreshes", async () => {
    const { result } = renderHook(() => useAiHot({ ...defaults, aihotEnabled: true }, [], true)); await flush();
    expect(result.current.signals).toHaveLength(1);
    vi.mocked(fetchAiHotResets).mockRejectedValueOnce(new Error("offline"));
    await act(async () => { await result.current.refresh(); });
    expect(result.current.report?.sources[0].events).toEqual(report.sources[0].events);
    expect(result.current.report?.sources[0].status).toBe("stale");
    expect(result.current.credits?.status).toBe("healthy");
    expect(result.current.signals).toEqual([]);
    expect(result.current.failed).toBe(true);
  });
  it("expires signals between network polls and supports recovery", async () => {
    vi.mocked(fetchAiHotResets).mockResolvedValue({ ...report, sources: [{ ...report.sources[0], updatedAt: new Date(now.getTime() - 6 * 3600_000 + 15_000).toISOString() }] });
    const { result } = renderHook(() => useAiHot({ ...defaults, aihotEnabled: true }, [], true)); await flush();
    expect(result.current.signals).toHaveLength(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(result.current.signals).toEqual([]);
    vi.mocked(fetchAiHotResets).mockResolvedValue(report);
    await act(async () => { await result.current.refresh(); });
    expect(result.current.signals).toHaveLength(1);
  });
});

it("migrates both AIHOT opt-ins safely and retains explicit choices through normalization", () => {
  expect(normalizeWidgetPreferences({})).toMatchObject({ aihotEnabled: false, aihotNotificationsEnabled: false });
  expect(normalizeWidgetPreferences({ aihotEnabled: true, aihotNotificationsEnabled: true })).toMatchObject({ aihotEnabled: true, aihotNotificationsEnabled: true });
  expect(normalizeWidgetPreferences({ aihotEnabled: "true", aihotNotificationsEnabled: 1 } as never)).toMatchObject({ aihotEnabled: false, aihotNotificationsEnabled: false });
});
it("persists read keys with bounds and detects read-state-only changes", () => {
  const state = normalizeRuntimeState({ ...EMPTY_RUNTIME_STATE, aihotReadKeys: [null, "bad", ...Array.from({ length: 300 }, (_, i) => `aihot:codex:${i}:pending`)] });
  expect(state.aihotReadKeys).toHaveLength(256);
  expect(normalizeRuntimeState(JSON.parse(JSON.stringify(state))).aihotReadKeys).toEqual(state.aihotReadKeys);
  expect(runtimeStatesEqual(state, { ...state, aihotReadKeys: [] })).toBe(false);
});

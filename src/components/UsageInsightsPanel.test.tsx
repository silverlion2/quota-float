// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_WIDGET_PREFERENCES } from "../lib/preferences";
import type { CodexTokenUsageReport, ProviderSnapshot } from "../types";

const mocks = vi.hoisted(() => ({
  fetchCodexProfileStats: vi.fn(async () => ({ fetchedAt: new Date().toISOString(), lifetimeTokens: 42_000_000_000, peakDailyTokens: null })),
  fetchCodexTokenUsage: vi.fn(),
  exportUsageData: vi.fn(),
  sendDesktopNotification: vi.fn(),
}));

vi.mock("../lib/bridge", () => ({
  fetchCodexProfileStats: mocks.fetchCodexProfileStats,
  fetchCodexTokenUsage: mocks.fetchCodexTokenUsage,
  exportUsageData: mocks.exportUsageData,
  sendDesktopNotification: mocks.sendDesktopNotification,
}));

import { UsageInsightsPanel } from "./UsageInsightsPanel";

afterEach(() => { cleanup(); vi.useRealTimers(); });

const snapshot = (provider: ProviderSnapshot["provider"]): ProviderSnapshot => ({
  provider,
  displayName: provider.toUpperCase(),
  plan: "PRO",
  shortWindow: null,
  weeklyWindow: null,
  resetCredits: null,
  updatedAt: new Date().toISOString(),
  status: "ok",
  message: null,
});

const report: CodexTokenUsageReport = {
  generatedAt: new Date().toISOString(),
  rangeDays: 90,
  scannedFiles: 1,
  indexedFiles: 1,
  reusedFiles: 0,
  incrementalFiles: 1,
  skippedFiles: 0,
  scannedBytes: 100,
  matchedEvents: 1,
  scanDurationMs: 1,
  cacheStatus: "incremental",
  truncated: false,
  buckets: [{
    bucketStart: new Date().toISOString(),
    model: "gpt-5.6-sol",
    contextTier: "short",
    project: "quota-float",
    projectId: "p-quota-float",
    terminal: "Desktop",
    sessionKey: "s-test",
    inputTokens: 1_000_000,
    cachedInputTokens: 0,
    cacheWriteInputTokens: 0,
    outputTokens: 100_000,
    reasoningOutputTokens: 0,
    totalTokens: 1_100_000,
    requests: 1,
  }],
};

function renderPanel(active: ProviderSnapshot) {
  return render(
    <UsageInsightsPanel
      snapshot={active}
      snapshots={[active]}
      history={[]}
      dailyUsage={[]}
      paceBaselines={{}}
      language="en"
      preferences={{ ...DEFAULT_WIDGET_PREFERENCES, language: "en" }}
    />,
  );
}

describe("UsageInsightsPanel token loading", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ignores a token report that resolves after leaving and returning to Codex", async () => {
    let finishFirst: (value: CodexTokenUsageReport) => void = () => undefined;
    let finishSecond: (value: CodexTokenUsageReport) => void = () => undefined;
    mocks.fetchCodexTokenUsage
      .mockImplementationOnce(() => new Promise<CodexTokenUsageReport>((resolve) => { finishFirst = resolve; }))
      .mockImplementationOnce(() => new Promise<CodexTokenUsageReport>((resolve) => { finishSecond = resolve; }));

    const view = renderPanel(snapshot("codex"));
    await vi.waitFor(() => expect(mocks.fetchCodexTokenUsage).toHaveBeenCalledTimes(1));

    view.rerender(
      <UsageInsightsPanel
        snapshot={snapshot("claude")}
        snapshots={[snapshot("claude")]}
        history={[]}
        dailyUsage={[]}
        paceBaselines={{}}
        language="en"
        preferences={{ ...DEFAULT_WIDGET_PREFERENCES, language: "en" }}
      />,
    );
    view.rerender(
      <UsageInsightsPanel
        snapshot={snapshot("codex")}
        snapshots={[snapshot("codex")]}
        history={[]}
        dailyUsage={[]}
        paceBaselines={{}}
        language="en"
        preferences={{ ...DEFAULT_WIDGET_PREFERENCES, language: "en" }}
      />,
    );
    await vi.waitFor(() => expect(mocks.fetchCodexTokenUsage).toHaveBeenCalledTimes(2));

    await act(async () => { finishFirst(report); });
    expect(screen.queryByRole("img", { name: "24H token usage trend" })).not.toBeInTheDocument();

    finishSecond(report);
    expect(await screen.findByRole("img", { name: "24H token usage trend" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cost" }));
    expect(screen.getByRole("img", { name: "24H API-equivalent cost trend" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Hourly API-equivalent cost heatmap" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Token" }));
    expect(screen.getByRole("img", { name: "Hourly token activity heatmap" })).toBeInTheDocument();
    expect(screen.getByText("42,000,000,000 Token")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(screen.getByText("42,000,000,000 Token")).toBeInTheDocument();
  });

  it("keeps the last applied range until a valid custom date range is applied", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 8, 17, 12));
    mocks.fetchCodexTokenUsage.mockResolvedValue({ ...report, buckets: [{ ...report.buckets[0], bucketStart: new Date(2026, 8, 17, 11).toISOString() }] });
    renderPanel(snapshot("codex"));
    await screen.findByRole("img", { name: "24H token usage trend" });

    fireEvent.click(screen.getByRole("button", { name: "Custom" }));
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-09-01" } });
    fireEvent.change(screen.getByLabelText("Through"), { target: { value: "2026-09-18" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(screen.getByRole("alert")).toHaveTextContent("1–366");
    expect(screen.getByRole("img", { name: "24H token usage trend" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-09-10" } });
    fireEvent.change(screen.getByLabelText("Through"), { target: { value: "2026-09-12" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(screen.getByRole("button", { name: "Custom" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("img", { name: "2026-09-10 → 2026-09-12 recorded quota remaining curve" })).toBeInTheDocument();
    expect(screen.getAllByText("No local Token records in this range and filter selection.")).toHaveLength(2);
    expect(screen.getByText("42,000,000,000 Token")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "24H" }));
    expect(screen.queryByLabelText("From")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "24H token usage trend" })).toBeInTheDocument();
  });

  it("limits historical quota samples to the selected dates and never substitutes today's quota", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 8, 17, 12));
    const active = { ...snapshot("claude"), weeklyWindow: { remainingPercent: 15, resetsAt: new Date(2026, 8, 20).toISOString(), windowSeconds: 604800 } };
    const history = [
      { provider: "claude" as const, capturedAt: new Date(2026, 8, 14, 12).toISOString(), metricKind: "percent" as const, metric: 80, resetsAt: active.weeklyWindow.resetsAt, status: "ok" as const },
      { provider: "claude" as const, capturedAt: new Date(2026, 8, 15, 0).toISOString(), metricKind: "percent" as const, metric: 50, resetsAt: active.weeklyWindow.resetsAt, status: "ok" as const },
    ];
    const view = render(<UsageInsightsPanel snapshot={active} snapshots={[active]} history={history} dailyUsage={[]} paceBaselines={{}} language="en" preferences={DEFAULT_WIDGET_PREFERENCES} />);
    fireEvent.click(screen.getByRole("button", { name: "Custom" }));
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-09-14" } });
    fireEvent.change(screen.getByLabelText("Through"), { target: { value: "2026-09-14" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    const card = view.container.querySelector(".usage-quota-trend-card")!;
    expect(card.querySelector("header strong")).toHaveTextContent("80%");
    expect(card.querySelectorAll(".quota-history-sample")).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-09-10" } });
    fireEvent.change(screen.getByLabelText("Through"), { target: { value: "2026-09-10" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(card.querySelector("header strong")).toHaveTextContent("—");
    expect(card.querySelectorAll(".quota-history-sample")).toHaveLength(0);
  });
});

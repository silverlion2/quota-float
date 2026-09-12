// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_WIDGET_PREFERENCES } from "../lib/preferences";
import type { CodexTokenUsageReport, ProviderSnapshot } from "../types";

const mocks = vi.hoisted(() => ({
  fetchCodexTokenUsage: vi.fn(),
  exportUsageData: vi.fn(),
  sendDesktopNotification: vi.fn(),
}));

vi.mock("../lib/bridge", () => ({
  fetchCodexTokenUsage: mocks.fetchCodexTokenUsage,
  exportUsageData: mocks.exportUsageData,
  sendDesktopNotification: mocks.sendDesktopNotification,
}));

import { UsageInsightsPanel } from "./UsageInsightsPanel";

afterEach(cleanup);

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
  });
});

// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_WIDGET_PREFERENCES } from "../lib/preferences";
import type { ProviderSnapshot, SnapshotCacheRead } from "../types";

const bridge = vi.hoisted(() => ({
  closeFocusPanel: vi.fn(),
  fetchSnapshots: vi.fn(),
  getPreferences: vi.fn(),
  listenFocusPanelUpdates: vi.fn(async (_callback: () => void) => () => undefined),
  readCachedSnapshots: vi.fn(),
  readFocusPanelHistory: vi.fn(),
  startFocusPanelDragging: vi.fn(),
}));

vi.mock("../lib/bridge", () => bridge);
// This suite verifies cache/history behavior; avoid loading the full icon catalog.
vi.mock("@phosphor-icons/react", () => ({ DotsSix: () => null, X: () => null }));
vi.mock("./QuotaCard", () => ({
  CockpitDashboard: ({ snapshot }: { snapshot: ProviderSnapshot }) => <div>snapshot:{snapshot.status}:{snapshot.message}</div>,
}));

const cachedSnapshot: ProviderSnapshot = {
  provider: "codex",
  displayName: "CODEX",
  plan: "PRO",
  shortWindow: null,
  weeklyWindow: { remainingPercent: 70, resetsAt: null, windowSeconds: 604_800 },
  resetCredits: null,
  updatedAt: "2026-09-07T00:00:00Z",
  status: "stale",
  message: "Cached quota data may be out of date.",
};

let FocusPanelApp: typeof import("./FocusPanelApp").FocusPanelApp;

beforeAll(async () => {
  window.history.replaceState({}, "", "/?focusPanel=overview&provider=codex");
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  });
  ({ FocusPanelApp } = await import("./FocusPanelApp"));
}, 30_000);

beforeEach(() => {
  vi.clearAllMocks();
  bridge.getPreferences.mockResolvedValue({ ...DEFAULT_WIDGET_PREFERENCES, pausedProviders: ["codex"] });
  bridge.readFocusPanelHistory.mockResolvedValue({ history: [], dailyUsage: [], dailyPaceBaselines: {} });
});

afterEach(cleanup);

describe("detached focus panel cache isolation", () => {
  it("shows stale last-known-good data for a paused provider without starting a refresh", async () => {
    bridge.readCachedSnapshots.mockResolvedValue({ snapshots: [cachedSnapshot], freshness: "stale", oldestAgeSeconds: 90 } satisfies SnapshotCacheRead);
    render(<FocusPanelApp />);

    expect(await screen.findByText(/snapshot:stale:Cached quota data/)).toBeInTheDocument();
    expect(bridge.readCachedSnapshots).toHaveBeenCalledWith(["codex"]);
    expect(bridge.readFocusPanelHistory).toHaveBeenCalledWith("codex", 90);
    expect(bridge.fetchSnapshots).not.toHaveBeenCalled();
  });

  it("reports an explicit empty-cache state", async () => {
    bridge.readCachedSnapshots.mockResolvedValue({ snapshots: [], freshness: "empty", oldestAgeSeconds: null } satisfies SnapshotCacheRead);
    render(<FocusPanelApp />);

    expect(await screen.findByRole("alert")).toHaveTextContent("No cached quota data yet");
    expect(bridge.fetchSnapshots).not.toHaveBeenCalled();
  });

  it("keeps the newest cache result when an earlier reload resolves late", async () => {
    let notify: (() => void) | undefined;
    let resolveInitial: (value: SnapshotCacheRead) => void = () => undefined;
    const initialCache = new Promise<SnapshotCacheRead>((resolve) => { resolveInitial = resolve; });
    const freshSnapshot = { ...cachedSnapshot, status: "ok" as const, message: "Fresh cache" };
    bridge.readCachedSnapshots
      .mockImplementationOnce(() => initialCache)
      .mockResolvedValueOnce({ snapshots: [freshSnapshot], freshness: "fresh", oldestAgeSeconds: 1 } satisfies SnapshotCacheRead);
    bridge.listenFocusPanelUpdates.mockImplementation(async (callback: () => void) => {
      notify = callback;
      return () => undefined;
    });

    render(<FocusPanelApp />);
    await waitFor(() => expect(notify).toBeDefined());
    act(() => notify?.());

    expect(await screen.findByText("snapshot:ok:Fresh cache")).toBeInTheDocument();
    resolveInitial({ snapshots: [cachedSnapshot], freshness: "stale", oldestAgeSeconds: 90 });
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText("snapshot:ok:Fresh cache")).toBeInTheDocument();
  });
});

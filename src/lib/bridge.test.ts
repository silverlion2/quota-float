import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_RUNTIME_STATE } from "./activity";
import {
  applyAppData,
  createSnapshotRefreshRequestId,
  fetchCodexResetForecast,
  fetchCodexProfileStats,
  fetchSnapshots,
  fetchSnapshotsProgressively,
  fetchCodexTokenUsage,
  fetchCodexExtensions,
  getVolcengineDiagnostics,
  getWidgetContentHeightLimit,
  listenDesktopEvents,
  notifyFocusPanels,
  openFocusPanel,
  readCachedSnapshots,
  readFocusPanelHistory,
  reconnectVolcengine,
  resizeWidgetToContent,
  setWidgetExpanded,
  startDragging,
  syncTaskbarIndicator,
  updatePreferences,
  updateRuntimeState,
  usesSyntheticData,
  sendDesktopNotification,
} from "./bridge";
import { DEFAULT_WIDGET_PREFERENCES } from "./preferences";
import { createPreviewResetForecast } from "./resetForecastPreview";

const api = vi.hoisted(() => ({
  calls: [] as string[],
  invoke: vi.fn(async (command: string, _args?: unknown): Promise<unknown> => {
    api.calls.push(`start:${command}`);
    await Promise.resolve();
    api.calls.push(`end:${command}`);
    return undefined;
  }),
  currentMonitor: vi.fn(async () => ({
    scaleFactor: 1,
    workArea: { position: { x: 0, y: 0 }, size: { width: 1920, height: 1040 } },
  })),
  currentWindow: {
    startDragging: vi.fn(async () => undefined),
    outerPosition: vi.fn(async () => ({ x: 12, y: 24 })),
  },
}));
const events = vi.hoisted(() => ({ listen: vi.fn() }));
const notification = vi.hoisted(() => ({ isPermissionGranted: vi.fn(async () => true), requestPermission: vi.fn(async () => "granted") }));
vi.mock("@tauri-apps/plugin-notification", () => notification);

vi.mock("@tauri-apps/api/core", () => ({ invoke: api.invoke }));
vi.mock("@tauri-apps/api/window", () => ({ currentMonitor: api.currentMonitor, getCurrentWindow: () => api.currentWindow }));
vi.mock("@tauri-apps/api/event", () => ({ listen: events.listen }));

beforeEach(() => {
  vi.clearAllMocks();
  api.calls.length = 0;
  events.listen.mockReset();
  vi.stubGlobal("window", { __TAURI_INTERNALS__: {}, setInterval, clearInterval });
  vi.stubEnv("VITE_WDIO", "0");
});

afterEach(() => vi.unstubAllEnvs());

describe("widget transitions", () => {
  it("awaits the native notification submission and propagates failure", async () => {
    api.invoke.mockRejectedValueOnce(new Error("OS submission failed"));
    await expect(sendDesktopNotification("Reminder", "Action", false)).rejects.toThrow("OS submission failed");
    expect(api.invoke).toHaveBeenCalledWith("plugin:notification|notify", { options: { title: "Reminder", body: "Action" } });
  });
  it("does not prompt from background checks or send synthetic fixture notifications", async () => {
    notification.isPermissionGranted.mockResolvedValueOnce(false);
    await expect(sendDesktopNotification("Reminder", "Action", false)).resolves.toBe(false);
    expect(notification.requestPermission).not.toHaveBeenCalled();
    expect(api.invoke).not.toHaveBeenCalled();
    vi.stubEnv("VITE_WDIO", "1");
    await expect(sendDesktopNotification("Fixture", "Synthetic")).resolves.toBe(false);
    expect(api.invoke).not.toHaveBeenCalled();
  });
  it.each([
    ["snapshots", () => fetchSnapshots()],
    ["progressive snapshots", () => fetchSnapshotsProgressively("production-browser", undefined, vi.fn())],
    ["cached snapshots", () => readCachedSnapshots()],
    ["reset forecast", () => fetchCodexResetForecast()],
    ["token usage", () => fetchCodexTokenUsage()],
    ["account Profile", () => fetchCodexProfileStats()],
    ["extensions", () => fetchCodexExtensions()],
    ["Volcengine diagnostics", () => getVolcengineDiagnostics()],
    ["Volcengine reconnect", () => reconnectVolcengine()],
  ] as const)("rejects production browser %s access instead of showing synthetic success", async (_name, read) => {
    vi.stubGlobal("window", {});
    vi.stubEnv("DEV", false);
    expect(usesSyntheticData()).toBe(false);
    await expect(read()).rejects.toThrow("Browser access is unsupported");
    expect(api.invoke).not.toHaveBeenCalled();
    expect(events.listen).not.toHaveBeenCalled();
  });

  it("retains isolated WDIO fixtures when DEV is false", async () => {
    vi.stubEnv("DEV", false);
    vi.stubEnv("VITE_WDIO", "1");
    expect(usesSyntheticData()).toBe(true);
    expect(await fetchSnapshots()).toEqual(expect.arrayContaining([expect.objectContaining({ provider: "codex", plan: "PRO" })]));
    expect(await fetchCodexResetForecast()).toMatchObject({ prediction: { estimate24h: 19, estimate48h: 34 } });
    expect((await fetchCodexTokenUsage()).buckets.length).toBeGreaterThan(0);
    expect(api.invoke).not.toHaveBeenCalled();
  });

  it("keeps production desktop reads on the native bridge", async () => {
    vi.stubEnv("DEV", false);
    expect(usesSyntheticData()).toBe(false);
    await fetchCodexResetForecast();
    expect(api.invoke).toHaveBeenCalledWith("get_codex_reset_forecast");
  });

  it("keeps native E2E provider reads on isolated synthetic data", async () => {
    vi.stubEnv("VITE_WDIO", "1");

    const snapshots = await fetchSnapshots(true, ["codex"]);
    const cached = await readCachedSnapshots(["codex"]);
    const forecast = await fetchCodexResetForecast();
    const profile = await fetchCodexProfileStats();
    const usage = await fetchCodexTokenUsage(true, true);
    const extensions = await fetchCodexExtensions();
    const diagnostics = await getVolcengineDiagnostics();
    const reconnected = await reconnectVolcengine();

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({ provider: "codex", displayName: "CODEX", plan: "PRO" });
    expect(cached).toMatchObject({ freshness: "fresh", snapshots: [{ provider: "codex" }] });
    expect(forecast).toMatchObject({ confidence: "low", sourceCount: 1, quality: "conflicting", prediction: { basis: "source_model", estimate24h: 19, estimate48h: 34, calibration: "experimental" } });
    expect(profile).toMatchObject({ lifetimeTokens: 42_000_000_000, peakDailyTokens: 1_200_000_000 });
    expect(usage.buckets.length).toBeGreaterThan(0);
    expect(extensions).toMatchObject({ status: "ok", entries: [{ name: "example-docs" }, { name: "example-browser" }, { name: "example-review" }, { name: "example-design@local" }] });
    expect(diagnostics).toMatchObject({ authenticated: true, profileName: "coding-plan_personal" });
    expect(reconnected).toEqual(diagnostics);
    expect(api.invoke).not.toHaveBeenCalled();
  });

  it("uses the same synthetic primary prediction in browser mode without invoking native reads", async () => {
    vi.stubGlobal("window", {});
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-10-14T11:35:00Z"));
      const forecast = await fetchCodexResetForecast();
      expect(forecast).toMatchObject({
        score: 34, fetchedAt: "2026-10-14T11:35:00.000Z", resetAnnounced: false,
        expectedAt: null, sourceCount: 1, quality: "conflicting",
        prediction: {
          sourceName: "Codex Reset", basis: "source_model", estimate24h: 19, estimate48h: 34,
          generatedAt: "2026-10-14T11:35:00.000Z", validUntil: "2026-10-16T11:35:00.000Z",
          range48h: { lower: 21.8, upper: 48.7 }, confidence: "low", expectedWindow: null,
          watchWindow: { startAt: "2026-10-15T03:00:00.000Z", endAt: "2026-10-15T06:00:00.000Z" },
        },
      });
      expect(forecast?.sources?.filter((source) => source.included)).toHaveLength(1);
      expect(forecast?.sources?.filter((source) => source.included === false).map((source) => source.score)).toEqual([50, 94]);
      expect(forecast?.exclusions).toHaveLength(2);
      expect(api.invoke).not.toHaveBeenCalled();
      vi.setSystemTime(new Date("2026-10-15T07:00:00Z"));
      expect(forecast?.prediction?.watchWindow?.endAt).toBe("2026-10-15T06:00:00.000Z");
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the preview watch window in UTC and independent of other fixture objects", () => {
    const first = createPreviewResetForecast(new Date("2026-10-14T01:00:00Z"));
    const next = createPreviewResetForecast(new Date("2026-10-14T07:00:00Z"));
    expect(first.prediction?.watchWindow).toEqual({ startAt: "2026-10-14T03:00:00.000Z", endAt: "2026-10-14T06:00:00.000Z" });
    expect(next.prediction?.watchWindow).toEqual({ startAt: "2026-10-15T03:00:00.000Z", endAt: "2026-10-15T06:00:00.000Z" });
    expect(first.sources?.[0].lastResetAt).toBe(first.prediction?.reportedLastResetAt);
    expect(first.fetchedAt).toBe(first.prediction?.generatedAt);
    expect(first.sources?.[1].lastResetAt).not.toBe(first.sources?.[0].lastResetAt);
  });

  it("keeps the live reset forecast behind the native command boundary", async () => {
    await fetchCodexResetForecast();
    expect(api.invoke).toHaveBeenCalledWith("get_codex_reset_forecast");
  });

  it("reads extensions through a native command without passing local paths", async () => {
    await fetchCodexExtensions();
    expect(api.invoke).toHaveBeenCalledWith("fetch_codex_extensions");
  });

  it("reads account Profile stats only through the native bridge", async () => {
    await fetchCodexProfileStats();
    expect(api.invoke).toHaveBeenCalledWith("get_codex_profile_stats");
  });

  it("passes the monitor work area to the Rust expansion command", async () => {
    await setWidgetExpanded(true);
    expect(api.invoke).toHaveBeenCalledWith("expand_widget", {
      workArea: { position: { x: 0, y: 0 }, size: { width: 1920, height: 1040 } },
      compactLayout: "float",
      barEdge: "top",
      barOffset: 0.5,
      compactProviderCount: 1,
    });
  });

  it("passes bar sizing intent to both transition commands", async () => {
    await setWidgetExpanded(true, "bar", { edge: "right", offset: 0.75 });
    await setWidgetExpanded(false, "bar", { edge: "right", offset: 0.75 });
    const placement = expect.objectContaining({ compactLayout: "bar", barEdge: "right", barOffset: 0.75 });
    expect(api.invoke).toHaveBeenCalledWith("expand_widget", placement);
    expect(api.invoke).toHaveBeenCalledWith("collapse_widget", placement);
  });

  it("passes actual visible provider counts and clamps invalid geometry inputs", async () => {
    await setWidgetExpanded(false, "bar", { edge: "left", offset: 0.5 }, 2);
    expect(api.invoke).toHaveBeenLastCalledWith("collapse_widget", expect.objectContaining({ compactProviderCount: 2 }));
    await setWidgetExpanded(true, "bottleneck", { edge: "right", offset: 0.5 }, 99);
    expect(api.invoke).toHaveBeenLastCalledWith("expand_widget", expect.objectContaining({ compactProviderCount: 7 }));
  });

  it("syncs only the active provider identity for the native taskbar indicator", async () => {
    await syncTaskbarIndicator("codex");
    await syncTaskbarIndicator(null);
    expect(api.invoke).toHaveBeenNthCalledWith(1, "sync_taskbar_indicator", { provider: "codex" });
    expect(api.invoke).toHaveBeenNthCalledWith(2, "sync_taskbar_indicator", { provider: null });
  });

  it("returns the magnetic placement resolved by Rust after drag stability", async () => {
    api.invoke.mockImplementation(async (command: string) => {
      api.calls.push(`start:${command}`);
      api.calls.push(`end:${command}`);
      return command === "finish_widget_drag" ? { edge: "left", offset: 0.25 } : undefined;
    });
    await expect(startDragging()).resolves.toEqual({ edge: "left", offset: 0.25 });
    expect(api.invoke).toHaveBeenCalledWith("finish_widget_drag", {
      workArea: { position: { x: 0, y: 0 }, size: { width: 1920, height: 1040 } },
    });
  });

  it("serializes rapid expand and collapse requests", async () => {
    await Promise.all([setWidgetExpanded(true), setWidgetExpanded(false)]);
    expect(api.calls).toEqual([
      "start:expand_widget",
      "end:expand_widget",
      "start:collapse_widget",
      "end:collapse_widget",
    ]);
  });

  it("passes measured content height and monitor bounds to the resize command", async () => {
    await resizeWidgetToContent(213.4);
    expect(api.invoke).toHaveBeenCalledWith("resize_expanded_widget", {
      contentHeight: 213.4,
      workArea: { position: { x: 0, y: 0 }, size: { width: 1920, height: 1040 } },
    });
  });

  it.each([
    [1020, 1.5, 680],
    [1080, 2, 540],
    [4000, 1, 1192],
  ])("uses physical work-area height %s at scale %s for the logical card cap", async (height, scaleFactor, expected) => {
    api.currentMonitor.mockResolvedValueOnce({ scaleFactor, workArea: { position: { x: 0, y: 0 }, size: { width: 1920, height } } });
    expect(await getWidgetContentHeightLimit()).toBe(expected);
    expect(api.invoke).not.toHaveBeenCalled();
  });

  it("does not manufacture monitor limits in the browser or on a failed native query", async () => {
    vi.stubGlobal("window", {});
    expect(await getWidgetContentHeightLimit()).toBeNull();
    expect(api.currentMonitor).not.toHaveBeenCalled();
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
    api.currentMonitor.mockRejectedValueOnce(new Error("monitor unavailable"));
    expect(await getWidgetContentHeightLimit()).toBeNull();
  });

  it("ignores invalid content heights", async () => {
    await resizeWidgetToContent(Number.NaN);
    await resizeWidgetToContent(0);
    expect(api.invoke).not.toHaveBeenCalled();
  });

  it("passes both content dimensions through the serialized window transition", async () => {
    await Promise.all([setWidgetExpanded(true), resizeWidgetToContent(420, 360)]);
    expect(api.invoke).toHaveBeenLastCalledWith("resize_expanded_widget", {
      contentHeight: 420,
      contentWidth: 360,
      workArea: { position: { x: 0, y: 0 }, size: { width: 1920, height: 1040 } },
    });
    expect(api.calls).toEqual([
      "start:expand_widget", "end:expand_widget",
      "start:resize_expanded_widget", "end:resize_expanded_widget",
    ]);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, 0, -10])("omits invalid width %s while allowing height updates", async (width) => {
    await resizeWidgetToContent(420, width);
    expect(api.invoke).toHaveBeenCalledWith("resize_expanded_widget", {
      contentHeight: 420,
      workArea: { position: { x: 0, y: 0 }, size: { width: 1920, height: 1040 } },
    });
  });

  it("uses dedicated redacted diagnostics and reconnect commands", async () => {
    await getVolcengineDiagnostics();
    await reconnectVolcengine();
    expect(api.invoke).toHaveBeenCalledWith("get_volcengine_diagnostics");
    expect(api.invoke).toHaveBeenCalledWith("reconnect_volcengine");
  });

  it("opens and refreshes detached panels through bounded native commands", async () => {
    await openFocusPanel("pace", "codex");
    await notifyFocusPanels();
    expect(api.invoke).toHaveBeenCalledWith("open_focus_panel", { region: "pace", provider: "codex" });
    expect(api.invoke).toHaveBeenCalledWith("notify_focus_panels");
  });

  it("requests the bounded Codex token metadata report with an explicit refresh flag", async () => {
    await fetchCodexTokenUsage(true);
    expect(api.invoke).toHaveBeenCalledWith("get_codex_token_usage", { force: true, rebuild: false });
    await fetchCodexTokenUsage(true, true);
    expect(api.invoke).toHaveBeenCalledWith("get_codex_token_usage", { force: true, rebuild: true });
  });

  it("passes targeted provider refreshes to the native command", async () => {
    const unlisten = vi.fn();
    events.listen.mockResolvedValueOnce(unlisten);
    await fetchSnapshots(false, ["codex", "antigravity"]);
    expect(api.invoke).toHaveBeenCalledWith("refresh_snapshots", {
      requestId: expect.stringMatching(/^refresh-[a-z0-9]+-[a-z0-9]+$/),
      providerIds: ["codex", "antigravity"],
    });
    expect(unlisten).toHaveBeenCalledOnce();
  });

  it("delivers current provider results once and ignores stale or duplicate events", async () => {
    let progressHandler: ((event: { payload: unknown }) => void) | null = null;
    const unlisten = vi.fn();
    events.listen.mockImplementationOnce(async (eventName: string, handler: (event: { payload: unknown }) => void) => {
      expect(eventName).toBe("snapshot-refresh-progress");
      progressHandler = handler;
      return unlisten;
    });
    const snapshot = (provider: "codex" | "antigravity") => ({
      provider,
      displayName: provider.toUpperCase(),
      plan: null,
      shortWindow: null,
      weeklyWindow: null,
      resetCredits: null,
      updatedAt: "2026-09-08T00:00:00Z",
      status: "ok" as const,
      message: null,
    });
    api.invoke.mockImplementationOnce(async (_command: string, args: unknown) => {
      const requestId = (args as { requestId: string }).requestId;
      const requestedProviderIds = ["codex", "antigravity"];
      const emit = progressHandler as unknown as (event: { payload: unknown }) => void;
      emit({ payload: { requestId: "stale-request", requestedProviderIds, providerId: "codex", snapshots: [snapshot("codex")] } });
      emit({ payload: { requestId, requestedProviderIds, providerId: "codex", snapshots: [snapshot("codex")] } });
      emit({ payload: { requestId, requestedProviderIds, providerId: "codex", snapshots: [snapshot("codex")] } });
      emit({ payload: { requestId, requestedProviderIds, providerId: "antigravity", snapshots: [snapshot("antigravity")] } });
      return [snapshot("codex"), snapshot("antigravity")];
    });
    const onProgress = vi.fn();
    const requestId = createSnapshotRefreshRequestId();

    const values = await fetchSnapshotsProgressively(requestId, ["codex", "antigravity"], onProgress);

    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress.mock.calls.map(([progress]) => progress.providerId)).toEqual(["codex", "antigravity"]);
    expect(values.map((value) => value.provider)).toEqual(["codex", "antigravity"]);
    expect(unlisten).toHaveBeenCalledOnce();
  });

  it("reads detached-panel data only from the native snapshot cache", async () => {
    await readCachedSnapshots(["codex"]);
    expect(api.invoke).toHaveBeenCalledWith("get_cached_snapshots", { providerIds: ["codex"] });
    expect(api.invoke).toHaveBeenCalledTimes(1);
  });

  it("requests only one provider's bounded detached-panel history", async () => {
    api.invoke.mockResolvedValueOnce({
      history: [
        { provider: "codex", capturedAt: "2026-09-07T00:00:00Z", metric: 75, metricKind: "percent", status: "ok", resetsAt: null },
        { provider: "codex", capturedAt: "invalid", metric: "unsafe" },
      ],
      dailyUsage: [],
      dailyPaceBaselines: {},
    });
    const result = await readFocusPanelHistory("codex", 90);
    expect(api.invoke).toHaveBeenCalledWith("get_focus_panel_history", { provider: "codex", rangeDays: 90 });
    expect(api.invoke).toHaveBeenCalledTimes(1);
    expect(result.history).toHaveLength(1);
  });

  it("serializes rapid preference writes so the newest state cannot be overwritten", async () => {
    let releaseFirst: () => void = () => undefined;
    const firstWrite = new Promise<void>((resolve) => { releaseFirst = resolve; });
    api.invoke.mockImplementationOnce(async (command: string) => {
      api.calls.push(`start:${command}`);
      await firstWrite;
      api.calls.push(`end:${command}`);
    });
    const first = updatePreferences({ ...DEFAULT_WIDGET_PREFERENCES, alertThreshold: 20 });
    const second = updatePreferences({ ...DEFAULT_WIDGET_PREFERENCES, alertThreshold: 10 });
    await vi.waitFor(() => expect(api.invoke).toHaveBeenCalled());
    expect(api.invoke).toHaveBeenCalledTimes(1);
    releaseFirst();
    await Promise.all([first, second]);
    expect(api.calls).toEqual([
      "start:set_preferences",
      "end:set_preferences",
      "start:set_preferences",
      "end:set_preferences",
    ]);
  });

  it("serializes runtime writes so older state cannot overwrite newer state", async () => {
    let releaseFirst: () => void = () => undefined;
    const firstWrite = new Promise<void>((resolve) => { releaseFirst = resolve; });
    api.invoke.mockImplementationOnce(async (command: string) => {
      api.calls.push(`start:${command}`);
      await firstWrite;
      api.calls.push(`end:${command}`);
    });
    const first = updateRuntimeState({ ...EMPTY_RUNTIME_STATE, lastNotifications: { first: "2026-07-22T00:00:00Z" } });
    const second = updateRuntimeState({ ...EMPTY_RUNTIME_STATE, lastNotifications: { second: "2026-07-22T00:00:01Z" } });
    await vi.waitFor(() => expect(api.invoke).toHaveBeenCalledTimes(1));
    releaseFirst();
    await Promise.all([first, second]);
    expect(api.calls).toEqual([
      "start:set_runtime_state",
      "end:set_runtime_state",
      "start:set_runtime_state",
      "end:set_runtime_state",
    ]);
  });

  it("restores settings and runtime data through one native transaction", async () => {
    const preferences = { ...DEFAULT_WIDGET_PREFERENCES, alertThreshold: 12 };
    const runtimeState = { ...EMPTY_RUNTIME_STATE, lastNotifications: { restored: "2026-08-22T00:00:00Z" } };
    await applyAppData(preferences, runtimeState);
    expect(api.invoke).toHaveBeenCalledWith("apply_app_data", { preferences, runtimeState });
  });

  it("removes listeners registered before a later registration fails", async () => {
    const unlistenPreferences = vi.fn();
    events.listen
      .mockResolvedValueOnce(unlistenPreferences)
      .mockRejectedValueOnce(new Error("listener unavailable"));
    await expect(listenDesktopEvents({ onPreferences: vi.fn(), onRefresh: vi.fn(), onUpdate: vi.fn() })).rejects.toThrow("listener unavailable");
    expect(unlistenPreferences).toHaveBeenCalledOnce();
  });

  it("forwards taskbar open requests and removes every desktop listener", async () => {
    const listeners = new Map<string, () => void>();
    const unlisteners = [vi.fn(), vi.fn(), vi.fn(), vi.fn()];
    events.listen.mockImplementation(async (eventName: string, handler: () => void) => {
      listeners.set(eventName, handler);
      return unlisteners[listeners.size - 1];
    });
    const onShow = vi.fn();

    const cleanupListeners = await listenDesktopEvents({ onPreferences: vi.fn(), onRefresh: vi.fn(), onUpdate: vi.fn(), onShow });
    listeners.get("taskbar-open-requested")?.();
    cleanupListeners();

    expect(onShow).toHaveBeenCalledOnce();
    expect([...listeners.keys()]).toEqual(["preferences-changed", "refresh-requested", "update-check-requested", "taskbar-open-requested"]);
    for (const unlisten of unlisteners) expect(unlisten).toHaveBeenCalledOnce();
  });
});

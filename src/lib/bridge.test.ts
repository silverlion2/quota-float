import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_RUNTIME_STATE } from "./activity";
import {
  applyAppData,
  fetchCodexTokenUsage,
  getVolcengineDiagnostics,
  listenDesktopEvents,
  reconnectVolcengine,
  resizeWidgetToContent,
  setWidgetExpanded,
  startDragging,
  updatePreferences,
  updateRuntimeState,
} from "./bridge";
import { DEFAULT_WIDGET_PREFERENCES } from "./preferences";

const api = vi.hoisted(() => ({
  calls: [] as string[],
  invoke: vi.fn(async (command: string): Promise<unknown> => {
    api.calls.push(`start:${command}`);
    await Promise.resolve();
    api.calls.push(`end:${command}`);
    return undefined;
  }),
  currentMonitor: vi.fn(async () => ({
    workArea: { position: { x: 0, y: 0 }, size: { width: 1920, height: 1040 } },
  })),
  currentWindow: {
    startDragging: vi.fn(async () => undefined),
    outerPosition: vi.fn(async () => ({ x: 12, y: 24 })),
  },
}));
const events = vi.hoisted(() => ({ listen: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ invoke: api.invoke }));
vi.mock("@tauri-apps/api/window", () => ({ currentMonitor: api.currentMonitor, getCurrentWindow: () => api.currentWindow }));
vi.mock("@tauri-apps/api/event", () => ({ listen: events.listen }));

beforeEach(() => {
  vi.clearAllMocks();
  api.calls.length = 0;
  events.listen.mockReset();
  vi.stubGlobal("window", { __TAURI_INTERNALS__: {}, setInterval, clearInterval });
});

describe("widget transitions", () => {
  it("passes the monitor work area to the Rust expansion command", async () => {
    await setWidgetExpanded(true);
    expect(api.invoke).toHaveBeenCalledWith("expand_widget", {
      workArea: { position: { x: 0, y: 0 }, size: { width: 1920, height: 1040 } },
      compactLayout: "float",
      barEdge: "top",
      barOffset: 0.5,
    });
  });

  it("passes bar sizing intent to both transition commands", async () => {
    await setWidgetExpanded(true, "bar", { edge: "right", offset: 0.75 });
    await setWidgetExpanded(false, "bar", { edge: "right", offset: 0.75 });
    const placement = expect.objectContaining({ compactLayout: "bar", barEdge: "right", barOffset: 0.75 });
    expect(api.invoke).toHaveBeenCalledWith("expand_widget", placement);
    expect(api.invoke).toHaveBeenCalledWith("collapse_widget", placement);
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

  it("ignores invalid content heights", async () => {
    await resizeWidgetToContent(Number.NaN);
    await resizeWidgetToContent(0);
    expect(api.invoke).not.toHaveBeenCalled();
  });

  it("uses dedicated redacted diagnostics and reconnect commands", async () => {
    await getVolcengineDiagnostics();
    await reconnectVolcengine();
    expect(api.invoke).toHaveBeenCalledWith("get_volcengine_diagnostics");
    expect(api.invoke).toHaveBeenCalledWith("reconnect_volcengine");
  });

  it("requests the bounded Codex token metadata report with an explicit refresh flag", async () => {
    await fetchCodexTokenUsage(true);
    expect(api.invoke).toHaveBeenCalledWith("get_codex_token_usage", { force: true, rebuild: false });
    await fetchCodexTokenUsage(true, true);
    expect(api.invoke).toHaveBeenCalledWith("get_codex_token_usage", { force: true, rebuild: true });
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
});

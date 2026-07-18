import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  calls: [] as string[],
  invoke: vi.fn(async (command: string) => {
    api.calls.push(`start:${command}`);
    await Promise.resolve();
    api.calls.push(`end:${command}`);
  }),
  currentMonitor: vi.fn(async () => ({
    workArea: { position: { x: 0, y: 0 }, size: { width: 1920, height: 1040 } },
  })),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: api.invoke }));
vi.mock("@tauri-apps/api/window", () => ({ currentMonitor: api.currentMonitor }));

beforeEach(() => {
  vi.clearAllMocks();
  api.calls.length = 0;
  vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
});

describe("widget transitions", () => {
  it("passes the monitor work area to the Rust expansion command", async () => {
    const { setWidgetExpanded } = await import("./bridge");
    await setWidgetExpanded(true);
    expect(api.invoke).toHaveBeenCalledWith("expand_widget", {
      workArea: { position: { x: 0, y: 0 }, size: { width: 1920, height: 1040 } },
    });
  });

  it("serializes rapid expand and collapse requests", async () => {
    const { setWidgetExpanded } = await import("./bridge");
    await Promise.all([setWidgetExpanded(true), setWidgetExpanded(false)]);
    expect(api.calls).toEqual([
      "start:expand_widget",
      "end:expand_widget",
      "start:collapse_widget",
      "end:collapse_widget",
    ]);
  });

  it("uses dedicated redacted diagnostics and reconnect commands", async () => {
    const { getVolcengineDiagnostics, reconnectVolcengine } = await import("./bridge");
    await getVolcengineDiagnostics();
    await reconnectVolcengine();
    expect(api.invoke).toHaveBeenCalledWith("get_volcengine_diagnostics");
    expect(api.invoke).toHaveBeenCalledWith("reconnect_volcengine");
  });

  it("serializes rapid preference writes so the newest state cannot be overwritten", async () => {
    let releaseFirst: () => void = () => undefined;
    const firstWrite = new Promise<void>((resolve) => { releaseFirst = resolve; });
    api.invoke.mockImplementationOnce(async (command: string) => {
      api.calls.push(`start:${command}`);
      await firstWrite;
      api.calls.push(`end:${command}`);
    });
    const { updatePreferences } = await import("./bridge");
    const { DEFAULT_WIDGET_PREFERENCES } = await import("./preferences");
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
});

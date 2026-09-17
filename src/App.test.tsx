// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_WIDGET_PREFERENCES } from "./lib/preferences";
import { EMPTY_RUNTIME_STATE } from "./lib/activity";
import { fetchCodexResetForecast, resizeWidgetToContent, setWidgetExpanded } from "./lib/bridge";

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void; reject: (reason?: unknown) => void };

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const testState = vi.hoisted(() => ({
  updateCheck: null as Deferred<null> | null,
  exportRequest: null as Deferred<string | null> | null,
  exportCalls: 0,
  preferenceWrites: [] as Array<Deferred<void>>,
}));

vi.mock("./lib/appUpdate", () => ({
  appUpdateErrorMessage: () => "Update failed.",
  cancelAppUpdateCheck: vi.fn(),
  checkForAppUpdate: vi.fn(() => testState.updateCheck?.promise ?? Promise.resolve(null)),
  discardAppUpdate: vi.fn(async () => undefined),
  downloadAppUpdate: vi.fn(async () => undefined),
  installAppUpdate: vi.fn(async () => undefined),
  openReleasePage: vi.fn(async () => undefined),
  shouldInvalidateUpdateCheckOnChannelChange: () => false,
}));

vi.mock("./lib/bridge", () => {
  const snapshot = {
    provider: "codex",
    displayName: "CODEX",
    plan: "PRO",
    shortWindow: null,
    weeklyWindow: { remainingPercent: 74, resetsAt: "2026-09-15T00:00:00.000Z", windowSeconds: 604800 },
    resetCredits: null,
    resetCreditExpiresAt: [],
    updatedAt: "2026-09-12T00:00:00.000Z",
    status: "ok",
    message: null,
  };
  return {
    applyAppData: vi.fn(async () => undefined),
    createAutomaticBackup: vi.fn(async () => null),
    createSnapshotRefreshRequestId: vi.fn(() => "test-refresh"),
    exportAppData: vi.fn(() => {
      testState.exportCalls += 1;
      return testState.exportRequest?.promise ?? Promise.resolve(null);
    }),
    fetchCodexResetForecast: vi.fn(async () => null),
    fetchSnapshotsProgressively: vi.fn(async (requestId: string, providerIds: string[] | undefined, onProgress: (value: unknown) => void) => {
      const ids = providerIds ?? ["codex"];
      for (const providerId of ids) onProgress({ requestId, requestedProviderIds: ids, providerId, snapshots: [snapshot] });
      return [snapshot];
    }),
    getAppDiagnostics: vi.fn(async () => ({ appVersion: "test", platform: "windows", configDirectory: "redacted", preferencesBackupAvailable: false, runtimeBackupAvailable: false })),
    getAutostartEnabled: vi.fn(async () => false),
    getPreferences: vi.fn(async () => ({ ...DEFAULT_WIDGET_PREFERENCES, language: "en" })),
    getRuntimeState: vi.fn(async () => structuredClone(EMPTY_RUNTIME_STATE)),
    getVolcengineDiagnostics: vi.fn(async () => null),
    importAppData: vi.fn(async () => null),
    listenDesktopEvents: vi.fn(async () => () => undefined),
    notifyFocusPanels: vi.fn(async () => undefined),
    openExternalUrl: vi.fn(async () => undefined),
    openFocusPanel: vi.fn(async () => undefined),
    reconnectVolcengine: vi.fn(async () => null),
    resizeWidgetToContent: vi.fn(async () => undefined),
    restoreLatestBackup: vi.fn(async () => null),
    sendDesktopNotification: vi.fn(async () => false),
    setAlwaysOnTop: vi.fn(async (alwaysOnTop: boolean) => ({ ...DEFAULT_WIDGET_PREFERENCES, alwaysOnTop })),
    setAutostartEnabled: vi.fn(async (enabled: boolean) => enabled),
    setWidgetExpanded: vi.fn(async () => undefined),
    startDragging: vi.fn(async () => null),
    updatePreferences: vi.fn(() => {
      const write = deferred<void>();
      testState.preferenceWrites.push(write);
      return write.promise;
    }),
    updateRuntimeState: vi.fn(async () => undefined),
  };
});

vi.mock("./components/ControlCenter", () => ({
  ControlCenter: ({ onClose, onExport, operation }: { onClose: () => void; onExport: () => void; operation?: { pending: boolean; message: string } | null }) => (
    <section role="dialog" aria-label="Control center">
      <button type="button" onClick={onClose}>Close control</button>
      <button type="button" onClick={onExport} disabled={operation?.pending}>Export system</button>
      {operation ? <output>{operation.message}</output> : null}
    </section>
  ),
}));

vi.mock("./components/QuotaCard", () => {
  const compact = ({ onHover }: { onHover: (value: boolean) => void }) => <button type="button" onClick={() => onHover(true)}>Expand widget</button>;
  const card = (props: any) => (
    <main className="quota-card" data-content-width={props.controlOpen || props.updateOpen ? 552 : 400} onMouseEnter={() => props.onHover(true)}>
      <button type="button" aria-label="App update" onClick={props.onUpdateOpen}>Update</button>
      <button type="button" aria-label="Control center" onClick={props.onControlOpen}>Control</button>
      <button type="button" onClick={() => props.onPreferences({ ...props.preferences, accentColor: "#112233" })}>Save first</button>
      <button type="button" onClick={() => props.onPreferences({ ...props.preferences, accentColor: "#223344" })}>Save second</button>
      <button type="button" onClick={() => props.onPreferences({ ...props.preferences, stayExpanded: true, compactLayout: "bar" })}>Pin as bar</button>
      <button type="button" onClick={() => props.onProviderListPreferenceChange(false)}>Collapse providers</button>
      <button type="button" onClick={() => props.onHover(false)}>Leave widget</button>
      <output aria-label="Provider list choice">{String(props.providerListPreference)}</output>
      <button type="button" onClick={props.onRefreshResetForecast}>Retry forecast</button>
      <output aria-label="Forecast state">{props.resetForecastStatus}:{props.resetForecast?.score ?? "none"}</output>
      <output>{props.preferences.accentColor}</output>
      {props.updateOpen ? <section role="dialog" aria-label="Update dialog">{props.updateState.phase}<button type="button" onClick={props.onUpdateClose}>Close update</button></section> : null}
      {props.controlOpen ? props.controlCenter : null}
    </main>
  );
  return { QuotaBar: compact, QuotaBottleneckBar: compact, QuotaOrb: compact, QuotaCard: card };
});

import App from "./App";

afterEach(cleanup);

beforeEach(() => {
  testState.updateCheck = deferred<null>();
  testState.exportRequest = null;
  testState.exportCalls = 0;
  testState.preferenceWrites = [];
  vi.mocked(fetchCodexResetForecast).mockReset().mockResolvedValue(null);
});

async function renderExpandedApp() {
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Expand widget" }));
  await screen.findByRole("button", { name: "App update" });
}

describe("App modal and preference lifecycle", () => {
  it("retains a valid public forecast on empty responses and errors, then recovers", async () => {
    const forecast = { score: 42, windowHours: 48, fetchedAt: new Date().toISOString(), resetAnnounced: false, sourceUrl: "https://codex-reset.com/" };
    vi.mocked(fetchCodexResetForecast).mockResolvedValueOnce(forecast);
    await renderExpandedApp();
    await waitFor(() => expect(screen.getByLabelText("Forecast state")).toHaveTextContent("ready:42"));
    fireEvent.click(screen.getByRole("button", { name: "Retry forecast" }));
    await waitFor(() => expect(screen.getByLabelText("Forecast state")).toHaveTextContent("cached:42"));
    vi.mocked(fetchCodexResetForecast).mockRejectedValueOnce(new Error("offline"));
    fireEvent.click(screen.getByRole("button", { name: "Retry forecast" }));
    await waitFor(() => expect(screen.getByLabelText("Forecast state")).toHaveTextContent("cached:42"));
    vi.mocked(fetchCodexResetForecast).mockResolvedValueOnce({ ...forecast, score: 45 });
    fireEvent.click(screen.getByRole("button", { name: "Retry forecast" }));
    await waitFor(() => expect(screen.getByLabelText("Forecast state")).toHaveTextContent("ready:45"));
  });
  it("retains the provider list choice after the expanded card unmounts and reopens", async () => {
    await renderExpandedApp();
    fireEvent.click(screen.getByRole("button", { name: "Collapse providers" }));
    fireEvent.click(screen.getByRole("button", { name: "Leave widget" }));
    fireEvent.click(await screen.findByRole("button", { name: "Expand widget" }));
    expect(await screen.findByLabelText("Provider list choice")).toHaveTextContent("false");
  });

  it("does not reset native geometry when the pointer re-enters an expanded dialog", async () => {
    await renderExpandedApp();
    fireEvent.click(screen.getByRole("button", { name: "Control center" }));
    await screen.findByRole("dialog", { name: "Control center" });
    const calls = vi.mocked(setWidgetExpanded).mock.calls.length;
    fireEvent.mouseEnter(screen.getByRole("main"));
    fireEvent.mouseEnter(screen.getByRole("main"));
    expect(setWidgetExpanded).toHaveBeenCalledTimes(calls);
  });

  it("restores measured content height when compact placement changes while pinned open", async () => {
    await renderExpandedApp();
    vi.spyOn(screen.getByRole("main"), "offsetHeight", "get").mockReturnValue(448);
    vi.mocked(resizeWidgetToContent).mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Pin as bar" }));
    await waitFor(() => expect(resizeWidgetToContent).toHaveBeenLastCalledWith(448, 400));
  });

  it("grows and restores native width even when an overlay leaves content height unchanged", async () => {
    await renderExpandedApp();
    vi.spyOn(screen.getByRole("main"), "offsetHeight", "get").mockReturnValue(448);
    vi.mocked(resizeWidgetToContent).mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Control center" }));
    await waitFor(() => expect(resizeWidgetToContent).toHaveBeenLastCalledWith(448, 552));
    fireEvent.click(screen.getByRole("button", { name: "Close control" }));
    await waitFor(() => expect(resizeWidgetToContent).toHaveBeenLastCalledWith(448, 400));
  });

  it("does not let a canceled update check reopen over the control center", async () => {
    await renderExpandedApp();

    fireEvent.click(screen.getByRole("button", { name: "App update" }));
    expect(screen.getByRole("dialog", { name: "Update dialog" })).toHaveTextContent("checking");
    fireEvent.click(screen.getByRole("button", { name: "Control center" }));
    expect(await screen.findByRole("dialog", { name: "Control center" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Update dialog" })).not.toBeInTheDocument();

    testState.updateCheck!.resolve(null);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Update dialog" })).not.toBeInTheDocument());
  });

  it("keeps the newest optimistic preference after an older write fails", async () => {
    await renderExpandedApp();

    fireEvent.click(screen.getByRole("button", { name: "Save first" }));
    fireEvent.click(screen.getByRole("button", { name: "Save second" }));
    expect(screen.getByText("#223344")).toBeInTheDocument();
    testState.preferenceWrites[0].reject(new Error("first write failed"));
    await waitFor(() => expect(screen.getByText("#223344")).toBeInTheDocument());
  });

  it("shows pending, canceled, and failed export results without sending duplicates", async () => {
    await renderExpandedApp();
    fireEvent.click(screen.getByRole("button", { name: "Control center" }));
    await screen.findByRole("dialog", { name: "Control center" });

    testState.exportRequest = deferred<string | null>();
    fireEvent.click(screen.getByRole("button", { name: "Export system" }));
    expect(screen.getByRole("button", { name: "Export system" })).toBeDisabled();
    expect(screen.getByText("Exporting backup…")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Export system" }));
    expect(testState.exportCalls).toBe(1);

    testState.exportRequest.resolve(null);
    await waitFor(() => expect(screen.getByText("Backup export canceled.")).toBeInTheDocument());

    testState.exportRequest = deferred<string | null>();
    fireEvent.click(screen.getByRole("button", { name: "Export system" }));
    expect(testState.exportCalls).toBe(2);
    testState.exportRequest.reject(new Error("disk full"));
    await waitFor(() => expect(screen.getByText("disk full")).toBeInTheDocument());
  });
});

// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_WIDGET_PREFERENCES } from "./lib/preferences";
import { EMPTY_RUNTIME_STATE } from "./lib/activity";

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
    <main>
      <button type="button" aria-label="App update" onClick={props.onUpdateOpen}>Update</button>
      <button type="button" aria-label="Control center" onClick={props.onControlOpen}>Control</button>
      <button type="button" onClick={() => props.onPreferences({ ...props.preferences, accentColor: "#112233" })}>Save first</button>
      <button type="button" onClick={() => props.onPreferences({ ...props.preferences, accentColor: "#223344" })}>Save second</button>
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
});

async function renderExpandedApp() {
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Expand widget" }));
  await screen.findByRole("button", { name: "App update" });
}

describe("App modal and preference lifecycle", () => {
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

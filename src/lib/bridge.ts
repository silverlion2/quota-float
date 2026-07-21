import type { AppDiagnostics, ProviderSnapshot, ResetForecast, RuntimeState, VolcengineDiagnostics, WidgetPreferences } from "../types";
import { EMPTY_RUNTIME_STATE, normalizeRuntimeState } from "./activity";
import { DEFAULT_WIDGET_PREFERENCES } from "./preferences";

const defaultPreferences = DEFAULT_WIDGET_PREFERENCES;

const mockSnapshots: ProviderSnapshot[] = [{
  provider: "codex",
  displayName: "CODEX",
  plan: "PRO",
  shortWindow: null,
  weeklyWindow: { remainingPercent: 74, resetsAt: new Date(Date.now() + 3.2 * 86_400_000).toISOString(), windowSeconds: 604_800 },
  resetCredits: 1,
  resetCreditExpiresAt: [new Date(Date.now() + 9 * 86_400_000).toISOString()],
  updatedAt: new Date().toISOString(),
  status: "ok",
  message: null,
}, {
  provider: "qoder",
  displayName: "QODER",
  plan: "PRO",
  shortWindow: null,
  weeklyWindow: null,
  resetCredits: null,
  balanceRemaining: 1280,
  balanceUnit: "credits",
  updatedAt: new Date().toISOString(),
  status: "ok",
  message: null,
}, {
  provider: "trae",
  displayName: "TRAE",
  plan: "Free",
  shortWindow: null,
  weeklyWindow: null,
  resetCredits: null,
  balanceRemaining: 0,
  balanceUnit: "unlimited",
  updatedAt: new Date().toISOString(),
  status: "ok",
  message: null,
}, {
  provider: "workbuddy",
  displayName: "WORKBUDDY",
  plan: null,
  shortWindow: null,
  weeklyWindow: null,
  resetCredits: null,
  balanceRemaining: 420,
  balanceUnit: "credits",
  updatedAt: new Date().toISOString(),
  status: "ok",
  message: null,
}, {
  provider: "volcengine",
  displayName: "VOLCENGINE",
  plan: "CODING",
  shortWindow: { remainingPercent: 88, resetsAt: new Date(Date.now() + 3 * 3_600_000).toISOString(), windowSeconds: 18_000 },
  weeklyWindow: { remainingPercent: 86, resetsAt: new Date(Date.now() + 5.4 * 86_400_000).toISOString(), windowSeconds: 604_800 },
  monthlyWindow: { remainingPercent: 45, resetsAt: new Date(Date.now() + 20.4 * 86_400_000).toISOString(), windowSeconds: 31 * 86_400 },
  resetCredits: null,
  updatedAt: new Date().toISOString(),
  status: "ok",
  message: null,
}];

const mockVolcengineDiagnostics: VolcengineDiagnostics = {
  installed: true,
  executablePath: "~/AppData/Roaming/npm/arkcli.cmd",
  executableSource: "PATH",
  stalePath: false,
  cliVersion: "arkcli version 1.0.3",
  authenticated: true,
  authMethod: "sso",
  profileName: "coding-plan_personal",
  profileType: "coding-plan",
  profileRegion: "cn-beijing",
  recommendedProfile: true,
  lastError: null,
};

let widgetTransition: Promise<void> = Promise.resolve();
let preferenceWrite: Promise<void> = Promise.resolve();
let runtimeWrite: Promise<void> = Promise.resolve();

function enqueueWidgetTransition(operation: () => Promise<void>): Promise<void> {
  const next = widgetTransition.then(operation, operation);
  widgetTransition = next.catch(() => undefined);
  return next;
}

function enqueuePreferenceWrite(operation: () => Promise<void>): Promise<void> {
  const next = preferenceWrite.then(operation, operation);
  preferenceWrite = next.catch(() => undefined);
  return next;
}

function enqueueRuntimeWrite(operation: () => Promise<void>): Promise<void> {
  const next = runtimeWrite.then(operation, operation);
  runtimeWrite = next.catch(() => undefined);
  return next;
}

export const isTauri = () => "__TAURI_INTERNALS__" in window;

export async function fetchSnapshots(force = false): Promise<ProviderSnapshot[]> {
  if (!isTauri()) return mockSnapshots;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<ProviderSnapshot[]>(force ? "refresh_snapshots" : "get_snapshots");
}

export async function fetchCodexResetForecast(): Promise<ResetForecast | null> {
  if (!isTauri()) return {
    score: 62,
    windowHours: 48,
    fetchedAt: new Date().toISOString(),
    resetAnnounced: false,
    resetAt: null,
    sourceUrl: "https://codexresetradar.com/",
  };
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<ResetForecast | null>("get_codex_reset_forecast");
}

export async function openExternalUrl(url: string): Promise<void> {
  if (!isTauri()) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  const { openUrl } = await import("@tauri-apps/plugin-opener");
  await openUrl(url);
}

export async function getVolcengineDiagnostics(): Promise<VolcengineDiagnostics> {
  if (!isTauri()) return mockVolcengineDiagnostics;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<VolcengineDiagnostics>("get_volcengine_diagnostics");
}

export async function reconnectVolcengine(): Promise<VolcengineDiagnostics> {
  if (!isTauri()) return mockVolcengineDiagnostics;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<VolcengineDiagnostics>("reconnect_volcengine");
}

export async function getPreferences(): Promise<WidgetPreferences> {
  if (!isTauri()) return defaultPreferences;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<WidgetPreferences>("get_preferences");
}

export async function updatePreferences(value: WidgetPreferences): Promise<void> {
  if (!isTauri()) return;
  return enqueuePreferenceWrite(async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("set_preferences", { preferences: value });
  });
}

export async function getAutostartEnabled(): Promise<boolean> {
  if (!isTauri()) return false;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<boolean>("get_autostart_enabled");
}

export async function setAutostartEnabled(enabled: boolean): Promise<boolean> {
  if (!isTauri()) return enabled;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<boolean>("set_autostart_enabled", { enabled });
}

export async function getRuntimeState(): Promise<RuntimeState> {
  if (!isTauri()) return structuredClone(EMPTY_RUNTIME_STATE);
  const { invoke } = await import("@tauri-apps/api/core");
  return normalizeRuntimeState(await invoke("get_runtime_state"));
}

export async function updateRuntimeState(runtimeState: RuntimeState): Promise<void> {
  if (!isTauri()) return;
  return enqueueRuntimeWrite(async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("set_runtime_state", { runtimeState });
  });
}

export async function exportAppData(bundle: unknown): Promise<string | null> {
  if (!isTauri()) return null;
  const { save } = await import("@tauri-apps/plugin-dialog");
  const path = await save({ defaultPath: `quota-float-backup-${new Date().toISOString().slice(0, 10)}.json`, filters: [{ name: "Quota Float backup", extensions: ["json"] }] });
  if (!path) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("export_app_data", { path, bundle });
  return path;
}

export async function importAppData(): Promise<unknown | null> {
  if (!isTauri()) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const path = await open({ multiple: false, directory: false, filters: [{ name: "Quota Float backup", extensions: ["json"] }] });
  if (!path || Array.isArray(path)) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke("import_app_data", { path });
}

export async function createAutomaticBackup(bundle: unknown): Promise<string | null> {
  if (!isTauri()) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string>("create_automatic_backup", { bundle });
}

export async function restoreLatestBackup(): Promise<unknown | null> {
  if (!isTauri()) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke("restore_latest_backup");
}

export async function getAppDiagnostics(): Promise<AppDiagnostics> {
  if (!isTauri()) return { appVersion: "dev", platform: navigator.platform, configDirectory: "Browser preview", preferencesBackupAvailable: false, runtimeBackupAvailable: false };
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<AppDiagnostics>("get_app_diagnostics");
}

export async function sendDesktopNotification(title: string, body: string): Promise<boolean> {
  if (!isTauri()) return false;
  const { isPermissionGranted, requestPermission, sendNotification } = await import("@tauri-apps/plugin-notification");
  let allowed = await isPermissionGranted();
  if (!allowed) allowed = (await requestPermission()) === "granted";
  if (!allowed) return false;
  sendNotification({ title, body });
  return true;
}

export async function setClickThrough(locked: boolean): Promise<WidgetPreferences> {
  if (!isTauri()) return { ...defaultPreferences, locked };
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<WidgetPreferences>("set_widget_locked", { locked });
}

export async function setAlwaysOnTop(alwaysOnTop: boolean): Promise<WidgetPreferences> {
  if (!isTauri()) return { ...defaultPreferences, alwaysOnTop };
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<WidgetPreferences>("set_widget_always_on_top", { alwaysOnTop });
}

export async function startDragging(): Promise<void> {
  if (!isTauri()) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  const { invoke } = await import("@tauri-apps/api/core");
  const currentWindow = getCurrentWindow();
  await invoke("begin_widget_drag");
  let previous: { x: number; y: number };
  try {
    await currentWindow.startDragging();
    previous = await currentWindow.outerPosition();
  } catch (error) {
    await invoke("finish_widget_drag").catch(() => undefined);
    throw error;
  }
  let stableTicks = 0;
  let attempts = 0;
  const finishWhenStable = window.setInterval(() => {
    void currentWindow.outerPosition()
      .then((next) => {
        attempts += 1;
        const stable = Math.abs(next.x - previous.x) <= 1 && Math.abs(next.y - previous.y) <= 1;
        stableTicks = stable ? stableTicks + 1 : 0;
        previous = next;
        if (stableTicks >= 3 || attempts >= 25) {
          window.clearInterval(finishWhenStable);
          void invoke("finish_widget_drag").catch(() => undefined);
        }
      })
      .catch(() => {
        window.clearInterval(finishWhenStable);
        void invoke("finish_widget_drag").catch(() => undefined);
      });
  }, 80);
}

export function setWidgetExpanded(expanded: boolean): Promise<void> {
  if (!isTauri()) return Promise.resolve();
  return enqueueWidgetTransition(async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    if (!expanded) {
      await invoke("collapse_widget");
      return;
    }
    const { currentMonitor } = await import("@tauri-apps/api/window");
    const monitor = await currentMonitor().catch(() => null);
    const workArea = monitor ? {
      position: { x: monitor.workArea.position.x, y: monitor.workArea.position.y },
      size: { width: monitor.workArea.size.width, height: monitor.workArea.size.height },
    } : null;
    await invoke("expand_widget", { workArea });
  });
}

export async function listenDesktopEvents(handlers: {
  onPreferences: (value: WidgetPreferences) => void;
  onRefresh: () => void;
  onUpdate: () => void;
}): Promise<() => void> {
  if (!isTauri()) return () => undefined;
  const { listen } = await import("@tauri-apps/api/event");
  const unlisteners: Array<() => void> = [];
  try {
    unlisteners.push(await listen<WidgetPreferences>("preferences-changed", (event) => handlers.onPreferences(event.payload)));
    unlisteners.push(await listen("refresh-requested", handlers.onRefresh));
    unlisteners.push(await listen("update-check-requested", handlers.onUpdate));
  } catch (error) {
    for (const unlisten of [...unlisteners].reverse()) unlisten();
    throw error;
  }
  return () => { for (const unlisten of [...unlisteners].reverse()) unlisten(); };
}

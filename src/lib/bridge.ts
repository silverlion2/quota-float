import type { AppDiagnostics, BarPlacement, CodexTokenUsageReport, CompactLayout, ProviderSnapshot, ResetForecast, RuntimeState, VolcengineDiagnostics, WidgetPreferences } from "../types";
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
  plan: "Pro",
  shortWindow: null,
  weeklyWindow: null,
  resetCredits: null,
  balanceRemaining: 350,
  balanceUnit: "credits",
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
}, {
  provider: "antigravity",
  displayName: "ANTIGRAVITY",
  plan: "Google AI Pro",
  shortWindow: { remainingPercent: 68, resetsAt: new Date(Date.now() + 4.1 * 3_600_000).toISOString(), windowSeconds: 18_000 },
  weeklyWindow: null,
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

function mockCodexTokenUsage(): CodexTokenUsageReport {
  const now = new Date();
  const buckets = Array.from({ length: 90 * 3 }, (_, index) => {
    const bucket = new Date(now.getTime() - (90 * 3 - index) * 8 * 3_600_000);
    bucket.setMinutes(0, 0, 0);
    const pulse = 0.72 + ((index * 17) % 13) / 10;
    const inputTokens = Math.round(1_450_000 * pulse);
    const cachedInputTokens = Math.round(inputTokens * (0.62 + (index % 4) * 0.05));
    const cacheWriteInputTokens = index % 9 === 0 ? Math.round(inputTokens * 0.035) : 0;
    const outputTokens = Math.round(74_000 * pulse);
    return {
      bucketStart: bucket.toISOString(),
      model: index < 90 ? "gpt-5.4" : index < 180 ? "gpt-5.5" : "gpt-5.6-sol",
      contextTier: index % 11 === 0 ? "long" as const : "short" as const,
      project: ["quota-float", "atlas", "research-lab"][index % 3],
      terminal: ["Desktop", "CLI", "VS Code"][index % 3],
      sessionKey: `s-mock-${index % 24}`,
      inputTokens,
      cachedInputTokens,
      cacheWriteInputTokens,
      outputTokens,
      reasoningOutputTokens: Math.round(outputTokens * 0.46),
      totalTokens: inputTokens + outputTokens,
      requests: 5 + (index % 8),
    };
  });
  return {
    generatedAt: now.toISOString(),
    rangeDays: 90,
    scannedFiles: 42,
    indexedFiles: 42,
    reusedFiles: 38,
    incrementalFiles: 4,
    skippedFiles: 0,
    scannedBytes: 384_000_000,
    matchedEvents: buckets.reduce((total, bucket) => total + bucket.requests, 0),
    scanDurationMs: 184,
    cacheStatus: "incremental",
    truncated: false,
    buckets,
  };
}

let widgetTransition: Promise<void> = Promise.resolve();
let dataWrite: Promise<void> = Promise.resolve();

function enqueueWidgetTransition(operation: () => Promise<void>): Promise<void> {
  const next = widgetTransition.then(operation, operation);
  widgetTransition = next.catch(() => undefined);
  return next;
}

function enqueueDataWrite(operation: () => Promise<void>): Promise<void> {
  const next = dataWrite.then(operation, operation);
  dataWrite = next.catch(() => undefined);
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

export async function fetchCodexTokenUsage(force = false, rebuild = false): Promise<CodexTokenUsageReport> {
  if (!isTauri()) return mockCodexTokenUsage();
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<CodexTokenUsageReport>("get_codex_token_usage", { force, rebuild });
}

export type UsageExportFormat = "csv" | "json" | "svg";

export async function exportUsageData(content: string, format: UsageExportFormat): Promise<string | null> {
  const filename = `quota-float-usage-${new Date().toISOString().slice(0, 10)}.${format}`;
  if (!isTauri()) {
    const blob = new Blob([content], { type: format === "svg" ? "image/svg+xml" : format === "csv" ? "text/csv" : "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    return filename;
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string | null>("export_usage_data", { content, format });
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
  return enqueueDataWrite(async () => {
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
  return enqueueDataWrite(async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("set_runtime_state", { runtimeState });
  });
}

export async function applyAppData(preferences: WidgetPreferences, runtimeState: RuntimeState): Promise<void> {
  if (!isTauri()) return;
  return enqueueDataWrite(async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("apply_app_data", { preferences, runtimeState });
  });
}

export async function exportAppData(bundle: unknown): Promise<string | null> {
  if (!isTauri()) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string | null>("export_app_data", { bundle });
}

export async function importAppData(): Promise<unknown | null> {
  if (!isTauri()) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke("import_app_data");
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

interface WorkAreaPayload {
  position: { x: number; y: number };
  size: { width: number; height: number };
}

async function currentWorkArea(): Promise<WorkAreaPayload | null> {
  const { currentMonitor } = await import("@tauri-apps/api/window");
  const monitor = await currentMonitor().catch(() => null);
  return monitor ? {
    position: { x: monitor.workArea.position.x, y: monitor.workArea.position.y },
    size: { width: monitor.workArea.size.width, height: monitor.workArea.size.height },
  } : null;
}

export async function startDragging(): Promise<BarPlacement | null> {
  if (!isTauri()) return null;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  const { invoke } = await import("@tauri-apps/api/core");
  const currentWindow = getCurrentWindow();
  await invoke("begin_widget_drag");
  const finish = async () => invoke<BarPlacement | null>("finish_widget_drag", { workArea: await currentWorkArea() });
  let previous: { x: number; y: number };
  try {
    await currentWindow.startDragging();
    previous = await currentWindow.outerPosition();
  } catch (error) {
    await finish().catch(() => undefined);
    throw error;
  }
  return new Promise<BarPlacement | null>((resolve, reject) => {
    let stableTicks = 0;
    let attempts = 0;
    let finished = false;
    const complete = () => {
      if (finished) return;
      finished = true;
      window.clearInterval(finishWhenStable);
      void finish().then(resolve, reject);
    };
    const finishWhenStable = window.setInterval(() => {
      void currentWindow.outerPosition()
        .then((next) => {
          attempts += 1;
          const stable = Math.abs(next.x - previous.x) <= 1 && Math.abs(next.y - previous.y) <= 1;
          stableTicks = stable ? stableTicks + 1 : 0;
          previous = next;
          if (stableTicks >= 3 || attempts >= 25) complete();
        })
        .catch(complete);
    }, 80);
  });
}

export function setWidgetExpanded(
  expanded: boolean,
  compactLayout: CompactLayout = "float",
  placement: BarPlacement = { edge: "top", offset: 0.5 },
): Promise<void> {
  if (!isTauri()) return Promise.resolve();
  return enqueueWidgetTransition(async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    const workArea = await currentWorkArea();
    const payload = { workArea, compactLayout, barEdge: placement.edge, barOffset: placement.offset };
    await invoke(expanded ? "expand_widget" : "collapse_widget", payload);
  });
}

export function resizeWidgetToContent(contentHeight: number): Promise<void> {
  if (!isTauri() || !Number.isFinite(contentHeight) || contentHeight <= 0) return Promise.resolve();
  return enqueueWidgetTransition(async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    const workArea = await currentWorkArea();
    await invoke("resize_expanded_widget", { contentHeight, workArea });
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

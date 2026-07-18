import type { ProviderSnapshot, VolcengineDiagnostics, WidgetPreferences } from "../types";

const defaultPreferences: WidgetPreferences = { locked: false, alwaysOnTop: true, stayExpanded: false, pinnedProvider: null, providerOrder: ["codex", "qoder", "trae", "workbuddy", "volcengine"], autoRotateSeconds: 12, language: "zh-CN", skippedUpdateVersion: null };

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
  shortWindow: null,
  weeklyWindow: { remainingPercent: 86, resetsAt: new Date(Date.now() + 5.4 * 86_400_000).toISOString(), windowSeconds: 604_800 },
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

function enqueueWidgetTransition(operation: () => Promise<void>): Promise<void> {
  const next = widgetTransition.then(operation, operation);
  widgetTransition = next.catch(() => undefined);
  return next;
}

export const isTauri = () => "__TAURI_INTERNALS__" in window;

export async function fetchSnapshots(force = false): Promise<ProviderSnapshot[]> {
  if (!isTauri()) return mockSnapshots;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<ProviderSnapshot[]>(force ? "refresh_snapshots" : "get_snapshots");
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
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("set_preferences", { preferences: value });
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
  await currentWindow.startDragging();
  let previous = await currentWindow.outerPosition();
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
  const unlistenPreferences = await listen<WidgetPreferences>("preferences-changed", (event) => handlers.onPreferences(event.payload));
  const unlistenRefresh = await listen("refresh-requested", handlers.onRefresh);
  const unlistenUpdate = await listen("update-check-requested", handlers.onUpdate);
  return () => { unlistenPreferences(); unlistenRefresh(); unlistenUpdate(); };
}

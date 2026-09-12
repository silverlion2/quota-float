import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { QuotaBar, QuotaBottleneckBar, QuotaCard, QuotaOrb } from "./components/QuotaCard";
import { EMPTY_UPDATE_STATE } from "./components/UpdatePanel";
import type { UpdateViewState } from "./components/UpdatePanel";
import type { ControlOperation, ControlOperationKind } from "./components/ControlCenter";
import { applyAppData, createAutomaticBackup, createSnapshotRefreshRequestId, exportAppData, fetchCodexResetForecast, fetchSnapshotsProgressively, getAppDiagnostics, getAutostartEnabled, getPreferences, getRuntimeState, getVolcengineDiagnostics, importAppData, listenDesktopEvents, notifyFocusPanels, openExternalUrl, openFocusPanel, reconnectVolcengine, resizeWidgetToContent, restoreLatestBackup, sendDesktopNotification, setAlwaysOnTop, setAutostartEnabled, setWidgetExpanded, startDragging, updatePreferences, updateRuntimeState } from "./lib/bridge";
import { appUpdateErrorMessage, cancelAppUpdateCheck, checkForAppUpdate, discardAppUpdate, downloadAppUpdate, installAppUpdate, openReleasePage, shouldInvalidateUpdateCheckOnChannelChange } from "./lib/appUpdate";
import type { AppUpdateInfo } from "./lib/appUpdate";
import { copy, nextLanguage, normalizeLanguage } from "./lib/i18n";
import { nextProviderIndex, normalizeProviderOrder } from "./lib/providers";
import { detectRecentCodexReset, isRecentCodexReset } from "./lib/resetDetection";
import type { RecentCodexReset } from "./lib/resetDetection";
import { trackedQuotaWindows } from "./lib/quotaPace";
import { finalizeSnapshotProgress, mergeSnapshotProgress, mergeSnapshots, type ProgressiveSnapshotState } from "./lib/snapshots";
import { canSendNotification, EMPTY_RUNTIME_STATE, isQuietHour, normalizeRuntimeState, normalizeRuntimeStateWithDiagnostics, recordSnapshotActivity, runtimeStatesEqual } from "./lib/activity";
import { DEFAULT_WIDGET_PREFERENCES, normalizeWidgetPreferences } from "./lib/preferences";
import { formatBackupRestoreNotice } from "./lib/importDiagnostics";
import { parseBackupBundle } from "./lib/backup";
import { resolveAppearanceMode, systemPrefersDark } from "./lib/appearance";
import { loadStartupState } from "./lib/startup";
import { runSingleFlight, type SingleFlightState } from "./lib/singleFlight";
import { requestLatest, type LatestRequestState } from "./lib/latestRequest";
import { monitoredProviderIds, nextProviderRefreshDelay, providersDueForRefresh, type ProviderAttemptTimes } from "./lib/refreshPolicy";
import { buildDiagnosticReport } from "./lib/diagnosticReport";
import type { AppDiagnostics, CockpitRegion, ProviderId, ProviderSnapshot, ResetForecast, RuntimeState, VolcengineDiagnostics, WidgetPreferences } from "./types";

const DEFAULT_PREFS = DEFAULT_WIDGET_PREFERENCES;
const ControlCenter = lazy(() => import("./components/ControlCenter").then((module) => ({ default: module.ControlCenter })));
type ActiveModal = "diagnostics" | "update" | "control";

function errorMessage(error: unknown, fallback: string): string {
  if (typeof error === "string" && error.trim()) return error;
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

export default function App() {
  const [snapshots, setSnapshots] = useState<ProviderSnapshot[]>([]);
  const [recentCodexReset, setRecentCodexReset] = useState<RecentCodexReset | null>(null);
  const [codexResetForecast, setCodexResetForecast] = useState<ResetForecast | null>(null);
  const [preferences, setPreferences] = useState(DEFAULT_PREFS);
  const [activeIndex, setActiveIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [compact, setCompact] = useState(true);
  const [collapsing, setCollapsing] = useState(false);
  const [consumingProviders, setConsumingProviders] = useState<Set<string>>(() => new Set());
  const [operationError, setOperationError] = useState<string | null>(null);
  const [updateState, setUpdateState] = useState<UpdateViewState>(EMPTY_UPDATE_STATE);
  const [activeModal, setActiveModal] = useState<ActiveModal | null>(null);
  const [diagnostics, setDiagnostics] = useState<VolcengineDiagnostics | null>(null);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [runtimeState, setRuntimeState] = useState<RuntimeState>(EMPTY_RUNTIME_STATE);
  const [appDiagnostics, setAppDiagnostics] = useState<AppDiagnostics | null>(null);
  const [autostartEnabled, setAutostartState] = useState(false);
  const [controlOperation, setControlOperation] = useState<ControlOperation | null>(null);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);
  const snapshotsRef = useRef<ProviderSnapshot[]>([]);
  const providerAttempts = useRef<ProviderAttemptTimes>({});
  const resetForecastRef = useRef<ResetForecast | null>(null);
  const resetForecastRequest = useRef<LatestRequestState>({ sequence: 0 });
  const previousMetric = useRef(new Map<string, number>());
  const consumptionTimers = useRef(new Map<string, number>());
  const collapseTimer = useRef<number | null>(null);
  const collapseContentTimer = useRef<number | null>(null);
  const hoverSequence = useRef(0);
  const updateSequence = useRef(0);
  const updateStateRef = useRef<UpdateViewState>(EMPTY_UPDATE_STATE);
  const activeModalRef = useRef<ActiveModal | null>(null);
  const diagnosticsSequence = useRef(0);
  const focusPanelNotificationTimer = useRef<number | null>(null);
  const updateChannelRef = useRef(preferences.updateChannel);
  const refreshFlight = useRef<SingleFlightState<void>>({ current: null });
  const activeSnapshotRequest = useRef<string | null>(null);
  const runtimeStateRef = useRef<RuntimeState>(EMPTY_RUNTIME_STATE);
  const preferencesRef = useRef<WidgetPreferences>(DEFAULT_PREFS);
  const confirmedPreferencesRef = useRef<WidgetPreferences>(DEFAULT_PREFS);
  const preferenceSaveSequence = useRef(0);
  const controlOperationRef = useRef<{ kind: ControlOperationKind; sequence: number } | null>(null);
  const controlOperationSequence = useRef(0);
  const language = normalizeLanguage(preferences.language);
  const t = copy[language];
  const resolvedAppearance = resolveAppearanceMode(preferences.appearanceMode, systemDark);
  const diagnosticsOpen = activeModal === "diagnostics";
  const updateOpen = activeModal === "update";
  const controlOpen = activeModal === "control";
  updateStateRef.current = updateState;
  activeModalRef.current = activeModal;

  const openModal = useCallback((modal: ActiveModal) => {
    if (modal !== "update" && activeModalRef.current === "update" && updateStateRef.current.phase === "checking") {
      ++updateSequence.current;
      cancelAppUpdateCheck();
      setUpdateState(EMPTY_UPDATE_STATE);
    }
    setActiveModal(modal);
  }, []);

  const closeModal = useCallback((modal: ActiveModal) => {
    setActiveModal((current) => current === modal ? null : current);
  }, []);

  const beginControlOperation = useCallback((kind: ControlOperationKind, message: string): number | null => {
    if (controlOperationRef.current) return null;
    const sequence = ++controlOperationSequence.current;
    controlOperationRef.current = { kind, sequence };
    setOperationError(null);
    setControlOperation({ kind, pending: true, message });
    return sequence;
  }, []);

  const isControlOperationCurrent = useCallback((kind: ControlOperationKind, sequence: number) => (
    controlOperationRef.current?.kind === kind && controlOperationRef.current.sequence === sequence
  ), []);

  const finishControlOperation = useCallback((kind: ControlOperationKind, sequence: number, message: string, error = false) => {
    if (!isControlOperationCurrent(kind, sequence)) return;
    controlOperationRef.current = null;
    setControlOperation({ kind, pending: false, message, error });
  }, [isControlOperationCurrent]);

  useEffect(() => () => {
    controlOperationRef.current = null;
    ++controlOperationSequence.current;
  }, []);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemDark(query.matches);
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.appearance = resolvedAppearance;
  }, [resolvedAppearance]);

  useEffect(() => {
    document.documentElement.dataset.resourceMode = preferences.resourceMode;
  }, [preferences.resourceMode]);

  const commitRuntimeState = useCallback((next: RuntimeState) => {
    if (runtimeStatesEqual(runtimeStateRef.current, next)) return;
    runtimeStateRef.current = next;
    setRuntimeState(next);
    void updateRuntimeState(next).catch(() => setOperationError("Activity history could not be saved."));
  }, []);

  const startUpdateDownload = useCallback(async (info: AppUpdateInfo, reveal = false) => {
    const sequence = ++updateSequence.current;
    if (reveal) openModal("update");
    setUpdateState({ phase: "downloading", info, progress: null, error: null });
    try {
      await downloadAppUpdate((progress) => {
        if (updateSequence.current === sequence) {
          setUpdateState({ phase: "downloading", info, progress, error: null });
        }
      });
      if (updateSequence.current === sequence) {
        setUpdateState({ phase: "ready", info, progress: { downloadedBytes: 0, totalBytes: 0, percent: 100 }, error: null });
      }
    } catch (error) {
      if (updateSequence.current !== sequence) return;
      setUpdateState({ phase: "error", info, progress: null, error: errorMessage(error, t.updateFailed) });
      setOperationError(t.updateFailed);
      if (reveal && activeModalRef.current === "update") openModal("update");
    }
  }, [openModal, t.updateFailed]);

  const checkUpdate = useCallback((manual = false) => {
    if (["available", "downloading", "ready", "installing"].includes(updateState.phase)) {
      if (manual) {
        openModal("update");
      }
      return;
    }
    const sequence = ++updateSequence.current;
    if (manual) {
      openModal("update");
      setUpdateState({ phase: "checking", info: null, progress: null, error: null });
    }
    setOperationError(null);
    void checkForAppUpdate(preferences.updateChannel).then(async (info) => {
      if (updateSequence.current !== sequence) return;
      if (!info) {
        setUpdateState({ phase: manual ? "current" : "idle", info: null, progress: null, error: null });
        return;
      }
      if (!manual && preferences.skippedUpdateVersion === info.version) {
        await discardAppUpdate();
        if (updateSequence.current === sequence) setUpdateState(EMPTY_UPDATE_STATE);
        return;
      }
      if (!info.automaticInstall || manual || !preferences.automaticUpdates) {
        setUpdateState({ phase: "available", info, progress: null, error: null });
        if (!manual && activeModalRef.current === null) openModal("update");
        return;
      }
      await startUpdateDownload(info, manual);
    }).catch((error) => {
      if (updateSequence.current !== sequence) return;
      setUpdateState({ phase: "error", info: null, progress: null, error: appUpdateErrorMessage(error, language) });
      setOperationError(t.updateFailed);
      if (manual && activeModalRef.current === "update") openModal("update");
    });
  }, [language, openModal, preferences.automaticUpdates, preferences.skippedUpdateVersion, preferences.updateChannel, startUpdateDownload, t.updateFailed, updateState.phase]);

  useEffect(() => {
    if (updateChannelRef.current === preferences.updateChannel) return;
    updateChannelRef.current = preferences.updateChannel;
    if (!shouldInvalidateUpdateCheckOnChannelChange(updateState.phase)) return;
    ++updateSequence.current;
    cancelAppUpdateCheck();
    setUpdateState(EMPTY_UPDATE_STATE);
    closeModal("update");
    void discardAppUpdate();
  }, [closeModal, preferences.updateChannel, updateState.phase]);

  const refresh = useCallback((force = false) => runSingleFlight(refreshFlight.current, async () => {
    const preferenceSnapshot = preferencesRef.current;
    const monitored = monitoredProviderIds(preferenceSnapshot.pausedProviders);
    const providerIds = force
      ? monitored
      : providersDueForRefresh(snapshotsRef.current, monitored, providerAttempts.current, preferenceSnapshot.resourceMode);
    if (providerIds.length === 0) return;
    const snapshotsBeforeRefresh = snapshotsRef.current;
    const requestId = createSnapshotRefreshRequestId();
    const progressState: ProgressiveSnapshotState = { requestId, receivedProviders: new Set(), finalized: false };
    activeSnapshotRequest.current = requestId;
    const attemptedAt = Date.now();
    for (const provider of providerIds) providerAttempts.current[provider] = attemptedAt;
    if (providerIds.includes("codex")) {
      requestLatest(resetForecastRequest.current, fetchCodexResetForecast, (forecast) => {
        resetForecastRef.current = forecast;
        setCodexResetForecast(forecast);
      });
    }
    try {
      const values = await fetchSnapshotsProgressively(requestId, providerIds, (progress) => {
        const merged = mergeSnapshotProgress(progressState, activeSnapshotRequest.current, snapshotsRef.current, progress);
        if (!merged) return;
        snapshotsRef.current = merged;
        setSnapshots(merged);
      });
      if (!finalizeSnapshotProgress(progressState, activeSnapshotRequest.current)) return;
      // Progressive events update view state only. History, reset detection, and notifications run once below.
      for (const item of values) {
        const percentWindows = trackedQuotaWindows(item);
        const nextMetric = percentWindows.length > 0
          ? percentWindows.reduce((total, value) => total + value.window.remainingPercent, 0)
          : item.balanceRemaining ?? undefined;
        const previous = previousMetric.current.get(item.provider);
        if (nextMetric !== undefined && previous !== undefined && nextMetric < previous) {
          setConsumingProviders((current) => new Set(current).add(item.provider));
          const oldTimer = consumptionTimers.current.get(item.provider);
          if (oldTimer !== undefined) window.clearTimeout(oldTimer);
          const timer = window.setTimeout(() => {
            setConsumingProviders((current) => { const next = new Set(current); next.delete(item.provider); return next; });
            consumptionTimers.current.delete(item.provider);
          }, 5 * 60_000);
          consumptionTimers.current.set(item.provider, timer);
        }
        if (nextMetric !== undefined) previousMetric.current.set(item.provider, nextMetric);
      }
      const now = new Date();
      let detectedReset: RecentCodexReset | null = null;
      const nextCodex = values.find((item) => item.provider === "codex");
      if (nextCodex) {
        detectedReset = detectRecentCodexReset(nextCodex, snapshotsBeforeRefresh.find((item) => item.provider === "codex") ?? null, now);
        setRecentCodexReset((current) => detectedReset ?? (isRecentCodexReset(current, now) ? current : null));
      }
      const activity = recordSnapshotActivity(runtimeStateRef.current, snapshotsBeforeRefresh, values, detectedReset, preferencesRef.current.alertThreshold, now, preferencesRef.current.language, preferencesRef.current.notificationCooldownMinutes, resetForecastRef.current);
      let nextRuntimeState = activity.state;
      const notificationPreferences = preferencesRef.current;
      if (notificationPreferences.notificationsEnabled && !isQuietHour(now.getHours(), notificationPreferences.quietHoursStart, notificationPreferences.quietHoursEnd)) {
        for (const candidate of activity.notificationCandidates) {
          const item = candidate.event;
          const enabled = item.kind === "reset" ? notificationPreferences.notifyOnReset : item.kind === "recovered" ? notificationPreferences.notifyOnRecovery : item.kind === "quota" || item.kind === "warning";
          const key = candidate.key;
          if (!enabled || !canSendNotification(nextRuntimeState, key, notificationPreferences.notificationCooldownMinutes, now)) continue;
          if (await sendDesktopNotification(item.title, item.detail).catch(() => false)) {
            nextRuntimeState = { ...nextRuntimeState, lastNotifications: { ...nextRuntimeState.lastNotifications, [key]: now.toISOString() } };
          }
        }
      }
      commitRuntimeState(nextRuntimeState);
      setSnapshots((current) => {
        const merged = mergeSnapshots(current, values, providerIds);
        snapshotsRef.current = merged;
        return merged;
      });
    } catch {
      if (activeSnapshotRequest.current !== requestId) return;
      setSnapshots((current) => {
        const missingProviders = providerIds.filter((provider) => !progressState.receivedProviders.has(provider));
        const represented = new Set(current.map((item) => item.provider));
        const next = current.map((item) => missingProviders.includes(item.provider)
          ? { ...item, status: "stale" as const, message: "Refresh failed. Please try again later." }
          : item);
        for (const provider of missingProviders) {
          if (!represented.has(provider)) next.push({ provider, displayName: provider.toUpperCase(), plan: null, shortWindow: null, weeklyWindow: null, resetCredits: null, resetCreditExpiresAt: [], updatedAt: new Date().toISOString(), status: "unavailable" as const, message: "Quota is temporarily unavailable. It will retry automatically." });
        }
        snapshotsRef.current = next;
        return next;
      });
    } finally {
      if (activeSnapshotRequest.current === requestId) activeSnapshotRequest.current = null;
    }
  }, force), [commitRuntimeState]);

  const loadVolcengineDiagnostics = useCallback(async () => {
    const sequence = ++diagnosticsSequence.current;
    setDiagnosticsLoading(true);
    try {
      const value = await getVolcengineDiagnostics();
      if (diagnosticsSequence.current === sequence) setDiagnostics(value);
    } catch (error) {
      if (diagnosticsSequence.current === sequence) setOperationError(errorMessage(error, t.errorUnavailable));
    } finally {
      if (diagnosticsSequence.current === sequence) setDiagnosticsLoading(false);
    }
  }, [t.errorUnavailable]);

  const openVolcengineDiagnostics = useCallback(() => {
    openModal("diagnostics");
    void loadVolcengineDiagnostics();
  }, [loadVolcengineDiagnostics, openModal]);

  const closeVolcengineDiagnostics = useCallback(() => {
    ++diagnosticsSequence.current;
    setDiagnosticsLoading(false);
    setReconnecting(false);
    closeModal("diagnostics");
  }, [closeModal]);

  const handleVolcengineReconnect = useCallback(async () => {
    openModal("diagnostics");
    const sequence = ++diagnosticsSequence.current;
    setDiagnosticsLoading(diagnostics === null);
    setReconnecting(true);
    setOperationError(t.reconnectStarted);
    try {
      const value = await reconnectVolcengine();
      if (diagnosticsSequence.current !== sequence) return;
      setDiagnostics(value);
      await refresh(true);
      if (diagnosticsSequence.current !== sequence) return;
      setOperationError(t.reconnectSuccess);
    } catch (error) {
      if (diagnosticsSequence.current !== sequence) return;
      setOperationError(errorMessage(error, t.reconnectFailed));
      try {
        const value = await getVolcengineDiagnostics();
        if (diagnosticsSequence.current === sequence) setDiagnostics(value);
      } catch {
        // Preserve the actionable reconnect error when diagnostics also fail.
      }
    } finally {
      if (diagnosticsSequence.current === sequence) {
        setDiagnosticsLoading(false);
        setReconnecting(false);
      }
    }
  }, [diagnostics, openModal, refresh, t.reconnectFailed, t.reconnectStarted, t.reconnectSuccess]);

  useEffect(() => {
    let cancelled = false;
    void loadStartupState({ getPreferences, getRuntimeState, getDiagnostics: getAppDiagnostics, getAutostartEnabled }).then((startup) => {
      if (cancelled) return;
      if (startup.preferences) {
        const normalized = normalizeWidgetPreferences(startup.preferences);
        preferencesRef.current = normalized;
        confirmedPreferencesRef.current = normalized;
        setPreferences(normalized);
      }
      if (startup.runtimeState) {
        runtimeStateRef.current = startup.runtimeState;
        setRuntimeState(startup.runtimeState);
      }
      if (startup.diagnostics) setAppDiagnostics(startup.diagnostics);
      if (startup.autostartEnabled !== null) setAutostartState(startup.autostartEnabled);
      if (startup.failures.length > 0) setOperationError(`Some startup checks failed: ${startup.failures.join(", ")}. Available saved state was preserved.`);
      void refresh(true);
    });
    return () => {
      cancelled = true;
      for (const timer of consumptionTimers.current.values()) window.clearTimeout(timer);
      consumptionTimers.current.clear();
      if (collapseTimer.current !== null) window.clearTimeout(collapseTimer.current);
      if (collapseContentTimer.current !== null) window.clearTimeout(collapseContentTimer.current);
    };
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    let cleanup: () => void = () => {};
    void listenDesktopEvents({ onPreferences: (value) => { const normalized = normalizeWidgetPreferences(value); ++preferenceSaveSequence.current; preferencesRef.current = normalized; confirmedPreferencesRef.current = normalized; setPreferences(normalized); }, onRefresh: () => void refresh(true), onUpdate: () => checkUpdate(true) }).then((value) => {
      if (cancelled) value(); else cleanup = value;
    }).catch(() => setOperationError("Desktop event listener failed to start."));
    return () => { cancelled = true; cleanup(); };
  }, [checkUpdate, refresh]);

  useEffect(() => {
    const timer = window.setTimeout(() => checkUpdate(false), 12_000);
    return () => window.clearTimeout(timer);
  }, [checkUpdate]);

  const monitoredProviders = useMemo(() => monitoredProviderIds(preferences.pausedProviders), [preferences.pausedProviders]);

  useEffect(() => {
    const delay = nextProviderRefreshDelay(snapshots, monitoredProviders, providerAttempts.current, preferences.resourceMode);
    const id = window.setTimeout(() => void refresh(), Math.max(1_000, delay));
    return () => window.clearTimeout(id);
  }, [monitoredProviders, preferences.resourceMode, refresh, snapshots]);

  useEffect(() => {
    const refreshWhenActive = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", refreshWhenActive);
    document.addEventListener("visibilitychange", refreshWhenActive);
    return () => {
      window.removeEventListener("focus", refreshWhenActive);
      document.removeEventListener("visibilitychange", refreshWhenActive);
    };
  }, [refresh]);

  const orderedSnapshots = useMemo(() => {
    const order = normalizeProviderOrder(preferences.providerOrder);
    return [...snapshots]
      .filter((item) => !preferences.hiddenProviders.includes(item.provider))
      .map((item) => preferences.pausedProviders.includes(item.provider)
        ? { ...item, status: "stale" as const, message: language === "en" ? "Background monitoring is paused." : "已暂停后台监控。" }
        : item)
      .sort((left, right) => order.indexOf(left.provider) - order.indexOf(right.provider));
  }, [language, preferences.hiddenProviders, preferences.pausedProviders, preferences.providerOrder, snapshots]);

  const visiblePinnedProvider = preferences.pinnedProvider && orderedSnapshots.some((item) => item.provider === preferences.pinnedProvider)
    ? preferences.pinnedProvider
    : null;

  useEffect(() => {
    if (preferences.resourceMode === "focus" || hovered || visiblePinnedProvider || orderedSnapshots.length < 2) return;
    const id = window.setInterval(() => setActiveIndex((value) => nextProviderIndex(value, orderedSnapshots.length)), preferences.autoRotateSeconds * 1000);
    return () => window.clearInterval(id);
  }, [hovered, orderedSnapshots.length, preferences.autoRotateSeconds, preferences.resourceMode, visiblePinnedProvider]);

  const current = visiblePinnedProvider
    ? orderedSnapshots.find((item) => item.provider === visiblePinnedProvider) ?? orderedSnapshots[0]
    : orderedSnapshots[activeIndex % Math.max(1, orderedSnapshots.length)];

  useEffect(() => {
    if (focusPanelNotificationTimer.current !== null) {
      window.clearTimeout(focusPanelNotificationTimer.current);
    }
    focusPanelNotificationTimer.current = window.setTimeout(() => {
      focusPanelNotificationTimer.current = null;
      void notifyFocusPanels().catch(() => undefined);
    }, 100);
    return () => {
      if (focusPanelNotificationTimer.current !== null) {
        window.clearTimeout(focusPanelNotificationTimer.current);
        focusPanelNotificationTimer.current = null;
      }
    };
  }, [preferences.accentColor, preferences.appearanceMode, preferences.colorTheme, preferences.language, runtimeState, snapshots]);

  const handleDetachCockpitRegion = useCallback((region: CockpitRegion) => {
    if (!current) return;
    void openFocusPanel(region, current.provider)
      .catch((error) => setOperationError(errorMessage(error, language === "en" ? "Detached panel could not be opened." : "无法打开独立面板。")));
  }, [current, language]);

  const savePreferences = useCallback((next: WidgetPreferences) => {
    const sequence = ++preferenceSaveSequence.current;
    const normalized = normalizeWidgetPreferences(next);
    preferencesRef.current = normalized;
    setPreferences(normalized);
    setOperationError(null);
    void updatePreferences(normalized)
      .then(() => { confirmedPreferencesRef.current = normalized; })
      .catch(() => {
        if (preferenceSaveSequence.current !== sequence) return;
        const confirmed = confirmedPreferencesRef.current;
        preferencesRef.current = confirmed;
        setPreferences(confirmed);
        setOperationError("Settings could not be saved. Previous state restored.");
      });
  }, []);

  const handleDrag = useCallback(() => {
    setOperationError(null);
    void startDragging()
      .then((placement) => {
        if (!placement) return;
        const currentPreferences = preferencesRef.current;
        if (currentPreferences.compactLayout !== "bar" && currentPreferences.compactLayout !== "bottleneck"
          || (currentPreferences.barEdge === placement.edge && Math.abs(currentPreferences.barOffset - placement.offset) < 0.0001)) return;
        savePreferences({ ...currentPreferences, barEdge: placement.edge, barOffset: placement.offset });
      })
      .catch(() => setOperationError("Widget drag failed."));
  }, [savePreferences]);

  const handleUpdateOpen = useCallback(() => {
    if (["idle", "current", "error"].includes(updateState.phase)) {
      checkUpdate(true);
      return;
    }
    openModal("update");
  }, [checkUpdate, openModal, updateState.phase]);

  const handleUpdateClose = useCallback(() => {
    if (updateState.phase === "checking") {
      ++updateSequence.current;
      cancelAppUpdateCheck();
      setUpdateState(EMPTY_UPDATE_STATE);
    }
    closeModal("update");
  }, [closeModal, updateState.phase]);

  const handleUpdateDownload = useCallback(() => {
    if (updateState.info) void startUpdateDownload(updateState.info, true);
  }, [startUpdateDownload, updateState.info]);

  const handleUpdateInstall = useCallback(() => {
    const info = updateState.info;
    if (!info) return;
    const sequence = ++updateSequence.current;
    openModal("update");
    setUpdateState({ phase: "installing", info, progress: updateState.progress, error: null });
    void createAutomaticBackup({ schemaVersion: 1, createdAt: new Date().toISOString(), preferences, runtimeState: runtimeStateRef.current })
      .then(() => installAppUpdate())
      .catch((error) => {
      if (updateSequence.current !== sequence) return;
      setUpdateState({ phase: "error", info, progress: null, error: errorMessage(error, t.updateFailed) });
      setOperationError(t.updateFailed);
    });
  }, [openModal, preferences, t.updateFailed, updateState.info, updateState.progress]);

  const handleUpdateSkip = useCallback(() => {
    const version = updateState.info?.version;
    if (!version) return;
    ++updateSequence.current;
    savePreferences({ ...preferences, skippedUpdateVersion: version });
    setUpdateState(EMPTY_UPDATE_STATE);
    closeModal("update");
    setOperationError(t.updateSkipped(version));
    void discardAppUpdate();
  }, [closeModal, preferences, savePreferences, t, updateState.info?.version]);

  const handleUpdateRelease = useCallback(() => {
    void openReleasePage(updateState.info?.releaseUrl).catch(() => setOperationError(t.updateFailed));
  }, [t.updateFailed, updateState.info?.releaseUrl]);

  const backupBundle = useCallback(() => ({
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    appVersion: appDiagnostics?.appVersion ?? "unknown",
    preferences,
    runtimeState,
  }), [appDiagnostics?.appVersion, preferences, runtimeState]);

  const applyBackupBundle = useCallback(async (value: unknown) => {
    const bundle = parseBackupBundle(value);
    const nextPreferences = normalizeWidgetPreferences(bundle.preferences);
    const { state: nextRuntime, savedLayouts: layoutDiagnostics } = normalizeRuntimeStateWithDiagnostics(bundle.runtimeState);
    ++preferenceSaveSequence.current;
    await applyAppData(nextPreferences, nextRuntime);
    preferencesRef.current = nextPreferences;
    confirmedPreferencesRef.current = nextPreferences;
    runtimeStateRef.current = nextRuntime;
    setPreferences(nextPreferences);
    setRuntimeState(nextRuntime);
    const notice = formatBackupRestoreNotice(layoutDiagnostics, language);
    return notice;
  }, [language]);

  const handleExport = useCallback(() => {
    const sequence = beginControlOperation("export", language === "en" ? "Exporting backup…" : "正在导出备份…");
    if (sequence === null) return;
    void exportAppData(backupBundle()).then((path) => {
      if (!isControlOperationCurrent("export", sequence)) return;
      const message = path
        ? language === "en" ? `Backup exported: ${path}` : `备份已导出：${path}`
        : language === "en" ? "Backup export canceled." : "已取消备份导出。";
      finishControlOperation("export", sequence, message);
    }).catch((error) => {
      if (!isControlOperationCurrent("export", sequence)) return;
      const message = errorMessage(error, language === "en" ? "Backup export failed." : "备份导出失败。");
      setOperationError(message);
      finishControlOperation("export", sequence, message, true);
    });
  }, [backupBundle, beginControlOperation, finishControlOperation, isControlOperationCurrent, language]);

  const handleImport = useCallback(() => {
    const sequence = beginControlOperation("import", language === "en" ? "Waiting for a backup to import…" : "等待选择要导入的备份…");
    if (sequence === null) return;
    void importAppData().then(async (value) => {
      const message = value
        ? await applyBackupBundle(value)
        : language === "en" ? "Backup import canceled." : "已取消备份导入。";
      if (!isControlOperationCurrent("import", sequence)) return;
      finishControlOperation("import", sequence, message);
    }).catch((error) => {
      if (!isControlOperationCurrent("import", sequence)) return;
      const message = errorMessage(error, language === "en" ? "Backup import failed." : "备份导入失败。");
      setOperationError(message);
      finishControlOperation("import", sequence, message, true);
    });
  }, [applyBackupBundle, beginControlOperation, finishControlOperation, isControlOperationCurrent, language]);

  const handleRestore = useCallback(() => {
    const sequence = beginControlOperation("restore", language === "en" ? "Restoring the latest backup…" : "正在恢复最近的备份…");
    if (sequence === null) return;
    void restoreLatestBackup().then(async (value) => {
      const message = value
        ? await applyBackupBundle(value)
        : language === "en" ? "No automatic backup is available." : "没有可用的自动备份。";
      if (!isControlOperationCurrent("restore", sequence)) return;
      finishControlOperation("restore", sequence, message, !value);
    }).catch((error) => {
      if (!isControlOperationCurrent("restore", sequence)) return;
      const message = errorMessage(error, language === "en" ? "Backup restore failed." : "备份恢复失败。");
      setOperationError(message);
      finishControlOperation("restore", sequence, message, true);
    });
  }, [applyBackupBundle, beginControlOperation, finishControlOperation, isControlOperationCurrent, language]);

  const handleCopyDiagnostics = useCallback(() => {
    const sequence = beginControlOperation("diagnostics", language === "en" ? "Copying diagnostic report…" : "正在复制诊断报告…");
    if (sequence === null) return;
    const report = buildDiagnosticReport(appDiagnostics, snapshots, runtimeState);
    void navigator.clipboard.writeText(JSON.stringify(report, null, 2))
      .then(() => {
        if (!isControlOperationCurrent("diagnostics", sequence)) return;
        const message = language === "en" ? "Diagnostic report copied." : "诊断报告已复制。";
        finishControlOperation("diagnostics", sequence, message);
      })
      .catch(() => {
        if (!isControlOperationCurrent("diagnostics", sequence)) return;
        const message = language === "en" ? "Could not copy the diagnostic report." : "无法复制诊断报告。";
        setOperationError(message);
        finishControlOperation("diagnostics", sequence, message, true);
      });
  }, [appDiagnostics, beginControlOperation, finishControlOperation, isControlOperationCurrent, language, runtimeState.events, runtimeState.history.length, snapshots]);

  const handleAutostart = useCallback((enabled: boolean) => {
    const sequence = beginControlOperation("autostart", language === "en" ? "Updating startup setting…" : "正在更新开机启动设置…");
    if (sequence === null) return;
    const previous = autostartEnabled;
    setAutostartState(enabled);
    void setAutostartEnabled(enabled)
      .then((value) => {
        if (!isControlOperationCurrent("autostart", sequence)) return;
        setAutostartState(value);
        finishControlOperation("autostart", sequence, language === "en" ? "Startup setting updated." : "开机启动设置已更新。");
      })
      .catch(() => {
        if (!isControlOperationCurrent("autostart", sequence)) return;
        setAutostartState(previous);
        const message = language === "en" ? "Autostart could not be changed." : "无法修改开机启动设置。";
        setOperationError(message);
        finishControlOperation("autostart", sequence, message, true);
      });
  }, [autostartEnabled, beginControlOperation, finishControlOperation, isControlOperationCurrent, language]);

  const handleHover = useCallback((value: boolean) => {
    if (collapseTimer.current !== null) {
      window.clearTimeout(collapseTimer.current);
      collapseTimer.current = null;
    }
    if (collapseContentTimer.current !== null) {
      window.clearTimeout(collapseContentTimer.current);
      collapseContentTimer.current = null;
    }
    setCollapsing(false);
    setHovered(value);
    if (!value && preferences.stayExpanded) return;
    if (value) void refresh();
    if (value) {
      const sequence = ++hoverSequence.current;
      void setWidgetExpanded(true, preferences.compactLayout, { edge: preferences.barEdge, offset: preferences.barOffset })
        .then(() => { if (hoverSequence.current === sequence) setCompact(false); })
        .catch(() => {
          setCompact(false);
          setOperationError("Widget expand failed.");
        });
      return;
    }
    const sequence = ++hoverSequence.current;
    collapseTimer.current = window.setTimeout(() => {
      if (hoverSequence.current !== sequence) return;
      const reducedMotion = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      setCollapsing(!reducedMotion);
      collapseContentTimer.current = window.setTimeout(() => {
        if (hoverSequence.current !== sequence) return;
        setCompact(true);
        setCollapsing(false);
        void setWidgetExpanded(false, preferences.compactLayout, { edge: preferences.barEdge, offset: preferences.barOffset }).catch(() => setOperationError("Widget collapse failed."));
      }, reducedMotion ? 0 : 120);
    }, 180);
  }, [preferences.barEdge, preferences.barOffset, preferences.compactLayout, preferences.stayExpanded, refresh]);

  useEffect(() => {
    if (!preferences.stayExpanded) return;
    if (collapseTimer.current !== null) window.clearTimeout(collapseTimer.current);
    if (collapseContentTimer.current !== null) window.clearTimeout(collapseContentTimer.current);
    setCollapsing(false);
    setCompact(false);
    void setWidgetExpanded(true, preferences.compactLayout, { edge: preferences.barEdge, offset: preferences.barOffset }).catch(() => setOperationError("Widget expand failed."));
  }, [preferences.barEdge, preferences.barOffset, preferences.compactLayout, preferences.stayExpanded]);

  useEffect(() => {
    if (!compact || preferences.stayExpanded) return;
    void setWidgetExpanded(false, preferences.compactLayout, { edge: preferences.barEdge, offset: preferences.barOffset }).catch(() => setOperationError("Widget layout resize failed."));
  }, [compact, preferences.barEdge, preferences.barOffset, preferences.compactLayout, preferences.stayExpanded]);

  useEffect(() => {
    if (compact) return;
    const card = document.querySelector<HTMLElement>(".quota-card, .loading-card");
    if (!card) return;
    let animationFrame: number | null = null;
    let lastHeight = 0;
    const syncHeight = () => {
      animationFrame = null;
      const contentHeight = Math.ceil(card.getBoundingClientRect().height);
      if (contentHeight <= 0 || Math.abs(contentHeight - lastHeight) < 1) return;
      lastHeight = contentHeight;
      void resizeWidgetToContent(contentHeight).catch(() => setOperationError("Widget resize failed."));
    };
    const scheduleSync = () => {
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(syncHeight);
    };
    scheduleSync();
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleSync);
    resizeObserver?.observe(card);
    return () => {
      resizeObserver?.disconnect();
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
    };
  }, [compact, Boolean(current)]);

  if (!current) return <div className="loading-card" aria-label={t.loadingQuota}><span /><span /><span /></div>;

  if (compact) {
    const selectCompactProvider = (provider: ProviderId) => {
      const index = orderedSnapshots.findIndex((item) => item.provider === provider);
      if (index >= 0) setActiveIndex(index);
    };
    return preferences.compactLayout === "bar" ? (
      <QuotaBar
        snapshot={current}
        snapshots={orderedSnapshots}
        language={language}
        colorTheme={preferences.colorTheme}
        accentColor={preferences.accentColor}
        resolvedAppearance={resolvedAppearance}
        edge={preferences.barEdge}
        onSelectProvider={selectCompactProvider}
        onDrag={handleDrag}
        onHover={handleHover}
      />
    ) : preferences.compactLayout === "bottleneck" ? (
      <QuotaBottleneckBar
        snapshot={current}
        snapshots={orderedSnapshots}
        language={language}
        colorTheme={preferences.colorTheme}
        accentColor={preferences.accentColor}
        resolvedAppearance={resolvedAppearance}
        edge={preferences.barEdge}
        onSelectProvider={selectCompactProvider}
        onDrag={handleDrag}
        onHover={handleHover}
      />
    ) : (
      <QuotaOrb
        snapshot={current}
        language={language}
        compactLayout={preferences.compactLayout}
        colorTheme={preferences.colorTheme}
        accentColor={preferences.accentColor}
        resolvedAppearance={resolvedAppearance}
        onDrag={handleDrag}
        onHover={handleHover}
      />
    );
  }

  return (
    <QuotaCard
      snapshot={current}
      snapshots={orderedSnapshots}
      preferences={preferences}
      resolvedAppearance={resolvedAppearance}
      onSelectProvider={(provider: ProviderId) => {
        const index = orderedSnapshots.findIndex((item) => item.provider === provider);
        if (index < 0) return;
        setActiveIndex(index);
        if (preferences.pinnedProvider) savePreferences({ ...preferences, pinnedProvider: provider });
      }}
      onPreferences={savePreferences}
      onLanguage={() => savePreferences({ ...preferences, language: nextLanguage(language) })}
      onToggleStayExpanded={() => savePreferences({ ...preferences, stayExpanded: !preferences.stayExpanded })}
      onReorderProviders={(providerOrder) => {
        const visibleOrder = providerOrder.filter((provider) => orderedSnapshots.some((item) => item.provider === provider));
        const nextIndex = visibleOrder.indexOf(current.provider);
        if (nextIndex >= 0) setActiveIndex(nextIndex);
        savePreferences({ ...preferences, providerOrder });
      }}
      onLock={() => { setOperationError(null); void setAlwaysOnTop(!preferences.alwaysOnTop).then((value) => { const normalized = normalizeWidgetPreferences(value); ++preferenceSaveSequence.current; preferencesRef.current = normalized; confirmedPreferencesRef.current = normalized; setPreferences(normalized); }).catch(() => setOperationError("Always-on-top toggle failed.")); }}
      onDrag={handleDrag}
      onHover={handleHover}
      onRefresh={() => refresh(true)}
      onDiagnostics={openVolcengineDiagnostics}
      onCloseDiagnostics={closeVolcengineDiagnostics}
      onReconnect={() => void handleVolcengineReconnect()}
      diagnostics={diagnostics}
      diagnosticsOpen={diagnosticsOpen}
      diagnosticsLoading={diagnosticsLoading}
      reconnecting={reconnecting}
      recentCodexReset={recentCodexReset}
      resetForecast={codexResetForecast}
      onOpenResetForecast={(url) => void openExternalUrl(url).catch(() => setOperationError("Reset forecast could not be opened."))}
      paceBaselines={runtimeState.dailyPaceBaselines}
      history={runtimeState.history}
      dailyUsage={runtimeState.dailyUsage}
      onDetachCockpitRegion={handleDetachCockpitRegion}
      updateState={updateState}
      updateOpen={updateOpen}
      onUpdateOpen={handleUpdateOpen}
      onUpdateClose={handleUpdateClose}
      onUpdateDownload={handleUpdateDownload}
      onUpdateInstall={handleUpdateInstall}
      onUpdateRetry={() => checkUpdate(true)}
      onUpdateLater={() => closeModal("update")}
      onUpdateSkip={handleUpdateSkip}
      onUpdateRelease={handleUpdateRelease}
      controlOpen={controlOpen}
      onControlOpen={() => {
        openModal("control");
        void getAppDiagnostics().then(setAppDiagnostics).catch(() => undefined);
      }}
      controlCenter={(
        <ErrorBoundary language={language} resetKey={controlOpen}>
          <Suspense fallback={<div className="loading-card" role="status" aria-label={language === "en" ? "Loading control center" : "正在加载控制中心"}><span /><span /><span /></div>}>
            <ControlCenter
            preferences={preferences}
            runtimeState={runtimeState}
            snapshots={snapshots}
            diagnostics={appDiagnostics}
            language={language}
            onClose={() => closeModal("control")}
            onRefresh={() => refresh(true)}
            onPreferences={savePreferences}
            onRuntimeState={commitRuntimeState}
            onExport={handleExport}
            onImport={handleImport}
            onRestore={handleRestore}
            onCopyDiagnostics={handleCopyDiagnostics}
            operation={controlOperation}
            autostartEnabled={autostartEnabled}
            onAutostart={handleAutostart}
            />
          </Suspense>
        </ErrorBoundary>
      )}
      isConsuming={consumingProviders.has(current.provider)}
      consumingProviders={consumingProviders}
      notice={operationError}
      collapsing={collapsing}
    />
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QuotaCard, QuotaOrb } from "./components/QuotaCard";
import { EMPTY_UPDATE_STATE } from "./components/UpdatePanel";
import type { UpdateViewState } from "./components/UpdatePanel";
import { fetchSnapshots, getPreferences, getVolcengineDiagnostics, listenDesktopEvents, reconnectVolcengine, setAlwaysOnTop, setWidgetExpanded, startDragging, updatePreferences } from "./lib/bridge";
import { needsFastRefresh } from "./lib/format";
import { checkForAppUpdate, discardAppUpdate, downloadAppUpdate, installAppUpdate, openReleasePage } from "./lib/appUpdate";
import type { AppUpdateInfo } from "./lib/appUpdate";
import { copy, nextLanguage, normalizeLanguage } from "./lib/i18n";
import { DEFAULT_PROVIDER_ORDER, normalizeProviderOrder } from "./lib/providers";
import { detectRecentCodexReset, isRecentCodexReset } from "./lib/resetDetection";
import type { RecentCodexReset } from "./lib/resetDetection";
import { mergeSnapshots } from "./lib/snapshots";
import type { ProviderId, ProviderSnapshot, VolcengineDiagnostics, WidgetPreferences } from "./types";

const DEFAULT_PREFS: WidgetPreferences = { locked: false, alwaysOnTop: true, stayExpanded: false, pinnedProvider: null, providerOrder: DEFAULT_PROVIDER_ORDER, autoRotateSeconds: 12, language: "zh-CN", skippedUpdateVersion: null };

function errorMessage(error: unknown, fallback: string): string {
  if (typeof error === "string" && error.trim()) return error;
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

export default function App() {
  const [snapshots, setSnapshots] = useState<ProviderSnapshot[]>([]);
  const [recentCodexReset, setRecentCodexReset] = useState<RecentCodexReset | null>(null);
  const [preferences, setPreferences] = useState(DEFAULT_PREFS);
  const [activeIndex, setActiveIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [compact, setCompact] = useState(true);
  const [consumingProviders, setConsumingProviders] = useState<Set<string>>(() => new Set());
  const [operationError, setOperationError] = useState<string | null>(null);
  const [updateState, setUpdateState] = useState<UpdateViewState>(EMPTY_UPDATE_STATE);
  const [updateOpen, setUpdateOpen] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [diagnostics, setDiagnostics] = useState<VolcengineDiagnostics | null>(null);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const failures = useRef(0);
  const snapshotsRef = useRef<ProviderSnapshot[]>([]);
  const previousMetric = useRef(new Map<string, number>());
  const consumptionTimers = useRef(new Map<string, number>());
  const collapseTimer = useRef<number | null>(null);
  const hoverSequence = useRef(0);
  const updateSequence = useRef(0);
  const language = normalizeLanguage(preferences.language);
  const t = copy[language];

  const startUpdateDownload = useCallback(async (info: AppUpdateInfo, reveal = false) => {
    const sequence = ++updateSequence.current;
    if (reveal) setUpdateOpen(true);
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
      if (reveal) setUpdateOpen(true);
    }
  }, [t.updateFailed]);

  const checkUpdate = useCallback((manual = false) => {
    if (["available", "downloading", "ready", "installing"].includes(updateState.phase)) {
      if (manual) {
        setDiagnosticsOpen(false);
        setUpdateOpen(true);
      }
      return;
    }
    const sequence = ++updateSequence.current;
    if (manual) {
      setDiagnosticsOpen(false);
      setUpdateOpen(true);
      setUpdateState({ phase: "checking", info: null, progress: null, error: null });
    }
    setOperationError(null);
    void checkForAppUpdate().then(async (info) => {
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
      if (info.platform === "macos") {
        setUpdateState({ phase: "available", info, progress: null, error: null });
        return;
      }
      await startUpdateDownload(info, manual);
    }).catch((error) => {
      if (updateSequence.current !== sequence) return;
      setUpdateState({ phase: "error", info: null, progress: null, error: errorMessage(error, t.updateFailed) });
      setOperationError(t.updateFailed);
      if (manual) setUpdateOpen(true);
    });
  }, [preferences.skippedUpdateVersion, startUpdateDownload, t.updateFailed, updateState.phase]);

  const refresh = useCallback(async (force = false) => {
    try {
      const values = await fetchSnapshots(force);
      const hasFailure = values.some((item) => item.status !== "ok");
      if (hasFailure) failures.current += 1;
      else failures.current = 0;
      for (const item of values) {
        const nextMetric = item.weeklyWindow?.remainingPercent ?? item.balanceRemaining ?? undefined;
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
      const nextCodex = values.find((item) => item.provider === "codex");
      if (nextCodex) {
        const detected = detectRecentCodexReset(nextCodex, snapshotsRef.current.find((item) => item.provider === "codex") ?? null, now);
        setRecentCodexReset((current) => detected ?? (isRecentCodexReset(current, now) ? current : null));
      }
      setSnapshots((current) => {
        const merged = mergeSnapshots(current, values);
        snapshotsRef.current = merged;
        return merged;
      });
    } catch {
      failures.current += 1;
      setSnapshots((current) => {
        const next = current.length > 0
          ? current.map((item) => ({ ...item, status: "stale" as const, message: "Refresh failed. Please try again later." }))
          : [{ provider: "codex" as const, displayName: "CODEX", plan: null, shortWindow: null, weeklyWindow: null, resetCredits: null, resetCreditExpiresAt: [], updatedAt: new Date().toISOString(), status: "unavailable" as const, message: "Quota is temporarily unavailable. It will retry automatically." }];
        snapshotsRef.current = next;
        return next;
      });
    }
  }, []);

  const loadVolcengineDiagnostics = useCallback(async () => {
    setDiagnosticsLoading(true);
    try {
      setDiagnostics(await getVolcengineDiagnostics());
    } catch (error) {
      setOperationError(errorMessage(error, t.errorUnavailable));
    } finally {
      setDiagnosticsLoading(false);
    }
  }, [t.errorUnavailable]);

  const openVolcengineDiagnostics = useCallback(() => {
    setUpdateOpen(false);
    setDiagnosticsOpen(true);
    void loadVolcengineDiagnostics();
  }, [loadVolcengineDiagnostics]);

  const handleVolcengineReconnect = useCallback(async () => {
    setDiagnosticsOpen(true);
    setDiagnosticsLoading(diagnostics === null);
    setReconnecting(true);
    setOperationError(t.reconnectStarted);
    try {
      const value = await reconnectVolcengine();
      setDiagnostics(value);
      await refresh(true);
      setOperationError(t.reconnectSuccess);
    } catch (error) {
      setOperationError(errorMessage(error, t.reconnectFailed));
      try {
        setDiagnostics(await getVolcengineDiagnostics());
      } catch {
        // Preserve the actionable reconnect error when diagnostics also fail.
      }
    } finally {
      setDiagnosticsLoading(false);
      setReconnecting(false);
    }
  }, [diagnostics, refresh, t.reconnectFailed, t.reconnectStarted, t.reconnectSuccess]);

  useEffect(() => {
    void refresh(true);
    void getPreferences().then((value) => setPreferences({ ...DEFAULT_PREFS, ...value, language: normalizeLanguage(value.language) })).catch(() => setOperationError("Unable to read settings. Defaults are in use."));
    return () => {
      for (const timer of consumptionTimers.current.values()) window.clearTimeout(timer);
      consumptionTimers.current.clear();
      if (collapseTimer.current !== null) window.clearTimeout(collapseTimer.current);
    };
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    let cleanup: () => void = () => {};
    void listenDesktopEvents({ onPreferences: (value) => setPreferences({ ...DEFAULT_PREFS, ...value, language: normalizeLanguage(value.language) }), onRefresh: () => void refresh(true), onUpdate: () => checkUpdate(true) }).then((value) => {
      if (cancelled) value(); else cleanup = value;
    }).catch(() => setOperationError("Desktop event listener failed to start."));
    return () => { cancelled = true; cleanup(); };
  }, [checkUpdate, refresh]);

  useEffect(() => {
    const timer = window.setTimeout(() => checkUpdate(false), 12_000);
    return () => window.clearTimeout(timer);
  }, [checkUpdate]);

  const refreshMs = useMemo(() => {
    const backoff = failures.current === 0 ? 5 * 60_000 : Math.min(30 * 60_000, 30_000 * 2 ** (failures.current - 1));
    if (failures.current === 0 && snapshots.some((item) => item.status === "ok" && needsFastRefresh(item))) return 60_000;
    return backoff;
  }, [snapshots]);

  useEffect(() => {
    const id = window.setInterval(() => void refresh(), refreshMs);
    return () => window.clearInterval(id);
  }, [refresh, refreshMs]);

  useEffect(() => {
    const refreshWhenActive = () => { if (document.visibilityState === "visible") void refresh(true); };
    window.addEventListener("focus", refreshWhenActive);
    document.addEventListener("visibilitychange", refreshWhenActive);
    return () => {
      window.removeEventListener("focus", refreshWhenActive);
      document.removeEventListener("visibilitychange", refreshWhenActive);
    };
  }, [refresh]);

  useEffect(() => {
    if (hovered || preferences.pinnedProvider || snapshots.length < 2) return;
    const id = window.setInterval(() => setActiveIndex((value) => (value + 1) % snapshots.length), preferences.autoRotateSeconds * 1000);
    return () => window.clearInterval(id);
  }, [hovered, preferences.autoRotateSeconds, preferences.pinnedProvider, snapshots.length]);

  const orderedSnapshots = useMemo(() => {
    const order = normalizeProviderOrder(preferences.providerOrder);
    return [...snapshots].sort((left, right) => order.indexOf(left.provider) - order.indexOf(right.provider));
  }, [preferences.providerOrder, snapshots]);

  const current = preferences.pinnedProvider
    ? orderedSnapshots.find((item) => item.provider === preferences.pinnedProvider) ?? orderedSnapshots[0]
    : orderedSnapshots[activeIndex % Math.max(1, orderedSnapshots.length)];

  const savePreferences = useCallback((next: WidgetPreferences) => {
    const previous = preferences;
    setPreferences(next);
    setOperationError(null);
    void updatePreferences(next).catch(() => { setPreferences(previous); setOperationError("Settings could not be saved. Previous state restored."); });
  }, [preferences]);

  const handleUpdateOpen = useCallback(() => {
    setDiagnosticsOpen(false);
    if (["idle", "current", "error"].includes(updateState.phase)) {
      checkUpdate(true);
      return;
    }
    setUpdateOpen(true);
  }, [checkUpdate, updateState.phase]);

  const handleUpdateDownload = useCallback(() => {
    if (updateState.info) void startUpdateDownload(updateState.info, true);
  }, [startUpdateDownload, updateState.info]);

  const handleUpdateInstall = useCallback(() => {
    const info = updateState.info;
    if (!info) return;
    ++updateSequence.current;
    setUpdateOpen(true);
    setUpdateState({ phase: "installing", info, progress: updateState.progress, error: null });
    void installAppUpdate().catch((error) => {
      setUpdateState({ phase: "error", info, progress: null, error: errorMessage(error, t.updateFailed) });
      setOperationError(t.updateFailed);
    });
  }, [t.updateFailed, updateState.info, updateState.progress]);

  const handleUpdateSkip = useCallback(() => {
    const version = updateState.info?.version;
    if (!version) return;
    ++updateSequence.current;
    savePreferences({ ...preferences, skippedUpdateVersion: version });
    setUpdateState(EMPTY_UPDATE_STATE);
    setUpdateOpen(false);
    setOperationError(t.updateSkipped(version));
    void discardAppUpdate();
  }, [preferences, savePreferences, t, updateState.info?.version]);

  const handleUpdateRelease = useCallback(() => {
    void openReleasePage().catch(() => setOperationError(t.updateFailed));
  }, [t.updateFailed]);

  const handleHover = useCallback((value: boolean) => {
    if (collapseTimer.current !== null) {
      window.clearTimeout(collapseTimer.current);
      collapseTimer.current = null;
    }
    setHovered(value);
    if (!value && preferences.stayExpanded) return;
    if (value) void refresh(true);
    if (value) {
      const sequence = ++hoverSequence.current;
      void setWidgetExpanded(true)
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
      setCompact(true);
      void setWidgetExpanded(false).catch(() => setOperationError("Widget collapse failed."));
    }, 180);
  }, [preferences.stayExpanded, refresh]);

  useEffect(() => {
    if (!preferences.stayExpanded) return;
    if (collapseTimer.current !== null) window.clearTimeout(collapseTimer.current);
    setCompact(false);
    void setWidgetExpanded(true).catch(() => setOperationError("Widget expand failed."));
  }, [preferences.stayExpanded]);

  if (!current) return <div className="loading-card" aria-label={t.loadingQuota}><span /><span /><span /></div>;

  if (compact) {
    return <QuotaOrb snapshot={current} language={language} onDrag={() => startDragging()} onHover={handleHover} />;
  }

  return (
    <QuotaCard
      snapshot={current}
      snapshots={orderedSnapshots}
      preferences={preferences}
      onSelectProvider={(provider: ProviderId) => {
        const index = orderedSnapshots.findIndex((item) => item.provider === provider);
        if (index < 0) return;
        setActiveIndex(index);
        if (preferences.pinnedProvider) savePreferences({ ...preferences, pinnedProvider: provider });
      }}
      onLanguage={() => savePreferences({ ...preferences, language: nextLanguage(language) })}
      onToggleStayExpanded={() => savePreferences({ ...preferences, stayExpanded: !preferences.stayExpanded })}
      onReorderProviders={(providerOrder) => {
        const visibleOrder = providerOrder.filter((provider) => orderedSnapshots.some((item) => item.provider === provider));
        const nextIndex = visibleOrder.indexOf(current.provider);
        if (nextIndex >= 0) setActiveIndex(nextIndex);
        savePreferences({ ...preferences, providerOrder });
      }}
      onLock={() => { setOperationError(null); void setAlwaysOnTop(!preferences.alwaysOnTop).then((value) => setPreferences({ ...DEFAULT_PREFS, ...value, language: normalizeLanguage(value.language) })).catch(() => setOperationError("Always-on-top toggle failed.")); }}
      onDrag={() => startDragging()}
      onHover={handleHover}
      onRefresh={() => refresh(true)}
      onDiagnostics={openVolcengineDiagnostics}
      onCloseDiagnostics={() => setDiagnosticsOpen(false)}
      onReconnect={() => void handleVolcengineReconnect()}
      diagnostics={diagnostics}
      diagnosticsOpen={diagnosticsOpen}
      diagnosticsLoading={diagnosticsLoading}
      reconnecting={reconnecting}
      recentCodexReset={recentCodexReset}
      updateState={updateState}
      updateOpen={updateOpen}
      onUpdateOpen={handleUpdateOpen}
      onUpdateClose={() => setUpdateOpen(false)}
      onUpdateDownload={handleUpdateDownload}
      onUpdateInstall={handleUpdateInstall}
      onUpdateRetry={() => checkUpdate(true)}
      onUpdateLater={() => setUpdateOpen(false)}
      onUpdateSkip={handleUpdateSkip}
      onUpdateRelease={handleUpdateRelease}
      isConsuming={consumingProviders.has(current.provider)}
      consumingProviders={consumingProviders}
      notice={operationError}
    />
  );
}

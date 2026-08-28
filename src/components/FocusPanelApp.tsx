import { DotsSix, X } from "@phosphor-icons/react";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { resolveAppearanceMode, systemPrefersDark } from "../lib/appearance";
import { closeFocusPanel, fetchSnapshots, getPreferences, getRuntimeState, listenFocusPanelUpdates, startFocusPanelDragging } from "../lib/bridge";
import { normalizeWidgetPreferences } from "../lib/preferences";
import type { CockpitRegion, ProviderId, ProviderSnapshot, RuntimeState, WidgetPreferences } from "../types";
import { CockpitDashboard } from "./QuotaCard";

const providerIds = new Set<ProviderId>(["codex", "claude", "qoder", "trae", "workbuddy", "volcengine", "antigravity"]);
const regions = new Set<CockpitRegion>(["overview", "pace", "activity"]);

function targetFromLocation(): { region: CockpitRegion; provider: ProviderId } | null {
  const params = new URLSearchParams(window.location.search);
  const region = params.get("focusPanel") as CockpitRegion | null;
  const provider = params.get("provider") as ProviderId | null;
  return region && provider && regions.has(region) && providerIds.has(provider) ? { region, provider } : null;
}

const target = targetFromLocation();

interface FocusPanelState {
  preferences: WidgetPreferences;
  runtimeState: RuntimeState;
  snapshot: ProviderSnapshot;
}

export function FocusPanelApp() {
  const [value, setValue] = useState<FocusPanelState | null>(null);
  const [error, setError] = useState<string | null>(target ? null : "Invalid focus panel target.");
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  const reload = useCallback(async () => {
    if (!target) return;
    try {
      const [preferencesValue, runtimeState, snapshots] = await Promise.all([getPreferences(), getRuntimeState(), fetchSnapshots()]);
      const snapshot = snapshots.find((item) => item.provider === target.provider);
      if (!snapshot) throw new Error("Provider snapshot is unavailable.");
      setValue({ preferences: normalizeWidgetPreferences(preferencesValue), runtimeState, snapshot });
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Focus panel could not be refreshed.");
    }
  }, []);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemDark(query.matches);
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    void reload();
    const timer = window.setInterval(() => void reload(), 30_000);
    let cancelled = false;
    let unlisten: () => void = () => undefined;
    void listenFocusPanelUpdates(() => void reload()).then((cleanup) => {
      if (cancelled) cleanup(); else unlisten = cleanup;
    }).catch(() => undefined);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      unlisten();
    };
  }, [reload]);

  const preferences = value?.preferences;
  const language = preferences?.language === "en" ? "en" : "zh-CN";
  const resolvedAppearance = resolveAppearanceMode(preferences?.appearanceMode ?? "system", systemDark);
  useEffect(() => {
    document.documentElement.dataset.appearance = resolvedAppearance;
  }, [resolvedAppearance]);

  const regionLabel = target?.region === "overview"
    ? (language === "en" ? "Quota snapshot" : "额度快照")
    : target?.region === "pace"
      ? (language === "en" ? "Pace plan" : "节奏计划")
      : (language === "en" ? "Last 90 days" : "近 90 天用量");

  return (
    <main
      className={`focus-panel-window quota-card quota-card--style-${preferences?.colorTheme ?? "aurora"} quota-card--theme-${resolvedAppearance}`}
      style={{ "--accent-color": preferences?.accentColor ?? "#397ae0" } as CSSProperties}
    >
      <header className="focus-panel-header" onMouseDown={(event) => { if (event.button === 0) void startFocusPanelDragging(); }}>
        <DotsSix aria-hidden="true" />
        <div><small>QUOTA FLOAT · {language === "en" ? "DETACHED" : "独立面板"}</small><strong>{regionLabel}{value ? ` · ${value.snapshot.displayName}` : ""}</strong></div>
        <button type="button" aria-label={language === "en" ? "Close detached panel" : "关闭独立面板"} title={language === "en" ? "Close" : "关闭"} onMouseDown={(event) => event.stopPropagation()} onClick={() => void closeFocusPanel()}><X /></button>
      </header>
      <section className="focus-panel-body" aria-busy={!value && !error}>
        {value && target ? (
          <CockpitDashboard
            snapshot={value.snapshot}
            history={value.runtimeState.history}
            dailyUsage={value.runtimeState.dailyUsage}
            paceBaselines={value.runtimeState.dailyPaceBaselines}
            language={language}
            focusedRegion={target.region}
            onFocusRegion={() => undefined}
            detached
          />
        ) : error ? <p className="focus-panel-message" role="alert">{error}</p> : <p className="focus-panel-message" role="status">{language === "en" ? "Loading local quota data…" : "正在读取本地额度数据…"}</p>}
      </section>
    </main>
  );
}

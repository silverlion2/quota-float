import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WidgetPreferences } from "../types";
import type { AiHotCreditsReport, AiHotReport } from "./aihot";
import { fetchAiHotCredits, fetchAiHotResets } from "./bridge";
import { buildAiHotSignals } from "./aihotIntegration";
import { normalizeProviderOrder } from "./providers";

export const AIHOT_REFRESH_MS = 15 * 60_000;

/** Public feeds are shared by the panel, compact widget and reminders. No account data leaves the app. */
export function useAiHot(preferences: WidgetPreferences, readKeys: readonly string[], ready: boolean) {
  const [report, setReport] = useState<AiHotReport | null>(null);
  const [credits, setCredits] = useState<AiHotCreditsReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const flight = useRef<Promise<void> | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const refresh = useCallback(() => {
    if (flight.current) return flight.current;
    setLoading(true);
    setFailed(false);
    const work = Promise.allSettled([fetchAiHotResets(), fetchAiHotCredits()]).then(([resets, offers]) => {
      if (!mounted.current) return;
      if (resets.status === "fulfilled") setReport(resets.value);
      else setReport(previous => previous && { ...previous, sources: previous.sources.map(source => ({ ...source, status: "stale" })) });
      if (offers.status === "fulfilled") setCredits(offers.value);
      else setCredits(previous => previous && { ...previous, status: "stale" });
      setFailed(resets.status === "rejected" || offers.status === "rejected");
      setNow(new Date());
    }).finally(() => { flight.current = null; if (mounted.current) setLoading(false); });
    flight.current = work;
    return work;
  }, []);
  useEffect(() => {
    if (!ready || !preferences.aihotEnabled) return;
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, AIHOT_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [ready, preferences.aihotEnabled, refresh]);
  useEffect(() => {
    if (!preferences.aihotEnabled) return;
    const tick = () => setNow(new Date());
    const timer = window.setInterval(tick, 30_000);
    window.addEventListener("focus", tick);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", tick); };
  }, [preferences.aihotEnabled]);
  const enabledProviders = useMemo(() => normalizeProviderOrder(preferences.providerOrder).filter(provider =>
    !preferences.hiddenProviders.includes(provider) && !preferences.pausedProviders.includes(provider)),
  [preferences.providerOrder, preferences.hiddenProviders, preferences.pausedProviders]);
  const getSignals = useCallback((at: Date) => buildAiHotSignals(report, {
    enabled: ready && preferences.aihotEnabled === true, enabledProviders, readEventKeys: readKeys,
  }, at), [report, ready, preferences.aihotEnabled, enabledProviders, readKeys]);
  const signals = useMemo(() => getSignals(now), [getSignals, now]);
  return { report, credits, loading, failed, refresh, enabledProviders, signals, getSignals };
}

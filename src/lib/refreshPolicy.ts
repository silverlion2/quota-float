import type { ProviderId, ProviderSnapshot, ResourceMode } from "../types";
import { needsFastRefresh } from "./format";
import { DEFAULT_PROVIDER_ORDER } from "./providers";

export const BALANCED_REFRESH_MS = 5 * 60_000;
export const BALANCED_FAST_REFRESH_MS = 60_000;
export const BALANCED_ATTENTION_REFRESH_MS = 30 * 60_000;
export const FOCUS_REFRESH_MS = 15 * 60_000;
export const FOCUS_FAST_REFRESH_MS = 5 * 60_000;
export const FOCUS_ATTENTION_REFRESH_MS = 60 * 60_000;

export type ProviderAttemptTimes = Partial<Record<ProviderId, number>>;

export function monitoredProviderIds(pausedProviders: readonly ProviderId[]): ProviderId[] {
  const paused = new Set(pausedProviders);
  const monitored = DEFAULT_PROVIDER_ORDER.filter((provider) => !paused.has(provider));
  return monitored.length > 0 ? monitored : ["codex"];
}

export function providerRefreshInterval(snapshot: ProviderSnapshot | undefined, mode: ResourceMode): number {
  if (!snapshot || snapshot.status !== "ok") {
    return mode === "focus" ? FOCUS_ATTENTION_REFRESH_MS : BALANCED_ATTENTION_REFRESH_MS;
  }
  if (needsFastRefresh(snapshot)) {
    return mode === "focus" ? FOCUS_FAST_REFRESH_MS : BALANCED_FAST_REFRESH_MS;
  }
  return mode === "focus" ? FOCUS_REFRESH_MS : BALANCED_REFRESH_MS;
}

export function providersDueForRefresh(
  snapshots: readonly ProviderSnapshot[],
  monitoredProviders: readonly ProviderId[],
  attempts: ProviderAttemptTimes,
  mode: ResourceMode,
  now = Date.now(),
): ProviderId[] {
  const byProvider = new Map(snapshots.map((snapshot) => [snapshot.provider, snapshot]));
  return monitoredProviders.filter((provider) => {
    const attemptedAt = attempts[provider];
    if (attemptedAt === undefined) return true;
    return now - attemptedAt >= providerRefreshInterval(byProvider.get(provider), mode);
  });
}

export function nextProviderRefreshDelay(
  snapshots: readonly ProviderSnapshot[],
  monitoredProviders: readonly ProviderId[],
  attempts: ProviderAttemptTimes,
  mode: ResourceMode,
  now = Date.now(),
): number {
  const byProvider = new Map(snapshots.map((snapshot) => [snapshot.provider, snapshot]));
  let next = Number.POSITIVE_INFINITY;
  for (const provider of monitoredProviders) {
    const attemptedAt = attempts[provider];
    if (attemptedAt === undefined) return 0;
    next = Math.min(next, Math.max(0, providerRefreshInterval(byProvider.get(provider), mode) - (now - attemptedAt)));
  }
  return Number.isFinite(next) ? next : FOCUS_ATTENTION_REFRESH_MS;
}

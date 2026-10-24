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

function refreshDelay(attemptedAt: number | undefined, interval: number, now: number): number {
  // A wall-clock correction must not strand the one-shot scheduler or extend
  // a provider's cooldown by the size of the correction.
  if (attemptedAt === undefined || !Number.isFinite(attemptedAt) || now < attemptedAt) return 0;
  return Math.max(0, interval - (now - attemptedAt));
}

export function providersToRetryOnReconnect(
  snapshots: readonly ProviderSnapshot[],
  monitoredProviders: readonly ProviderId[],
): ProviderId[] {
  const monitored = new Set(monitoredProviders);
  return snapshots.filter((snapshot) => monitored.has(snapshot.provider)
    && (snapshot.status === "stale" || snapshot.status === "unavailable"))
    .map((snapshot) => snapshot.provider);
}

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
    return refreshDelay(attemptedAt, providerRefreshInterval(byProvider.get(provider), mode), now) === 0;
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
    next = Math.min(next, refreshDelay(attemptedAt, providerRefreshInterval(byProvider.get(provider), mode), now));
  }
  return Number.isFinite(next) ? next : FOCUS_ATTENTION_REFRESH_MS;
}

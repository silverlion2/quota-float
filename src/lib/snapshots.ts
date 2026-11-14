import type { ProviderId, ProviderSnapshot, SnapshotRefreshProgress } from "../types";

export interface ProgressiveSnapshotState {
  requestId: string;
  receivedProviders: Set<ProviderId>;
  finalized: boolean;
}

export function hasQuotaData(snapshot: ProviderSnapshot): boolean {
  return Boolean(snapshot.shortWindow || snapshot.weeklyWindow || snapshot.monthlyWindow
    || snapshot.resetCredits != null || snapshot.balanceRemaining != null);
}

export function failedSnapshot(provider: ProviderId, now = new Date().toISOString()): ProviderSnapshot {
  return { provider, displayName: provider.toUpperCase(), plan: null, shortWindow: null,
    weeklyWindow: null, resetCredits: null, updatedAt: now, status: "unavailable",
    message: "Provider did not return quota data. Check the local app and try again." };
}

export function mergeSnapshots(
  current: ProviderSnapshot[],
  incoming: ProviderSnapshot[],
  refreshedProviders: readonly ProviderSnapshot["provider"][] = incoming.map((item) => item.provider),
): ProviderSnapshot[] {
  const refreshed = new Set(refreshedProviders);
  // A source can disappear while its local app restarts. Preserve evidence of
  // an already detected source, but do not invent a quota for a new source.
  const complete = [...incoming];
  for (const provider of refreshed) {
    if (!complete.some((item) => item.provider === provider) && current.some((item) => item.provider === provider)) {
      complete.push(failedSnapshot(provider));
    }
  }
  const resolvedIncoming: ProviderSnapshot[] = complete.map((next) => {
    if (next.status === "ok") return next;
    if (next.status === "signed_out") return next;
    const previous = current.find((item) => (
      item.provider === next.provider
      && (item.status === "ok" || item.status === "stale") && hasQuotaData(item)
    ));
    return previous
      ? { ...previous, status: "stale", message: next.message, updatedAt: previous.updatedAt }
      : next;
  });
  const incomingProviders = new Set(incoming.map((item) => item.provider));
  const untouched = current.filter((item) => !refreshed.has(item.provider) && !incomingProviders.has(item.provider));
  return [...untouched, ...resolvedIncoming];
}

export function failSnapshotRefresh(current: ProviderSnapshot[], missing: readonly ProviderId[]): ProviderSnapshot[] {
  return mergeSnapshots(current, missing.map((provider) => {
    // An IPC/network failure is not evidence of a restored login.
    const signedOut = current.find((item) => item.provider === provider && item.status === "signed_out");
    return signedOut ?? failedSnapshot(provider);
  }), missing);
}

export function finalizeSnapshotProgress(state: ProgressiveSnapshotState, activeRequestId: string | null): boolean {
  if (activeRequestId !== state.requestId || state.finalized) return false;
  state.finalized = true;
  return true;
}

export function mergeSnapshotProgress(
  state: ProgressiveSnapshotState,
  activeRequestId: string | null,
  current: ProviderSnapshot[],
  progress: SnapshotRefreshProgress,
): ProviderSnapshot[] | null {
  if (activeRequestId !== state.requestId
    || progress.requestId !== state.requestId
    || state.finalized
    || state.receivedProviders.has(progress.providerId)
    || !progress.requestedProviderIds.includes(progress.providerId)
    || progress.snapshots.some((item) => item.provider !== progress.providerId)) return null;
  state.receivedProviders.add(progress.providerId);
  return mergeSnapshots(current, progress.snapshots, [progress.providerId]);
}

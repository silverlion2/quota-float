import type { ProviderId, ProviderSnapshot, SnapshotRefreshProgress } from "../types";

export interface ProgressiveSnapshotState {
  requestId: string;
  receivedProviders: Set<ProviderId>;
  finalized: boolean;
}

export function mergeSnapshots(
  current: ProviderSnapshot[],
  incoming: ProviderSnapshot[],
  refreshedProviders: readonly ProviderSnapshot["provider"][] = incoming.map((item) => item.provider),
): ProviderSnapshot[] {
  const refreshed = new Set(refreshedProviders);
  const resolvedIncoming: ProviderSnapshot[] = incoming.map((next) => {
    if (next.status === "ok") return next;
    if (next.status === "signed_out") return next;
    const previous = current.find((item) => (
      item.provider === next.provider
      && (item.shortWindow
        || item.weeklyWindow
        || item.monthlyWindow
        || item.resetCredits !== null && item.resetCredits !== undefined
        || item.balanceRemaining !== null && item.balanceRemaining !== undefined)
    ));
    return previous
      ? { ...previous, status: "stale", message: next.message, updatedAt: previous.updatedAt }
      : next;
  });
  const incomingProviders = new Set(incoming.map((item) => item.provider));
  const untouched = current.filter((item) => !refreshed.has(item.provider) && !incomingProviders.has(item.provider));
  return [...untouched, ...resolvedIncoming];
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
    || state.receivedProviders.has(progress.providerId)) return null;
  state.receivedProviders.add(progress.providerId);
  return mergeSnapshots(current, progress.snapshots, [progress.providerId]);
}

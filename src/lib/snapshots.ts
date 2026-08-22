import type { ProviderSnapshot } from "../types";

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
      && (item.shortWindow || item.weeklyWindow || item.monthlyWindow || item.balanceRemaining !== null && item.balanceRemaining !== undefined)
    ));
    return previous
      ? { ...previous, status: "stale", message: next.message, updatedAt: previous.updatedAt }
      : next;
  });
  const incomingProviders = new Set(incoming.map((item) => item.provider));
  const untouched = current.filter((item) => !refreshed.has(item.provider) && !incomingProviders.has(item.provider));
  return [...untouched, ...resolvedIncoming];
}

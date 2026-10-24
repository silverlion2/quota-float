import type { ProviderId, ProviderSnapshot, QuotaHistoryPoint } from "../types";

export function knownPlanChanged(previous: string | null | undefined, next: string | null | undefined): boolean {
  return previous != null && next != null && previous !== next;
}

export function observedQuotaDelta(previous: QuotaHistoryPoint | undefined, point: QuotaHistoryPoint, knownPlan = previous?.plan): number {
  return previous?.metricKind === "percent" && point.metricKind === "percent"
    && previous.metric !== null && point.metric !== null
    && previous.resetsAt === point.resetsAt && !knownPlanChanged(knownPlan, point.plan)
    ? Math.max(0, previous.metric - point.metric) : 0;
}

/** History is retained in capture order; inspect backwards without copying it. */
export function priorKnownPlan(
  previous: Pick<ProviderSnapshot, "provider" | "plan"> | null | undefined,
  history: readonly QuotaHistoryPoint[],
  provider: ProviderId,
  at = Number.POSITIVE_INFINITY,
): string | null {
  if (previous?.provider === provider && previous.plan != null) return previous.plan;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const point = history[index];
    if (point.provider === provider && point.plan != null && Date.parse(point.capturedAt) <= at) return point.plan;
  }
  return null;
}

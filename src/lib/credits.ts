import type { CreditGrant, CreditSample, ProviderSnapshot, QuotaHistoryPoint } from "../types";
import { knownPlanChanged } from "./quotaContinuity";

export type CreditKind = "reset" | "balance";
export interface CreditPool {
  kind: CreditKind;
  remaining: number | null;
  unlimited: boolean;
  expirations: CreditGrant[];
}
export interface CreditChange {
  at: string;
  remaining: number;
  delta: number | null;
}

const supportsBalance = new Set(["codex", "qoder", "trae", "workbuddy"]);
const finite = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;

export function normalizeCreditSample(value: unknown): CreditSample | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value as Record<string, unknown>;
  return { reset: finite(candidate.reset), balance: finite(candidate.balance),
    unit: candidate.unit === "credits" || candidate.unit === "unlimited" ? candidate.unit : null };
}

export function snapshotCredits(snapshot: ProviderSnapshot): CreditSample | undefined {
  if (snapshot.provider !== "codex" && !supportsBalance.has(snapshot.provider)) return undefined;
  return { reset: finite(snapshot.resetCredits), balance: snapshot.balanceUnit === "credits" ? finite(snapshot.balanceRemaining) : null,
    unit: snapshot.balanceUnit === "credits" || snapshot.balanceUnit === "unlimited" ? snapshot.balanceUnit : null };
}

export function creditSamplesEqual(left?: CreditSample, right?: CreditSample): boolean {
  return left?.reset === right?.reset && left?.balance === right?.balance && left?.unit === right?.unit;
}

/** Only provider-supplied timestamps. Unknown does not mean non-expiring. */
export function creditPools(snapshot: ProviderSnapshot): CreditPool[] {
  const pools: CreditPool[] = [];
  const usable = snapshot.status === "ok" || snapshot.status === "stale";
  if (snapshot.provider === "codex" || snapshot.resetCredits != null) {
    const dates = [...new Set(snapshot.resetCreditExpiresAt ?? [])].filter((value) => Number.isFinite(Date.parse(value)))
      .sort((a, b) => Date.parse(a) - Date.parse(b)).slice(0, 32);
    pools.push({ kind: "reset", remaining: usable ? finite(snapshot.resetCredits) : null, unlimited: false,
      expirations: usable ? dates.map((expiresAt) => ({ remaining: null, expiresAt })) : [] });
  }
  if (supportsBalance.has(snapshot.provider) || snapshot.balanceUnit === "credits") {
    const grants = (snapshot.balanceGrants ?? []).slice(0, 32).map((grant) => ({ remaining: finite(grant.remaining),
      expiresAt: grant.expiresAt && Number.isFinite(Date.parse(grant.expiresAt)) ? grant.expiresAt : null }))
      .sort((a, b) => (a.expiresAt ? Date.parse(a.expiresAt) : Infinity) - (b.expiresAt ? Date.parse(b.expiresAt) : Infinity));
    pools.push({ kind: "balance", remaining: usable && snapshot.balanceUnit === "credits" ? finite(snapshot.balanceRemaining) : null,
      unlimited: usable && snapshot.balanceUnit === "unlimited", expirations: usable ? grants : [] });
  }
  return pools;
}

/** Local observations, not a billing ledger: decreases may include expiry. */
export function creditChanges(history: readonly QuotaHistoryPoint[], snapshot: ProviderSnapshot, kind: CreditKind, now: Date): CreditChange[] {
  const cutoff = now.getTime() - 30 * 86_400_000;
  const byTime = new Map<number, QuotaHistoryPoint>();
  for (const point of history) {
    const at = Date.parse(point.capturedAt);
    if (point.provider === snapshot.provider && at >= cutoff && at <= now.getTime()) byTime.set(at, point);
  }
  const points = [...byTime.values()].sort((a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt));
  let previous: number | null = null;
  let knownPlan: string | null = null;
  let lastAt: number | null = null;
  const changes: CreditChange[] = [];
  for (const point of points) {
    const at = Date.parse(point.capturedAt);
    const value = point.status === "ok" && (kind === "reset" || point.credits?.unit === "credits") ? finite(point.credits?.[kind]) : null;
    if (knownPlanChanged(knownPlan, point.plan) || (lastAt !== null && at - lastAt > 6 * 60 * 60_000)) previous = null;
    if (point.plan?.trim()) knownPlan = point.plan;
    if (value === null) { previous = null; lastAt = at; continue; }
    if (previous === null || value !== previous) changes.push({ at: point.capturedAt, remaining: value,
      delta: previous === null ? null : Number((value - previous).toFixed(6)) });
    previous = value;
    lastAt = at;
  }
  return changes.slice(-8).reverse();
}

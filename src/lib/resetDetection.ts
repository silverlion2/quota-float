import type { ProviderSnapshot } from "../types";

export const RECENT_CODEX_RESET_MS = 6 * 60 * 60_000;
const RESET_RECOVERY_TOLERANCE_PERCENT = 0.5;
const SNAPSHOT_FRESHNESS_MS = 20 * 60_000;
const CLOCK_TOLERANCE_MS = 2 * 60_000;

export interface RecentCodexReset {
  detectedAt: string;
  resetAt: string;
  source: "window" | "observed";
}

function windowStartedAt(snapshot: ProviderSnapshot): number | null {
  const window = snapshot.weeklyWindow;
  if (!window?.resetsAt || !Number.isFinite(window.windowSeconds) || window.windowSeconds <= 0) return null;
  const resetsAt = Date.parse(window.resetsAt);
  if (!Number.isFinite(resetsAt)) return null;
  return resetsAt - window.windowSeconds * 1000;
}

function freshSnapshot(snapshot: ProviderSnapshot, nowMs: number): boolean {
  const updatedAt = Date.parse(snapshot.updatedAt);
  const age = nowMs - updatedAt;
  return Number.isFinite(updatedAt) && age >= -CLOCK_TOLERANCE_MS && age <= SNAPSHOT_FRESHNESS_MS;
}

export function detectRecentCodexReset(
  current: ProviderSnapshot,
  previous: ProviderSnapshot | null,
  now = new Date(),
): RecentCodexReset | null {
  if (current.provider !== "codex" || current.status !== "ok" || !current.weeklyWindow) return null;
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs) || !freshSnapshot(current, nowMs)) return null;

  const currentStart = windowStartedAt(current);
  const currentRemaining = current.weeklyWindow.remainingPercent;
  const previousIsFresh = previous?.provider === "codex"
    && previous.status === "ok"
    && freshSnapshot(previous, nowMs);
  const previousRemaining = previousIsFresh ? previous.weeklyWindow?.remainingPercent : undefined;
  const recovered = Number.isFinite(currentRemaining) && previousRemaining !== undefined && Number.isFinite(previousRemaining)
    && currentRemaining - previousRemaining > RESET_RECOVERY_TOLERANCE_PERCENT;
  // An old sample cannot prove a recovery, but its cycle identity still
  // prevents the same window being announced again after a transient failure.
  const previousStart = previous?.provider === "codex" ? windowStartedAt(previous) : null;
  const windowAdvanced = previousIsFresh && currentStart !== null && previousStart !== null
    && currentStart > previousStart + CLOCK_TOLERANCE_MS;
  const creditConsumed = previousIsFresh
    && previous.resetCredits !== null && current.resetCredits !== null
    && Number.isFinite(previous.resetCredits) && Number.isFinite(current.resetCredits)
    && current.resetCredits < previous.resetCredits;

  if (recovered && (windowAdvanced || creditConsumed)) {
    const currentStartAge = currentStart === null ? Number.POSITIVE_INFINITY : nowMs - currentStart;
    const resetAt = currentStart !== null && currentStartAge >= -CLOCK_TOLERANCE_MS && currentStartAge <= RECENT_CODEX_RESET_MS
      ? currentStart
      : nowMs;
    return { detectedAt: now.toISOString(), resetAt: new Date(resetAt).toISOString(), source: "observed" };
  }

  if (currentStart !== null) {
    const age = nowMs - currentStart;
    const newlyObservedWindow = previousStart === null || Math.abs(previousStart - currentStart) > CLOCK_TOLERANCE_MS;
    if (newlyObservedWindow && age >= -CLOCK_TOLERANCE_MS && age <= RECENT_CODEX_RESET_MS) {
      const resetAt = new Date(currentStart).toISOString();
      return { detectedAt: resetAt, resetAt, source: "window" };
    }
  }
  return null;
}

export function isRecentCodexReset(value: RecentCodexReset | null, now = new Date()): value is RecentCodexReset {
  if (!value) return false;
  const resetAt = Date.parse(value.resetAt);
  const age = now.getTime() - resetAt;
  return Number.isFinite(resetAt) && age >= -CLOCK_TOLERANCE_MS && age <= RECENT_CODEX_RESET_MS;
}

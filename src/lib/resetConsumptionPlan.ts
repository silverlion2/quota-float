import type { ProviderSnapshot, QuotaHistoryPoint } from "../types";

const HOUR_MS = 60 * 60_000;
const MIN_SAMPLE_COUNT = 3;
const MIN_SAMPLE_SPAN_MS = 30 * 60_000;
const MAX_HISTORY_AGE_MS = 6 * HOUR_MS;
const MAX_LATEST_AGE_MS = 15 * 60_000;
const MAX_SAMPLE_GAP_MS = 60 * 60_000;
const REFILL_TOLERANCE_PERCENT = 0.5;

export type ResetConsumptionObservationStatus =
  | "observed"
  | "insufficient_history"
  | "ambiguous_history"
  | "stale_history"
  | "refill"
  | "gap";

export interface ResetConsumptionPlan {
  provider: ProviderSnapshot["provider"];
  remainingPercent: number;
  hoursUntilReset: number;
  targetPercentPerHour: number;
  observedBurnPercentPerHour: number | null;
  forecastHoursToExhaustion: number | null;
  forecastUnusedPercentAtReset: number | null;
  sampleCount: number;
  sampleSpanMinutes: number;
  observationStatus: ResetConsumptionObservationStatus;
  observationReason: string | null;
}

interface Sample {
  capturedAt: number;
  remainingPercent: number;
  resetsAt: number | null;
  metricKind: QuotaHistoryPoint["metricKind"];
  status: QuotaHistoryPoint["status"];
}

function finiteDate(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function validPercent(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value >= 0 && value <= 100;
}

function sameReset(sample: Sample, resetAt: number): boolean {
  return sample.resetsAt === resetAt;
}

function planWithObservation(
  snapshot: ProviderSnapshot,
  remainingPercent: number,
  hoursUntilReset: number,
  targetPercentPerHour: number,
  observationStatus: ResetConsumptionObservationStatus,
  observationReason: string | null,
  samples: Sample[],
  observedBurnPercentPerHour: number | null,
): ResetConsumptionPlan {
  const sampleSpanMinutes = samples.length >= 2
    ? (samples.at(-1)!.capturedAt - samples[0].capturedAt) / 60_000
    : 0;
  const forecastHoursToExhaustion = observedBurnPercentPerHour !== null && observedBurnPercentPerHour > 0
    ? remainingPercent / observedBurnPercentPerHour
    : null;
  const forecastUnusedPercentAtReset = observedBurnPercentPerHour !== null
    ? Math.max(0, remainingPercent - observedBurnPercentPerHour * hoursUntilReset)
    : null;
  return {
    provider: snapshot.provider,
    remainingPercent,
    hoursUntilReset,
    targetPercentPerHour,
    observedBurnPercentPerHour,
    forecastHoursToExhaustion,
    forecastUnusedPercentAtReset,
    sampleCount: samples.length,
    sampleSpanMinutes,
    observationStatus,
    observationReason,
  };
}

/**
 * Build a conservative plan for consuming the current weekly allowance before
 * the provider-reported reset. History is only considered weekly when its
 * reset identity matches the current weekly reset timestamp. This matters for
 * providers whose retained history can represent a short window instead.
 */
export function calculateResetConsumptionPlan(
  snapshot: ProviderSnapshot,
  history: QuotaHistoryPoint[],
  now = new Date(),
): ResetConsumptionPlan | null {
  const nowMs = now.getTime();
  const weeklyWindow = snapshot.weeklyWindow;
  const resetAt = weeklyWindow?.resetsAt ? finiteDate(weeklyWindow.resetsAt) : null;
  const remaining = weeklyWindow?.remainingPercent;
  const updatedAt = finiteDate(snapshot.updatedAt);
  if (
    snapshot.status !== "ok"
    || !Number.isFinite(nowMs)
    || updatedAt === null
    || updatedAt > nowMs
    || nowMs - updatedAt > MAX_LATEST_AGE_MS
    || resetAt === null
    || resetAt <= nowMs
    || remaining === undefined
    || !validPercent(remaining)
  ) {
    return null;
  }
  const remainingPercent = remaining;

  const hoursUntilReset = (resetAt - nowMs) / HOUR_MS;
  const targetPercentPerHour = remainingPercent / hoursUntilReset;
  const historyStart = nowMs - MAX_HISTORY_AGE_MS;
  const cycleStart = weeklyWindow && Number.isFinite(weeklyWindow.windowSeconds) && weeklyWindow.windowSeconds > 0
    ? resetAt - weeklyWindow.windowSeconds * 1000
    : null;
  const samples: Sample[] = history
    .filter((point) => point.provider === snapshot.provider)
    .map((point): Sample | null => {
      const capturedAt = finiteDate(point.capturedAt);
      return capturedAt === null
        || capturedAt > updatedAt
        || capturedAt < historyStart
        || (cycleStart !== null && capturedAt < cycleStart)
        ? null
        : {
            capturedAt,
            remainingPercent: point.metric ?? Number.NaN,
            resetsAt: point.resetsAt === null ? null : finiteDate(point.resetsAt),
            metricKind: point.metricKind,
            status: point.status,
          };
    })
    .filter((point): point is Sample => point !== null)
    .sort((left, right) => left.capturedAt - right.capturedAt);

  const deduplicatedSamples: Sample[] = [];
  for (const sample of samples) {
    const previous = deduplicatedSamples.at(-1);
    if (previous?.capturedAt === sample.capturedAt) deduplicatedSamples[deduplicatedSamples.length - 1] = sample;
    else deduplicatedSamples.push(sample);
  }
  if (updatedAt >= historyStart && validPercent(remainingPercent)) {
    const currentSample: Sample = {
      capturedAt: updatedAt,
      remainingPercent,
      resetsAt: resetAt,
      metricKind: "percent",
      status: "ok",
    };
    const existingIndex = deduplicatedSamples.findIndex((sample) => sample.capturedAt === updatedAt);
    if (existingIndex >= 0) deduplicatedSamples[existingIndex] = currentSample;
    else deduplicatedSamples.push(currentSample);
    deduplicatedSamples.sort((left, right) => left.capturedAt - right.capturedAt);
  }

  let segment: Sample[] = [];
  let lastBoundary: ResetConsumptionObservationStatus = "insufficient_history";
  let lastBoundaryReason = "Need at least 3 recent weekly samples spanning 30 minutes.";
  let previous: Sample | null = null;

  for (const sample of deduplicatedSamples) {
    const isWeeklySample = sample.metricKind === "percent"
      && sample.status === "ok"
      && validPercent(sample.remainingPercent)
      && sameReset(sample, resetAt);
    if (!isWeeklySample) {
      segment = [];
      previous = null;
      if (sample.status !== "ok") {
        lastBoundary = "stale_history";
        lastBoundaryReason = "Recent history includes stale or unavailable quota data.";
      } else if (sample.metricKind !== "percent" || !validPercent(sample.remainingPercent)) {
        lastBoundary = "ambiguous_history";
        lastBoundaryReason = "Recent history does not unambiguously represent a weekly percentage.";
      } else {
        lastBoundary = "ambiguous_history";
        lastBoundaryReason = "The weekly reset identity changed in recent history.";
      }
      continue;
    }

    if (previous !== null) {
      const gap = sample.capturedAt - previous.capturedAt;
      if (gap > MAX_SAMPLE_GAP_MS) {
        segment = [];
        lastBoundary = "gap";
        lastBoundaryReason = "Recent weekly history has a gap longer than 60 minutes.";
      } else if (sample.remainingPercent > previous.remainingPercent + REFILL_TOLERANCE_PERCENT) {
        segment = [];
        lastBoundary = "refill";
        lastBoundaryReason = "A quota refill larger than 0.5 percentage points interrupted the burn history.";
      }
    }
    segment.push(sample);
    previous = sample;
  }

  const latest = segment.at(-1);
  if (latest === undefined) {
    return planWithObservation(
      snapshot,
      remainingPercent,
      hoursUntilReset,
      targetPercentPerHour,
      lastBoundary,
      lastBoundaryReason,
      segment,
      null,
    );
  }
  if (nowMs - latest.capturedAt > MAX_LATEST_AGE_MS) {
    return planWithObservation(
      snapshot,
      remainingPercent,
      hoursUntilReset,
      targetPercentPerHour,
      "stale_history",
      "The latest weekly history sample is older than 15 minutes.",
      segment,
      null,
    );
  }
  const spanMs = segment.length >= 2 ? segment.at(-1)!.capturedAt - segment[0].capturedAt : 0;
  if (segment.length < MIN_SAMPLE_COUNT || spanMs < MIN_SAMPLE_SPAN_MS) {
    return planWithObservation(
      snapshot,
      remainingPercent,
      hoursUntilReset,
      targetPercentPerHour,
      lastBoundary,
      lastBoundaryReason,
      segment,
      null,
    );
  }

  const first = segment[0];
  const burn = (first.remainingPercent - latest.remainingPercent) / ((latest.capturedAt - first.capturedAt) / HOUR_MS);
  if (!Number.isFinite(burn) || burn < 0) {
    return planWithObservation(
      snapshot,
      remainingPercent,
      hoursUntilReset,
      targetPercentPerHour,
      "insufficient_history",
      "Recent weekly history does not show a positive burn rate.",
      segment,
      null,
    );
  }
  return planWithObservation(snapshot, remainingPercent, hoursUntilReset, targetPercentPerHour, "observed", null, segment, burn);
}

export const buildResetConsumptionPlan = calculateResetConsumptionPlan;

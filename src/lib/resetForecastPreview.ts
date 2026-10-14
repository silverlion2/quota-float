import type { ResetForecast } from "../types";

/** Synthetic preview data only; never reads an account or a public endpoint. */
export function createPreviewResetForecast(generatedAt = new Date()): ResetForecast {
  const generated = generatedAt.toISOString();
  const recentBaseline = new Date(generatedAt.getTime() - 30 * 3_600_000).toISOString();
  const radarBaseline = new Date(generatedAt.getTime() - 18 * 86_400_000).toISOString();
  const signalBaseline = new Date(generatedAt.getTime() - 81 * 86_400_000).toISOString();
  const watchStart = new Date(generatedAt);
  watchStart.setUTCHours(3, 0, 0, 0);
  const watchEnd = new Date(watchStart.getTime() + 3 * 3_600_000);
  if (watchEnd.getTime() <= generatedAt.getTime()) {
    watchStart.setUTCDate(watchStart.getUTCDate() + 1);
    watchEnd.setUTCDate(watchEnd.getUTCDate() + 1);
  }
  const exclusionReason = "Reported reset baseline is more than 24 hours older than the newest reported baseline.";
  return {
    score: 34, windowHours: 48, fetchedAt: generated,
    resetAnnounced: false, resetAt: null, expectedAt: null,
    sourceUrl: "https://codex-reset.com/", sourceCount: 1,
    confidence: "low", quality: "conflicting", scoreMin: 34, scoreMax: 34,
    qualityReason: "Sources report different reset baselines; the primary reference remains available.",
    latestResetAt: recentBaseline,
    prediction: {
      sourceName: "Codex Reset", sourceUrl: "https://codex-reset.com/", basis: "source_model",
      reportedLastResetAt: recentBaseline, generatedAt: generated,
      validUntil: new Date(generatedAt.getTime() + 48 * 3_600_000).toISOString(),
      estimate24h: 19, estimate48h: 34,
      range24h: { lower: 9.9, upper: 32.5 }, range48h: { lower: 21.8, upper: 48.7 },
      calibration: "experimental", confidence: "low", expectedWindow: null,
      watchWindow: { startAt: watchStart.toISOString(), endAt: watchEnd.toISOString() },
      reason: "Synthetic example of a primary model reference with older reported tracker baselines excluded; not a live forecast.",
    },
    sources: [
      { name: "Codex Reset", score: 34, fetchedAt: generated, sourceUrl: "https://codex-reset.com/", lastResetAt: recentBaseline, included: true, baselineVerified: true },
      { name: "Codex Reset Radar", score: 50, fetchedAt: generated, sourceUrl: "https://codexresetradar.com/", lastResetAt: radarBaseline, included: false, baselineVerified: true, exclusionReason },
      { name: "Will Codex Reset Today", score: 94, fetchedAt: generated, sourceUrl: "https://codexreset.app/", lastResetAt: signalBaseline, included: false, baselineVerified: true, exclusionReason },
    ],
    exclusions: [
      { name: "Codex Reset Radar", sourceUrl: "https://codexresetradar.com/", lastResetAt: radarBaseline, reason: exclusionReason },
      { name: "Will Codex Reset Today", sourceUrl: "https://codexreset.app/", lastResetAt: signalBaseline, reason: exclusionReason },
    ],
  };
}

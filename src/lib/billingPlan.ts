import type { CodexTokenUsageReport } from "../types";
import { bucketsInWindow, summarizeTokenBuckets } from "./tokenUsage";

export interface BillingCycleUsage {
  startAt: string;
  endAt: string;
  elapsedDays: number;
  totalTokens: number;
  tokensPerDay: number;
  requests: number;
  requestsPerDay: number;
  activeDays: number;
  sessions: number;
}

export type PlanRecommendation = "keep" | "downgrade" | "pending";

export interface CodexBillingPlanComparison {
  upgradeDate: string;
  targetRatio: number;
  baseline: BillingCycleUsage;
  latestCompleted20x: BillingCycleUsage | null;
  current20x: BillingCycleUsage;
  upgradedToDate: BillingCycleUsage;
  achievedRatio: number;
  completedCycleRatio: number | null;
  currentCycleRatio: number;
  targetProgress: number;
  targetTokensPerDay: number;
  targetTokensPerWeek: number;
  targetTokensCurrentCycle: number;
  targetTokensCurrentToDate: number;
  recommendation: PlanRecommendation;
  coverageComplete: boolean;
}

function parseLocalDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const parsed = new Date(year, month, day);
  return parsed.getFullYear() === year && parsed.getMonth() === month && parsed.getDate() === day ? parsed : null;
}

function addBillingMonth(value: Date, months: number): Date {
  const targetMonth = value.getMonth() + months;
  const lastDay = new Date(value.getFullYear(), targetMonth + 1, 0).getDate();
  return new Date(value.getFullYear(), targetMonth, Math.min(value.getDate(), lastDay));
}

function localElapsedDays(start: Date, end: Date): number {
  const wallClock = (value: Date) => Date.UTC(
    value.getFullYear(),
    value.getMonth(),
    value.getDate(),
    value.getHours(),
    value.getMinutes(),
    value.getSeconds(),
    value.getMilliseconds(),
  );
  return Math.max(0, (wallClock(end) - wallClock(start)) / 86_400_000);
}

function summarizeBillingCycle(report: CodexTokenUsageReport, start: Date, end: Date): BillingCycleUsage {
  const elapsedDays = localElapsedDays(start, end);
  const summary = summarizeTokenBuckets(bucketsInWindow(report.buckets, start, end));
  return {
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    elapsedDays,
    totalTokens: summary.totalTokens,
    tokensPerDay: elapsedDays > 0 ? summary.totalTokens / elapsedDays : 0,
    requests: summary.requests,
    requestsPerDay: elapsedDays > 0 ? summary.requests / elapsedDays : 0,
    activeDays: summary.activeDays,
    sessions: summary.sessions,
  };
}

/**
 * Compares the full 5x billing cycle immediately before an upgrade with all
 * locally indexed 20x usage after it. The keep/downgrade decision is made only
 * from a completed 20x cycle; the current partial cycle is a pacing signal.
 */
export function buildCodexBillingPlanComparison(
  report: CodexTokenUsageReport,
  upgradeDate: string,
  now = new Date(),
  targetRatio = 2,
): CodexBillingPlanComparison | null {
  const upgradeStart = parseLocalDate(upgradeDate);
  if (!upgradeStart || targetRatio <= 0 || upgradeStart.getTime() >= now.getTime()) return null;
  const baselineStart = addBillingMonth(upgradeStart, -1);
  const baseline = summarizeBillingCycle(report, baselineStart, upgradeStart);
  if (baseline.tokensPerDay <= 0) return null;

  const completed: BillingCycleUsage[] = [];
  let currentStart = upgradeStart;
  let nextBoundary = addBillingMonth(currentStart, 1);
  while (nextBoundary.getTime() <= now.getTime()) {
    completed.push(summarizeBillingCycle(report, currentStart, nextBoundary));
    currentStart = nextBoundary;
    nextBoundary = addBillingMonth(currentStart, 1);
  }
  const current20x = summarizeBillingCycle(report, currentStart, now);
  const upgradedToDate = summarizeBillingCycle(report, upgradeStart, now);
  if (upgradedToDate.tokensPerDay <= 0) return null;
  const latestCompleted20x = completed.at(-1) ?? null;
  const achievedRatio = upgradedToDate.tokensPerDay / baseline.tokensPerDay;
  const completedCycleRatio = latestCompleted20x ? latestCompleted20x.tokensPerDay / baseline.tokensPerDay : null;
  const currentCycleRatio = current20x.tokensPerDay / baseline.tokensPerDay;
  const reportStart = new Date(Date.parse(report.generatedAt) - report.rangeDays * 86_400_000);
  const coverageComplete = !report.truncated && reportStart.getTime() <= baselineStart.getTime();
  const recommendation: PlanRecommendation = !coverageComplete || completedCycleRatio === null
    ? "pending"
    : completedCycleRatio >= targetRatio ? "keep" : "downgrade";
  const targetTokensPerDay = baseline.tokensPerDay * targetRatio;

  return {
    upgradeDate,
    targetRatio,
    baseline,
    latestCompleted20x,
    current20x,
    upgradedToDate,
    achievedRatio,
    completedCycleRatio,
    currentCycleRatio,
    targetProgress: achievedRatio / targetRatio,
    targetTokensPerDay,
    targetTokensPerWeek: targetTokensPerDay * 7,
    targetTokensCurrentCycle: targetTokensPerDay * localElapsedDays(currentStart, nextBoundary),
    targetTokensCurrentToDate: targetTokensPerDay * current20x.elapsedDays,
    recommendation,
    coverageComplete,
  };
}

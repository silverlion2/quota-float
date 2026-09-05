import type { CodexTokenUsageBucket, CodexTokenUsageReport } from "../types";
import { OPENAI_PRICING_CATALOG, pricingForModel, ratesForModel } from "./openaiPricing";

export type UsageRange = "today" | "24h" | "7d" | "30d" | "90d" | "all";

export const OPENAI_PRICING_SOURCE = OPENAI_PRICING_CATALOG.source;
export const OPENAI_PRICING_UPDATED_AT = OPENAI_PRICING_CATALOG.effectiveAt;
export const OPENAI_PRICING_VERSION = OPENAI_PRICING_CATALOG.version;

export interface TokenUsageFilters {
  model?: string;
  project?: string;
  terminal?: string;
}

export interface TokenCostBreakdown {
  totalUsd: number;
  inputUsd: number;
  cachedInputUsd: number;
  cacheWriteUsd: number;
  outputUsd: number;
}

export interface TokenUsageSummary {
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  totalTokens: number;
  requests: number;
  sessions: number;
  activeHours: number;
  activeDays: number;
  consecutiveActiveDays: number;
  models: number;
  projects: number;
  terminals: number;
  peakHour: number | null;
  averageTokensPerResponse: number;
  averageTokensPerSession: number;
  cacheHitRate: number;
  inputOutputRatio: number;
  longContextTokens: number;
  cost: TokenCostBreakdown;
  pricedTokenCoverage: number;
  unpricedModels: string[];
}

export interface ModelUsageSummary extends TokenUsageSummary {
  model: string;
  label: string;
  share: number;
}

export interface TokenFilterOptions {
  models: string[];
  projects: string[];
  terminals: string[];
}

export interface TokenSeriesPoint {
  key: string;
  label: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
}

export interface TokenHeatCell {
  weekday: number;
  hour: number;
  tokens: number;
  costUsd: number;
}

export interface ApiBudgetForecast {
  budgetUsd: number;
  spentUsd: number;
  projectedMonthlyUsd: number;
  dailyAverageUsd: number;
  utilization: number;
  status: "disabled" | "on_track" | "warning" | "over";
  daysInMonth: number;
}

export function usageCoverageStart(report: CodexTokenUsageReport, fallback = new Date()): Date {
  const declared = report.coverageStart ? new Date(report.coverageStart) : null;
  if (declared && Number.isFinite(declared.getTime())) return declared;
  const earliest = report.buckets.reduce<Date | null>((current, bucket) => {
    const candidate = new Date(bucket.bucketStart);
    if (!Number.isFinite(candidate.getTime())) return current;
    return current === null || candidate < current ? candidate : current;
  }, null);
  return earliest ?? fallback;
}

export function usageRangeStart(range: UsageRange, now = new Date(), firstAvailableAt = now): Date {
  if (range === "all") return firstAvailableAt > now ? now : firstAvailableAt;
  if (range === "today") return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const hours = range === "24h" ? 24 : range === "7d" ? 7 * 24 : range === "30d" ? 30 * 24 : 90 * 24;
  return new Date(now.getTime() - hours * 3_600_000);
}

export function usageRangeBounds(range: UsageRange, now = new Date(), firstAvailableAt = now): { start: Date; end: Date; previousStart: Date; previousEnd: Date } {
  const start = usageRangeStart(range, now, firstAvailableAt);
  if (range === "all") return { start, end: now, previousStart: start, previousEnd: start };
  const duration = Math.max(1, now.getTime() - start.getTime());
  return { start, end: now, previousStart: new Date(start.getTime() - duration), previousEnd: start };
}

export function estimateBucketCost(bucket: CodexTokenUsageBucket): TokenCostBreakdown | null {
  const rates = ratesForModel(bucket.model, bucket.contextTier);
  if (!rates) return null;
  const cached = Math.min(bucket.inputTokens, Math.max(0, bucket.cachedInputTokens));
  const cacheWrite = Math.min(Math.max(0, bucket.inputTokens - cached), Math.max(0, bucket.cacheWriteInputTokens));
  const uncached = Math.max(0, bucket.inputTokens - cached - cacheWrite);
  const inputUsd = uncached * rates.input / 1_000_000;
  const cachedInputUsd = cached * rates.cachedInput / 1_000_000;
  const cacheWriteUsd = cacheWrite * rates.cacheWrite / 1_000_000;
  const outputUsd = Math.max(0, bucket.outputTokens) * rates.output / 1_000_000;
  return { totalUsd: inputUsd + cachedInputUsd + cacheWriteUsd + outputUsd, inputUsd, cachedInputUsd, cacheWriteUsd, outputUsd };
}

export function filterTokenBuckets(buckets: CodexTokenUsageBucket[], filters: TokenUsageFilters = {}): CodexTokenUsageBucket[] {
  return buckets.filter((bucket) => {
    if (filters.model && bucket.model !== filters.model) return false;
    if (filters.project && bucket.project !== filters.project) return false;
    if (filters.terminal && bucket.terminal !== filters.terminal) return false;
    return true;
  });
}

export function bucketsInWindow(buckets: CodexTokenUsageBucket[], start: Date, end: Date, filters: TokenUsageFilters = {}): CodexTokenUsageBucket[] {
  const startTime = start.getTime();
  const endTime = end.getTime();
  return filterTokenBuckets(buckets, filters).filter((bucket) => {
    const timestamp = Date.parse(bucket.bucketStart);
    return Number.isFinite(timestamp) && timestamp >= startTime && timestamp < endTime;
  });
}

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function consecutiveDayCount(days: Set<string>): number {
  const sorted = [...days].sort();
  if (sorted.length === 0) return 0;
  let streak = 1;
  for (let index = sorted.length - 1; index > 0; index -= 1) {
    const current = new Date(`${sorted[index]}T12:00:00`);
    const previous = new Date(`${sorted[index - 1]}T12:00:00`);
    if (Math.round((current.getTime() - previous.getTime()) / 86_400_000) !== 1) break;
    streak += 1;
  }
  return streak;
}

export function summarizeTokenBuckets(buckets: CodexTokenUsageBucket[]): TokenUsageSummary {
  const models = new Set<string>();
  const projects = new Set<string>();
  const terminals = new Set<string>();
  const sessions = new Set<string>();
  const activeHours = new Set<string>();
  const activeDays = new Set<string>();
  const unpricedModels = new Set<string>();
  const hourlyTokens = new Map<number, number>();
  let pricedTokens = 0;
  const summary: TokenUsageSummary = {
    inputTokens: 0, cachedInputTokens: 0, cacheWriteInputTokens: 0, outputTokens: 0, reasoningOutputTokens: 0,
    totalTokens: 0, requests: 0, sessions: 0, activeHours: 0, activeDays: 0, consecutiveActiveDays: 0,
    models: 0, projects: 0, terminals: 0, peakHour: null, averageTokensPerResponse: 0,
    averageTokensPerSession: 0, cacheHitRate: 0, inputOutputRatio: 0, longContextTokens: 0,
    cost: { totalUsd: 0, inputUsd: 0, cachedInputUsd: 0, cacheWriteUsd: 0, outputUsd: 0 },
    pricedTokenCoverage: 0, unpricedModels: [],
  };
  for (const bucket of buckets) {
    summary.inputTokens += Math.max(0, bucket.inputTokens);
    summary.cachedInputTokens += Math.max(0, bucket.cachedInputTokens);
    summary.cacheWriteInputTokens += Math.max(0, bucket.cacheWriteInputTokens);
    summary.outputTokens += Math.max(0, bucket.outputTokens);
    summary.reasoningOutputTokens += Math.max(0, bucket.reasoningOutputTokens);
    summary.totalTokens += Math.max(0, bucket.totalTokens);
    summary.requests += Math.max(0, bucket.requests);
    if (bucket.contextTier === "long") summary.longContextTokens += Math.max(0, bucket.totalTokens);
    models.add(bucket.model || "unknown");
    projects.add(bucket.project || "Unknown");
    terminals.add(bucket.terminal || "Other");
    sessions.add(bucket.sessionKey || `${bucket.bucketStart}:${bucket.model}`);
    activeHours.add(bucket.bucketStart);
    const bucketDate = new Date(bucket.bucketStart);
    if (Number.isFinite(bucketDate.getTime())) {
      activeDays.add(localDateKey(bucketDate));
      hourlyTokens.set(bucketDate.getHours(), (hourlyTokens.get(bucketDate.getHours()) ?? 0) + Math.max(0, bucket.totalTokens));
    }
    const cost = estimateBucketCost(bucket);
    if (cost) {
      pricedTokens += Math.max(0, bucket.totalTokens);
      summary.cost.totalUsd += cost.totalUsd;
      summary.cost.inputUsd += cost.inputUsd;
      summary.cost.cachedInputUsd += cost.cachedInputUsd;
      summary.cost.cacheWriteUsd += cost.cacheWriteUsd;
      summary.cost.outputUsd += cost.outputUsd;
    } else {
      unpricedModels.add(bucket.model || "unknown");
    }
  }
  summary.sessions = sessions.size;
  summary.activeHours = activeHours.size;
  summary.activeDays = activeDays.size;
  summary.consecutiveActiveDays = consecutiveDayCount(activeDays);
  summary.models = models.size;
  summary.projects = projects.size;
  summary.terminals = terminals.size;
  summary.peakHour = [...hourlyTokens.entries()].sort((left, right) => right[1] - left[1] || left[0] - right[0])[0]?.[0] ?? null;
  summary.averageTokensPerResponse = summary.requests > 0 ? summary.totalTokens / summary.requests : 0;
  summary.averageTokensPerSession = summary.sessions > 0 ? summary.totalTokens / summary.sessions : 0;
  summary.cacheHitRate = summary.inputTokens > 0 ? summary.cachedInputTokens / summary.inputTokens : 0;
  summary.inputOutputRatio = summary.outputTokens > 0 ? summary.inputTokens / summary.outputTokens : 0;
  summary.pricedTokenCoverage = summary.totalTokens > 0 ? pricedTokens / summary.totalTokens : 0;
  summary.unpricedModels = [...unpricedModels].sort();
  return summary;
}

export function summarizeTokenReport(report: CodexTokenUsageReport, range: UsageRange, now = new Date(), filters: TokenUsageFilters = {}): { current: TokenUsageSummary; previous: TokenUsageSummary } {
  const bounds = usageRangeBounds(range, now, usageCoverageStart(report, now));
  return {
    current: summarizeTokenBuckets(bucketsInWindow(report.buckets, bounds.start, bounds.end, filters)),
    previous: summarizeTokenBuckets(bucketsInWindow(report.buckets, bounds.previousStart, bounds.previousEnd, filters)),
  };
}

export function buildModelBreakdown(report: CodexTokenUsageReport, range: UsageRange, now = new Date(), filters: TokenUsageFilters = {}): ModelUsageSummary[] {
  const bounds = usageRangeBounds(range, now, usageCoverageStart(report, now));
  const byModel = new Map<string, CodexTokenUsageBucket[]>();
  for (const bucket of bucketsInWindow(report.buckets, bounds.start, bounds.end, { project: filters.project, terminal: filters.terminal })) {
    if (filters.model && bucket.model !== filters.model) continue;
    const list = byModel.get(bucket.model) ?? [];
    list.push(bucket);
    byModel.set(bucket.model, list);
  }
  const total = [...byModel.values()].flat().reduce((sum, bucket) => sum + bucket.totalTokens, 0);
  return [...byModel.entries()].map(([model, buckets]) => {
    const summary = summarizeTokenBuckets(buckets);
    return { model, label: pricingForModel(model)?.label ?? model, share: total > 0 ? summary.totalTokens / total : 0, ...summary };
  }).sort((left, right) => right.cost.totalUsd - left.cost.totalUsd || right.totalTokens - left.totalTokens);
}

export function buildTokenFilterOptions(report: CodexTokenUsageReport, range: UsageRange, now = new Date()): TokenFilterOptions {
  const bounds = usageRangeBounds(range, now, usageCoverageStart(report, now));
  const buckets = bucketsInWindow(report.buckets, bounds.start, bounds.end);
  return {
    models: [...new Set(buckets.map((bucket) => bucket.model).filter(Boolean))].sort(),
    projects: [...new Set(buckets.map((bucket) => bucket.project || "Unknown"))].sort(),
    terminals: [...new Set(buckets.map((bucket) => bucket.terminal || "Other"))].sort(),
  };
}

export function buildApiBudgetForecast(summary: TokenUsageSummary, range: UsageRange, budgetUsd: number, now = new Date(), coverageStart = now): ApiBudgetForecast {
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const elapsedToday = Math.max(1 / 24, (now.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86_400_000);
  const observedDays = range === "today" ? elapsedToday
    : range === "24h" ? 1
      : range === "7d" ? 7
        : range === "30d" ? 30
          : range === "90d" ? 90
            : Math.max(1, (now.getTime() - coverageStart.getTime()) / 86_400_000);
  const dailyAverageUsd = summary.cost.totalUsd / observedDays;
  const projectedMonthlyUsd = dailyAverageUsd * daysInMonth;
  const safeBudget = Number.isFinite(budgetUsd) ? Math.max(0, budgetUsd) : 0;
  const utilization = safeBudget > 0 ? projectedMonthlyUsd / safeBudget : 0;
  const status = safeBudget <= 0 ? "disabled" : utilization > 1 ? "over" : utilization >= .8 ? "warning" : "on_track";
  return { budgetUsd: safeBudget, spentUsd: summary.cost.totalUsd, projectedMonthlyUsd, dailyAverageUsd, utilization, status, daysInMonth };
}

export function relativeChange(current: number, previous: number): number | null {
  return previous > 0 ? ((current - previous) / previous) * 100 : null;
}

function seriesKeys(range: UsageRange, now: Date, start: Date): Array<{ key: string; label: string }> {
  if (range === "today") {
    return Array.from({ length: now.getHours() + 1 }, (_, hour) => ({ key: `${localDateKey(now)}-${String(hour).padStart(2, "0")}`, label: `${String(hour).padStart(2, "0")}:00` }));
  }
  if (range === "24h") {
    const cursor = new Date(now);
    cursor.setMinutes(0, 0, 0);
    cursor.setHours(cursor.getHours() - 23);
    return Array.from({ length: 24 }, () => {
      const value = { key: `${localDateKey(cursor)}-${String(cursor.getHours()).padStart(2, "0")}`, label: `${String(cursor.getHours()).padStart(2, "0")}:00` };
      cursor.setHours(cursor.getHours() + 1);
      return value;
    });
  }
  if (range === "all") {
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1, 12);
    const end = new Date(now.getFullYear(), now.getMonth(), 1, 12);
    const formatter = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short" });
    const keys: Array<{ key: string; label: string }> = [];
    while (cursor <= end) {
      keys.push({
        key: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`,
        label: formatter.format(cursor),
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return keys;
  }
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days + 1, 12);
  const formatter = new Intl.DateTimeFormat(undefined, { month: "numeric", day: "numeric" });
  return Array.from({ length: days }, () => {
    const value = { key: localDateKey(cursor), label: formatter.format(cursor) };
    cursor.setDate(cursor.getDate() + 1);
    return value;
  });
}

export function buildTokenSeries(report: CodexTokenUsageReport, range: UsageRange, now = new Date(), filters: TokenUsageFilters = {}): TokenSeriesPoint[] {
  const bounds = usageRangeBounds(range, now, usageCoverageStart(report, now));
  const hourly = range === "today" || range === "24h";
  const monthly = range === "all";
  const points = new Map(seriesKeys(range, now, bounds.start).map((item) => [item.key, { ...item, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0 }]));
  for (const bucket of bucketsInWindow(report.buckets, bounds.start, bounds.end, filters)) {
    const date = new Date(bucket.bucketStart);
    const key = hourly
      ? `${localDateKey(date)}-${String(date.getHours()).padStart(2, "0")}`
      : monthly
        ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
        : localDateKey(date);
    const point = points.get(key);
    if (!point) continue;
    point.inputTokens += bucket.inputTokens;
    point.cachedInputTokens += bucket.cachedInputTokens;
    point.outputTokens += bucket.outputTokens;
    point.totalTokens += bucket.totalTokens;
    point.costUsd += estimateBucketCost(bucket)?.totalUsd ?? 0;
  }
  return [...points.values()];
}

export function buildTokenHeatmap(report: CodexTokenUsageReport, range: UsageRange, now = new Date(), filters: TokenUsageFilters = {}): TokenHeatCell[] {
  const bounds = usageRangeBounds(range, now, usageCoverageStart(report, now));
  const cells = Array.from({ length: 7 * 24 }, (_, index) => ({ weekday: Math.floor(index / 24), hour: index % 24, tokens: 0, costUsd: 0 }));
  for (const bucket of bucketsInWindow(report.buckets, bounds.start, bounds.end, filters)) {
    const date = new Date(bucket.bucketStart);
    const weekday = (date.getDay() + 6) % 7;
    const cell = cells[weekday * 24 + date.getHours()];
    cell.tokens += bucket.totalTokens;
    cell.costUsd += estimateBucketCost(bucket)?.totalUsd ?? 0;
  }
  return cells;
}

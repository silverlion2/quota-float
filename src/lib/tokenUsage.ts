import type { CodexTokenUsageBucket, CodexTokenUsageReport } from "../types";
import { OPENAI_PRICING_CATALOG, pricingForModel, ratesForModel } from "./openaiPricing";

export type UsagePresetRange = "today" | "24h" | "7d" | "30d" | "90d" | "all";
export interface CustomUsageRange { startDate: string; endDate: string }
export type UsageRange = UsagePresetRange | CustomUsageRange;
export type UsageReportPeriod = "week" | "month";

export const OPENAI_PRICING_SOURCE = OPENAI_PRICING_CATALOG.source;
export const OPENAI_PRICING_UPDATED_AT = OPENAI_PRICING_CATALOG.verifiedAt;
export const OPENAI_PRICING_VERSION = OPENAI_PRICING_CATALOG.version;

export interface TokenUsageFilters {
  model?: string;
  projectId?: string;
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

export type UsageBreakdownDimension = "project" | "terminal";

export interface UsageBreakdownRow {
  key: string;
  label: string;
  dimension: UsageBreakdownDimension;
  totalTokens: number;
  tokenShare: number;
  requests: number;
  sessions: number;
  bucketCount: number;
  /** Complete group price; null when any selected bucket is unpriced. */
  costUsd: number | null;
  /** Subtotal for priced buckets only, never a complete cost for an unpriced group. */
  knownCostUsd: number;
  /** Null unless the entire selected distribution is priced. */
  costShare: number | null;
  pricedTokenCoverage: number;
  unpricedModels: string[];
}

export interface TokenFilterOptions {
  models: string[];
  projects: Array<{ id: string; name: string; label: string }>;
  terminals: string[];
}

export interface TokenSeriesPoint {
  key: string;
  label: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number | null;
  pricingStatus?: PricingStatus;
}

export interface TokenHeatCell {
  weekday: number;
  hour: number;
  tokens: number;
  costUsd: number | null;
  pricingStatus?: PricingStatus;
}

export interface ApiBudgetForecast {
  budgetUsd: number;
  selectedRangeUsd: number | null;
  currentMonthUsd: number | null;
  projectedMonthlyUsd: number | null;
  dailyAverageUsd: number | null;
  pricingStatus: PricingStatus;
  utilization: number;
  status: "disabled" | "on_track" | "warning" | "over" | "partial" | "unpriced";
  daysInMonth: number;
}

export type PricingStatus = "complete" | "partial" | "unpriced" | "no_records";

export function usagePricingStatus(summary: Pick<TokenUsageSummary, "totalTokens" | "pricedTokenCoverage" | "unpricedModels">): PricingStatus {
  return summary.totalTokens <= 0 ? "no_records" : !summary.unpricedModels.length ? "complete"
    : summary.pricedTokenCoverage > 0 ? "partial" : "unpriced";
}

/** A partial amount is a lower bound; zero known prices is never a zero total. */
export function formatUsageCost(value: number, status: PricingStatus, language: "en" | "zh-CN", digits = 2): string {
  if (status === "no_records") return "—";
  if (status === "unpriced") return language === "en" ? "Unpriced" : "未定价";
  return `${status === "partial" ? language === "en" ? "Priced subtotal " : "已知价格小计 " : ""}$${value.toFixed(digits)}`;
}

function mergePricingStatus(status: PricingStatus, priced: boolean): PricingStatus {
  const next = priced ? "complete" : "unpriced";
  return status === "no_records" || status === next ? next : "partial";
}

export interface PeriodUsageReport {
  period: UsageReportPeriod;
  start: string;
  end: string;
  generatedAt: string;
  elapsedHours: number;
  recordedHours: number;
  unrecordedHours: number;
  indexTruncated: boolean;
  coverageStatus: "recorded" | "truncated" | "no_records";
  scope: {
    filtered: boolean;
    modelFiltered: boolean;
    projectFiltered: boolean;
    terminalFiltered: boolean;
  };
  summary: TokenUsageSummary;
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
  if (typeof range !== "string") return usageRangeBounds(range, now).start;
  if (range === "all") return firstAvailableAt > now ? now : firstAvailableAt;
  if (range === "today") return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const hours = range === "24h" ? 24 : range === "7d" ? 7 * 24 : range === "30d" ? 30 * 24 : 90 * 24;
  return new Date(now.getTime() - hours * 3_600_000);
}

export function usageRangeBounds(range: UsageRange, now = new Date(), firstAvailableAt = now): { start: Date; end: Date; previousStart: Date; previousEnd: Date } {
  if (typeof range !== "string") {
    // Invalid drafts never widen a query or silently select another period.
    if (!validateCustomUsageRange(range, now)) return { start: now, end: now, previousStart: now, previousEnd: now };
    const start = parseLocalUsageDate(range.startDate)!;
    const end = parseLocalUsageDate(range.endDate)!;
    end.setDate(end.getDate() + 1);
    const boundedEnd = new Date(Math.min(end.getTime(), now.getTime()));
    return { start, end: boundedEnd, previousStart: new Date(start.getTime() - (boundedEnd.getTime() - start.getTime())), previousEnd: start };
  }
  const start = usageRangeStart(range, now, firstAvailableAt);
  if (range === "all") return { start, end: now, previousStart: start, previousEnd: start };
  const duration = Math.max(1, now.getTime() - start.getTime());
  return { start, end: now, previousStart: new Date(start.getTime() - duration), previousEnd: start };
}

function parseLocalUsageDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1970) return null;
  const date = new Date(year, month - 1, day);
  return localDateKey(date) === value ? date : null;
}

export function validateCustomUsageRange(range: CustomUsageRange, now = new Date()): boolean {
  const start = parseLocalUsageDate(range.startDate);
  const end = parseLocalUsageDate(range.endDate);
  if (!start || !end || !Number.isFinite(now.getTime()) || start > end || range.endDate > localDateKey(now)) return false;
  // Calendar days, independent of daylight-saving transitions.
  const days = (Date.UTC(end.getFullYear(), end.getMonth(), end.getDate()) - Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) / 86_400_000 + 1;
  return days <= 366;
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
    if (filters.projectId && bucket.projectId !== filters.projectId) return false;
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
    projects.add(bucket.projectId);
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
  for (const bucket of bucketsInWindow(report.buckets, bounds.start, bounds.end, { projectId: filters.projectId, terminal: filters.terminal })) {
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

/** Local metadata only: uses the same selected buckets and prices as the overview. */
export function buildUsageBreakdown(report: CodexTokenUsageReport, range: UsageRange, now = new Date(), filters: TokenUsageFilters = {}, dimension: UsageBreakdownDimension = "project"): UsageBreakdownRow[] {
  const bounds = usageRangeBounds(range, now, usageCoverageStart(report, now));
  const groups = new Map<string, { labels: Set<string>; buckets: CodexTokenUsageBucket[] }>();
  for (const bucket of bucketsInWindow(report.buckets, bounds.start, bounds.end, filters)) {
    const key = dimension === "project" ? bucket.projectId || "unknown" : bucket.terminal || "Other";
    const label = dimension === "project" ? key === "unknown" ? "Unknown" : bucket.project || "Unknown" : key;
    const group = groups.get(key) ?? { labels: new Set<string>(), buckets: [] };
    group.labels.add(label);
    group.buckets.push(bucket);
    groups.set(key, group);
  }
  // Source ordering may change between index refreshes; labels and tie breaks
  // stay deterministic without merging project identities that share a name.
  const rows: UsageBreakdownRow[] = [...groups.entries()].map(([key, group]) => {
    const summary = summarizeTokenBuckets(group.buckets);
    const label = [...group.labels].sort()[0];
    return {
      key, label, dimension, totalTokens: summary.totalTokens, tokenShare: 0,
      requests: summary.requests, sessions: summary.sessions, bucketCount: group.buckets.length,
      costUsd: summary.unpricedModels.length === 0 ? summary.cost.totalUsd : null,
      knownCostUsd: summary.cost.totalUsd, costShare: null,
      pricedTokenCoverage: summary.pricedTokenCoverage, unpricedModels: summary.unpricedModels,
    };
  });
  const nameCounts = new Map<string, number>();
  for (const row of rows) nameCounts.set(row.label, (nameCounts.get(row.label) ?? 0) + 1);
  const totalTokens = rows.reduce((sum, row) => sum + row.totalTokens, 0);
  const knownCostUsd = rows.reduce((sum, row) => sum + row.knownCostUsd, 0);
  const fullyPriced = rows.every((row) => row.costUsd !== null);
  for (const row of rows) {
    if (dimension === "project" && row.key !== "unknown" && (nameCounts.get(row.label) ?? 0) > 1) row.label += ` · ${row.key.slice(-6)}`;
    row.tokenShare = totalTokens > 0 ? row.totalTokens / totalTokens : 0;
    row.costShare = fullyPriced ? knownCostUsd > 0 ? row.knownCostUsd / knownCostUsd : 0 : null;
  }
  const compareText = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
  return rows.sort((left, right) => right.totalTokens - left.totalTokens || compareText(left.label, right.label) || compareText(left.key, right.key));
}

export function buildTokenFilterOptions(report: CodexTokenUsageReport, range: UsageRange, now = new Date()): TokenFilterOptions {
  const bounds = usageRangeBounds(range, now, usageCoverageStart(report, now));
  const buckets = bucketsInWindow(report.buckets, bounds.start, bounds.end);
  const projectsById = new Map<string, string>();
  for (const bucket of buckets) projectsById.set(bucket.projectId, bucket.project || "Unknown");
  const nameCounts = new Map<string, number>();
  for (const name of projectsById.values()) nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
  const projects = [...projectsById.entries()].map(([id, name]) => ({
    id,
    name,
    label: (nameCounts.get(name) ?? 0) > 1 && id !== "unknown" ? `${name} · ${id.slice(-6)}` : name,
  })).sort((left, right) => left.label.localeCompare(right.label) || left.id.localeCompare(right.id));
  return {
    models: [...new Set(buckets.map((bucket) => bucket.model).filter(Boolean))].sort(),
    projects,
    terminals: [...new Set(buckets.map((bucket) => bucket.terminal || "Other"))].sort(),
  };
}

export function summarizeCurrentMonthTokenUsage(report: CodexTokenUsageReport, now = new Date(), filters: TokenUsageFilters = {}): TokenUsageSummary {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return summarizeTokenBuckets(bucketsInWindow(report.buckets, start, now, filters));
}

export function buildCurrentPeriodUsageReport(
  report: CodexTokenUsageReport,
  period: UsageReportPeriod,
  now = new Date(),
  filters: TokenUsageFilters = {},
): PeriodUsageReport {
  const start = period === "month"
    ? new Date(now.getFullYear(), now.getMonth(), 1)
    : new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const end = new Date(now);
  const selectedBuckets = bucketsInWindow(report.buckets, start, end, filters);
  const summary = summarizeTokenBuckets(selectedBuckets);
  const elapsedHours = Math.max(0, Math.ceil((end.getTime() - start.getTime()) / 3_600_000));
  const recordedHours = new Set(selectedBuckets.map((bucket) => Math.floor(Date.parse(bucket.bucketStart) / 3_600_000))).size;
  const unrecordedHours = Math.max(0, elapsedHours - recordedHours);
  const coverageStatus = report.truncated
    ? "truncated"
    : recordedHours > 0 ? "recorded" : "no_records";
  const scope = {
    filtered: Boolean(filters.model || filters.projectId || filters.terminal),
    modelFiltered: Boolean(filters.model),
    projectFiltered: Boolean(filters.projectId),
    terminalFiltered: Boolean(filters.terminal),
  };
  return {
    period,
    start: start.toISOString(),
    end: end.toISOString(),
    generatedAt: now.toISOString(),
    elapsedHours,
    recordedHours,
    unrecordedHours,
    indexTruncated: report.truncated,
    coverageStatus,
    scope,
    summary,
  };
}

export function buildApiBudgetForecast(summary: TokenUsageSummary, range: UsageRange, budgetUsd: number, now = new Date(), coverageStart = now, currentMonthUsd = summary.cost.totalUsd, currentMonthPricing = usagePricingStatus(summary)): ApiBudgetForecast {
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const elapsedToday = Math.max(1 / 24, (now.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86_400_000);
  const customBounds = typeof range !== "string" ? usageRangeBounds(range, now) : null;
  const observedDays = customBounds ? Math.max(1 / 24, (customBounds.end.getTime() - customBounds.start.getTime()) / 86_400_000)
    : range === "today" ? elapsedToday
    : range === "24h" ? 1
      : range === "7d" ? 7
        : range === "30d" ? 30
          : range === "90d" ? 90
            : Math.max(1, (now.getTime() - coverageStart.getTime()) / 86_400_000);
  const dailyAverageUsd = summary.cost.totalUsd / observedDays;
  const projectedMonthlyUsd = dailyAverageUsd * daysInMonth;
  const safeBudget = Number.isFinite(budgetUsd) ? Math.max(0, budgetUsd) : 0;
  const safeCurrentMonthUsd = Number.isFinite(currentMonthUsd) ? Math.max(0, currentMonthUsd) : 0;
  const utilization = safeBudget > 0 ? projectedMonthlyUsd / safeBudget : 0;
  const pricing = usagePricingStatus(summary);
  const complete = pricing === "complete";
  const status = safeBudget <= 0 ? "disabled" : !complete ? pricing === "partial" ? "partial" : "unpriced"
    : utilization > 1 ? "over" : utilization >= .8 ? "warning" : "on_track";
  return { budgetUsd: safeBudget, selectedRangeUsd: pricing === "complete" || pricing === "partial" ? summary.cost.totalUsd : null,
    currentMonthUsd: currentMonthPricing === "complete" || currentMonthPricing === "partial" ? safeCurrentMonthUsd : null,
    projectedMonthlyUsd: complete ? projectedMonthlyUsd : null, dailyAverageUsd: complete ? dailyAverageUsd : null,
    pricingStatus: pricing, utilization: complete ? utilization : 0, status, daysInMonth };
}

export function relativeChange(current: number, previous: number): number | null {
  return previous > 0 ? ((current - previous) / previous) * 100 : null;
}

function seriesKeys(range: UsageRange, end: Date, start: Date): Array<{ key: string; label: string }> {
  if (start >= end) return [];
  if (range === "today" || range === "24h") {
    const cursor = new Date(start);
    cursor.setMinutes(0, 0, 0);
    const keys: Array<{ key: string; label: string }> = [];
    while (cursor < end) {
      keys.push({ key: `${localDateKey(cursor)}-${String(cursor.getHours()).padStart(2, "0")}`, label: `${String(cursor.getHours()).padStart(2, "0")}:00` });
      cursor.setTime(cursor.getTime() + 3_600_000);
    }
    return keys;
  }
  if (range === "all") {
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1, 12);
    const finalMonth = new Date(end.getFullYear(), end.getMonth(), 1, 12);
    const formatter = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short" });
    const keys: Array<{ key: string; label: string }> = [];
    while (cursor <= finalMonth) {
      keys.push({
        key: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`,
        label: formatter.format(cursor),
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return keys;
  }
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const formatter = new Intl.DateTimeFormat(undefined, { month: "numeric", day: "numeric" });
  const keys: Array<{ key: string; label: string }> = [];
  while (cursor < end) {
    keys.push({ key: localDateKey(cursor), label: formatter.format(cursor) });
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

export function buildTokenSeries(report: CodexTokenUsageReport, range: UsageRange, now = new Date(), filters: TokenUsageFilters = {}): TokenSeriesPoint[] {
  const bounds = usageRangeBounds(range, now, usageCoverageStart(report, now));
  const hourly = range === "today" || range === "24h";
  const monthly = range === "all";
  const points = new Map<string, TokenSeriesPoint>(seriesKeys(range, bounds.end, bounds.start).map((item) => [item.key, { ...item, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0, pricingStatus: "no_records" }]));
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
    const cost = estimateBucketCost(bucket);
    point.costUsd = (point.costUsd ?? 0) + (cost?.totalUsd ?? 0);
    point.pricingStatus = mergePricingStatus(point.pricingStatus!, cost !== null);
  }
  return [...points.values()].map((point) => ({ ...point, costUsd: point.pricingStatus === "unpriced" || point.pricingStatus === "no_records" ? null : point.costUsd }));
}

export function buildTokenHeatmap(report: CodexTokenUsageReport, range: UsageRange, now = new Date(), filters: TokenUsageFilters = {}): TokenHeatCell[] {
  const bounds = usageRangeBounds(range, now, usageCoverageStart(report, now));
  const cells: TokenHeatCell[] = Array.from({ length: 7 * 24 }, (_, index) => ({ weekday: Math.floor(index / 24), hour: index % 24, tokens: 0, costUsd: 0, pricingStatus: "no_records" }));
  for (const bucket of bucketsInWindow(report.buckets, bounds.start, bounds.end, filters)) {
    const date = new Date(bucket.bucketStart);
    const weekday = (date.getDay() + 6) % 7;
    const cell = cells[weekday * 24 + date.getHours()];
    cell.tokens += bucket.totalTokens;
    const cost = estimateBucketCost(bucket);
    cell.costUsd = (cell.costUsd ?? 0) + (cost?.totalUsd ?? 0);
    cell.pricingStatus = mergePricingStatus(cell.pricingStatus!, cost !== null);
  }
  return cells.map((cell) => ({ ...cell, costUsd: cell.pricingStatus === "unpriced" || cell.pricingStatus === "no_records" ? null : cell.costUsd }));
}

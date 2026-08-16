import type { CodexTokenUsageReport, Language } from "../types";
import { OPENAI_PRICING_CATALOG } from "./openaiPricing";
import {
  bucketsInWindow,
  estimateBucketCost,
  usageRangeBounds,
  type ApiBudgetForecast,
  type ModelUsageSummary,
  type TokenUsageFilters,
  type TokenUsageSummary,
  type UsageRange,
} from "./tokenUsage";

interface ExportRow {
  bucketStart: string;
  model: string;
  contextTier: string;
  project: string;
  terminal: string;
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  totalTokens: number;
  responses: number;
  apiEquivalentUsd: number | null;
}

function projectAliases(projects: string[]): Map<string, string> {
  const known = [...new Set(projects.filter((project) => project && project !== "Unknown"))].sort();
  return new Map([...[...known].map((project, index) => [project, `Project ${index + 1}`] as const), ["Unknown", "Unknown"]]);
}

function exportRows(report: CodexTokenUsageReport, range: UsageRange, filters: TokenUsageFilters, now: Date): ExportRow[] {
  const bounds = usageRangeBounds(range, now);
  const buckets = bucketsInWindow(report.buckets, bounds.start, bounds.end, filters);
  const aliases = projectAliases(buckets.map((bucket) => bucket.project));
  const rows = new Map<string, ExportRow>();
  for (const bucket of buckets) {
    const project = aliases.get(bucket.project || "Unknown") ?? "Unknown";
    const key = [bucket.bucketStart, bucket.model, bucket.contextTier, project, bucket.terminal].join("\u0000");
    const row = rows.get(key) ?? {
      bucketStart: bucket.bucketStart,
      model: bucket.model,
      contextTier: bucket.contextTier,
      project,
      terminal: bucket.terminal || "Other",
      inputTokens: 0,
      cachedInputTokens: 0,
      cacheWriteInputTokens: 0,
      outputTokens: 0,
      reasoningOutputTokens: 0,
      totalTokens: 0,
      responses: 0,
      apiEquivalentUsd: 0,
    };
    row.inputTokens += bucket.inputTokens;
    row.cachedInputTokens += bucket.cachedInputTokens;
    row.cacheWriteInputTokens += bucket.cacheWriteInputTokens;
    row.outputTokens += bucket.outputTokens;
    row.reasoningOutputTokens += bucket.reasoningOutputTokens;
    row.totalTokens += bucket.totalTokens;
    row.responses += bucket.requests;
    const cost = estimateBucketCost(bucket);
    row.apiEquivalentUsd = cost && row.apiEquivalentUsd !== null ? row.apiEquivalentUsd + cost.totalUsd : null;
    rows.set(key, row);
  }
  return [...rows.values()].sort((left, right) => left.bucketStart.localeCompare(right.bucketStart));
}

function csvCell(value: string | number | null): string {
  if (value === null) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function buildUsageCsv(report: CodexTokenUsageReport, range: UsageRange, filters: TokenUsageFilters = {}, now = new Date()): string {
  const header = ["bucket_start", "model", "context_tier", "project_alias", "terminal", "input_tokens", "cached_input_tokens", "cache_write_input_tokens", "output_tokens", "reasoning_output_tokens", "total_tokens", "responses", "api_equivalent_usd", "pricing_version"];
  const rows = exportRows(report, range, filters, now).map((row) => [
    row.bucketStart, row.model, row.contextTier, row.project, row.terminal, row.inputTokens,
    row.cachedInputTokens, row.cacheWriteInputTokens, row.outputTokens, row.reasoningOutputTokens,
    row.totalTokens, row.responses, row.apiEquivalentUsd === null ? null : row.apiEquivalentUsd.toFixed(6),
    OPENAI_PRICING_CATALOG.version,
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

export function buildUsageJson(report: CodexTokenUsageReport, range: UsageRange, filters: TokenUsageFilters = {}, now = new Date()): string {
  return JSON.stringify({
    schemaVersion: 1,
    exportedAt: now.toISOString(),
    range,
    pricing: {
      version: OPENAI_PRICING_CATALOG.version,
      effectiveAt: OPENAI_PRICING_CATALOG.effectiveAt,
      source: OPENAI_PRICING_CATALOG.source,
      disclaimer: "API-equivalent estimate; not a Codex subscription bill.",
    },
    privacy: "Project names are replaced with local aliases; session identifiers and prompt/response content are excluded.",
    rows: exportRows(report, range, filters, now),
  }, null, 2);
}

function xml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function compact(value: number, language: Language): string {
  return new Intl.NumberFormat(language === "en" ? "en-US" : "zh-CN", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function buildUsageShareSvg(summary: TokenUsageSummary, models: ModelUsageSummary[], budget: ApiBudgetForecast, range: UsageRange, language: Language, now = new Date()): string {
  const english = language === "en";
  const modelRows = models.slice(0, 3).map((model, index) => {
    const y = 420 + index * 62;
    const width = Math.max(8, Math.round(model.share * 390));
    return `<text x="72" y="${y}" class="model">${xml(model.label)}</text><text x="760" y="${y}" text-anchor="end" class="model-value">$${model.cost.totalUsd.toFixed(2)}</text><rect x="72" y="${y + 14}" width="390" height="8" rx="4" class="track"/><rect x="72" y="${y + 14}" width="${width}" height="8" rx="4" class="bar"/>`;
  }).join("");
  const status = budget.status === "over" ? (english ? "OVER PLAN" : "超出预算") : budget.status === "warning" ? (english ? "NEAR PLAN" : "接近预算") : (english ? "ON TRACK" : "预算正常");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="840" height="640" viewBox="0 0 840 640">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#07110f"/><stop offset="1" stop-color="#111823"/></linearGradient><linearGradient id="accent"><stop stop-color="#66f2ba"/><stop offset="1" stop-color="#58a6ff"/></linearGradient></defs>
  <style>.eyebrow{font:700 14px ui-monospace,monospace;letter-spacing:3px;fill:#66f2ba}.title{font:700 42px ui-monospace,monospace;fill:#f3f7f5}.meta{font:500 15px ui-monospace,monospace;fill:#87958f}.label{font:600 14px ui-monospace,monospace;fill:#82908b}.value{font:700 30px ui-monospace,monospace;fill:#f3f7f5}.cost{fill:#66f2ba}.model{font:600 16px ui-monospace,monospace;fill:#dce6e1}.model-value{font:700 16px ui-monospace,monospace;fill:#66f2ba}.track{fill:#1d2825}.bar{fill:url(#accent)}.fine{font:500 12px ui-monospace,monospace;fill:#6f7d78}</style>
  <rect width="840" height="640" rx="34" fill="url(#bg)"/><rect x="28" y="28" width="784" height="584" rx="24" fill="none" stroke="#26342f"/>
  <text x="72" y="84" class="eyebrow">VIBE USAGE · LOCAL FIRST</text><text x="72" y="142" class="title">${english ? "CODEX USAGE" : "CODEX 用量全景"}</text><text x="72" y="176" class="meta">${range.toUpperCase()} · ${now.toISOString().slice(0, 10)} · ${xml(OPENAI_PRICING_CATALOG.version)}</text>
  <text x="72" y="238" class="label">${english ? "TOTAL TOKEN" : "总 TOKEN"}</text><text x="72" y="278" class="value">${compact(summary.totalTokens, language)}</text>
  <text x="315" y="238" class="label">${english ? "API EQUIVALENT" : "API 等价费用"}</text><text x="315" y="278" class="value cost">$${summary.cost.totalUsd.toFixed(2)}</text>
  <text x="574" y="238" class="label">${english ? "SESSIONS" : "会话数"}</text><text x="574" y="278" class="value">${summary.sessions}</text>
  <text x="72" y="338" class="label">${english ? "CACHE HIT" : "缓存命中"}</text><text x="72" y="374" class="value">${Math.round(summary.cacheHitRate * 100)}%</text>
  <text x="315" y="338" class="label">${english ? "MONTHLY OUTLOOK" : "月度预测"}</text><text x="315" y="374" class="value">$${budget.projectedMonthlyUsd.toFixed(0)}</text>
  <text x="574" y="338" class="label">${english ? "BUDGET STATUS" : "预算状态"}</text><text x="574" y="374" class="value cost">${status}</text>
  ${modelRows}
  <text x="72" y="590" class="fine">${english ? "API-equivalent estimate, not a subscription bill. No prompts or responses included." : "API 等价估算，并非订阅账单；不包含提示词、回复或会话标识。"}</text>
  </svg>`;
}

export function buildPricingCatalogJson(): string {
  return JSON.stringify(OPENAI_PRICING_CATALOG, null, 2);
}

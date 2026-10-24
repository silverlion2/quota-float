import type { CodexTokenUsageReport, Language } from "../types";
import { OPENAI_PRICING_CATALOG } from "./openaiPricing";
import {
  bucketsInWindow,
  formatUsageCost,
  usagePricingStatus,
  estimateBucketCost,
  summarizeTokenBuckets,
  usageCoverageStart,
  usageRangeBounds,
  type ApiBudgetForecast,
  type ModelUsageSummary,
  type PeriodUsageReport,
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

function projectAliases(projectIds: string[]): Map<string, string> {
  const known = [...new Set(projectIds.filter((projectId) => projectId && projectId !== "unknown"))].sort();
  return new Map([...[...known].map((projectId, index) => [projectId, `Project ${index + 1}`] as const), ["unknown", "Unknown"]]);
}

function exportRows(report: CodexTokenUsageReport, range: UsageRange, filters: TokenUsageFilters, now: Date): ExportRow[] {
  const bounds = usageRangeBounds(range, now, usageCoverageStart(report, now));
  const buckets = bucketsInWindow(report.buckets, bounds.start, bounds.end, filters);
  const aliases = projectAliases(buckets.map((bucket) => bucket.projectId));
  const rows = new Map<string, ExportRow>();
  for (const bucket of buckets) {
    const project = aliases.get(bucket.projectId) ?? "Unknown";
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
  const bounds = usageRangeBounds(range, now, usageCoverageStart(report, now));
  return JSON.stringify({
    schemaVersion: 1,
    exportedAt: now.toISOString(),
    range,
    period: { start: bounds.start.toISOString(), endExclusive: bounds.end.toISOString() },
    pricing: {
      version: OPENAI_PRICING_CATALOG.version,
      verifiedAt: OPENAI_PRICING_CATALOG.verifiedAt,
      pricingTier: OPENAI_PRICING_CATALOG.pricingTier,
      source: OPENAI_PRICING_CATALOG.source,
      disclaimer: "API-equivalent estimate using this catalog version for all selected usage, including historical rows; not a reconstruction of past effective prices or a Codex subscription bill.",
    },
    privacy: "Project names are replaced with local aliases; session identifiers and prompt/response content are excluded.",
    rows: exportRows(report, range, filters, now),
  }, null, 2);
}

export function buildUsageMarkdown(report: CodexTokenUsageReport, range: UsageRange, filters: TokenUsageFilters = {}, now = new Date(), language: Language = "zh-CN"): string {
  const en = language === "en";
  const text = (zh: string, english: string) => en ? english : zh;
  const bounds = usageRangeBounds(range, now, usageCoverageStart(report, now));
  const buckets = bucketsInWindow(report.buckets, bounds.start, bounds.end, filters);
  const summary = summarizeTokenBuckets(buckets);
  const aliases = projectAliases(buckets.map((bucket) => bucket.projectId));
  const hours = Math.max(0, Math.ceil((bounds.end.getTime() - bounds.start.getTime()) / 3_600_000));
  const recorded = new Set(buckets.map((bucket) => Math.floor(Date.parse(bucket.bucketStart) / 3_600_000))).size;
  const number = (value: number) => value.toLocaleString(en ? "en-US" : "zh-CN");
  const amount = (value: TokenUsageSummary) => formatUsageCost(value.cost.totalUsd, usagePricingStatus(value), language, 6);
  const groupRows = (dimension: "model" | "projectId") => {
    const groups = new Map<string, typeof buckets>();
    for (const bucket of buckets) {
      const group = groups.get(bucket[dimension]) ?? [];
      group.push(bucket);
      groups.set(bucket[dimension], group);
    }
    const keys = [...groups.keys()].sort();
    return keys.map((key, index) => {
      // Unknown free-form model metadata can contain paths; export only safe model IDs.
      const label = dimension === "projectId" ? aliases.get(key) ?? "Unknown"
        : /^(?:gpt-[a-z0-9][a-z0-9.-]*|o\d[a-z0-9.-]*)$/i.test(key) && key.length <= 96 ? key
          : `${text("未知模型", "Unknown model")} ${index + 1}`;
      const value = summarizeTokenBuckets(groups.get(key)!);
      return `| ${label} | ${number(value.totalTokens)} | ${number(value.sessions)} | ${value.unpricedModels.length && value.pricedTokenCoverage === 0 ? text("未知", "Unknown") : amount(value)} |`;
    });
  };
  const table = (title: string, dimension: "model" | "projectId") => [
    `## ${title}`, "", `| ${title} | Token | ${text("会话数", "Sessions")} | ${text("API 等价 USD", "API-equivalent USD")} |`,
    "| --- | ---: | ---: | ---: |", ...groupRows(dimension), "",
  ];
  const date = (value: string | null | undefined) => {
    const parsed = value ? new Date(value) : null;
    return parsed && Number.isFinite(parsed.getTime()) ? parsed.toISOString() : text("未知", "Unknown");
  };
  const coverageStart = report.coverageStart ? date(report.coverageStart)
    : report.buckets.some((bucket) => Number.isFinite(Date.parse(bucket.bucketStart))) ? usageCoverageStart(report, now).toISOString()
      : text("未知", "Unknown");
  const filtered = (active: boolean) => active ? text("已筛选", "Filtered") : text("全部", "All");
  return [
    `# Quota Float · ${text("本机用量", "Local usage")}`, "",
    `- ${text("统计时点", "As of")}: ${now.toISOString()}`,
    `- ${text("UTC 区间 [包含起始,不含结束)", "UTC range [start inclusive,end exclusive)")}: ${bounds.start.toISOString()} → ${bounds.end.toISOString()}`,
    `- ${text("筛选", "Filters")}: ${text("模型", "Model")} ${filtered(Boolean(filters.model))}; ${text("项目", "Project")} ${filtered(Boolean(filters.projectId))}; ${text("终端", "Terminal")} ${filtered(Boolean(filters.terminal))}`,
    text("- 本机日历日期含结束日，截至现在。", "- Local calendar dates include end day, capped at now."), "",
    `## ${text("总览", "Overview")}`, "",
    `- Token: ${number(summary.totalTokens)}; ${text("输入", "Input")}: ${number(summary.inputTokens)}; ${text("输出", "Output")}: ${number(summary.outputTokens)}`,
    `- ${text("缓存读/写", "Cache read/write")}: ${number(summary.cachedInputTokens)} / ${number(summary.cacheWriteInputTokens)}; ${text("推理（含于输出）", "Reasoning (in output)")}: ${number(summary.reasoningOutputTokens)}`,
    `- ${text("会话/响应/记录天数", "Sessions/responses/recorded days")}: ${summary.sessions} / ${summary.requests} / ${summary.activeDays}`,
    `- ${text("API 等价费用", "API-equivalent cost")}: ${amount(summary)}; ${text("已定价 Token", "Priced Token")}: ${(summary.pricedTokenCoverage * 100).toFixed(1)}%`,
    text("- 现目录重估全部历史，非账单/订阅费；未知价不计，无记录≠零用量。", "- All history re-priced at current catalog, not bills/subscriptions; unpriced excluded, no records ≠ zero usage."),
    `- ${text("未定价模型", "Unpriced models")}: ${summary.unpricedModels.length}`, "",
    ...table(text("模型", "Models"), "model"),
    ...table(text("匿名项目", "Project aliases"), "projectId"),
    `## ${text("本机覆盖", "Local coverage")}`, "",
    `- ${text("索引时间", "Indexed")}: ${date(report.generatedAt)}`,
    `- ${text("全索引区间", "Index bounds")}: ${coverageStart} → ${date(report.coverageEnd)}`,
    `- ${text("区间小时 记录/无记录", "Range hours recorded/unrecorded")}: ${recorded} / ${Math.max(0, hours - recorded)}`,
    `- ${text("索引截断", "Index truncated")}: ${report.truncated ? text("是（部分）", "Yes (partial)") : text("否", "No")}; ${text("扫描 / 索引 / 跳过文件", "Scanned / indexed / skipped files")}: ${report.scannedFiles} / ${report.indexedFiles} / ${report.skippedFiles}`,
    text("- 仅本机 Codex 元数据；记录小时≠工时，无记录可为空闲/未采集，截断/跳过可致不全。", "- Local Codex metadata only; recorded hours ≠ work time, no records may be idle/uncollected, truncated/skipped may be incomplete."), "",
    `- ${text("价格目录", "Pricing catalog")}: ${OPENAI_PRICING_CATALOG.version}; ${text("核对", "Verified")}: ${OPENAI_PRICING_CATALOG.verifiedAt}; ${OPENAI_PRICING_CATALOG.pricingTier}`,
    `- ${text("价格来源", "Pricing source")}: ${OPENAI_PRICING_CATALOG.source}`,
    text("- 别名仅限本次；无项目名/路径/项目/会话/账号 ID/提示词/回复。", "- Aliases per export; no project names/paths/project/session/account IDs/prompts/responses."), "",
  ].join("\n");
}

export function buildPeriodUsageJson(report: PeriodUsageReport): string {
  const pricingStatus = usagePricingStatus(report.summary);
  return JSON.stringify({
    schemaVersion: 2,
    reportType: `${report.period}ly_usage_summary`,
    period: {
      start: report.start,
      end: report.end,
      generatedAt: report.generatedAt,
    },
    scope: report.scope,
    coverage: {
      status: report.coverageStatus,
      elapsedHours: report.elapsedHours,
      recordedHours: report.recordedHours,
      unrecordedHours: report.unrecordedHours,
      indexTruncated: report.indexTruncated,
      note: "A record-free hour may be idle or uncollected. It is not labeled missing and is not treated as zero usage; only indexTruncated is known incomplete evidence.",
    },
    pricing: {
      version: OPENAI_PRICING_CATALOG.version,
      verifiedAt: OPENAI_PRICING_CATALOG.verifiedAt,
      pricingTier: OPENAI_PRICING_CATALOG.pricingTier,
      source: OPENAI_PRICING_CATALOG.source,
      disclaimer: "API-equivalent estimate, not a Codex subscription bill.",
    },
    privacy: "Aggregated local summary only; raw paths, project IDs, project names, session identifiers, prompts, and responses are excluded.",
    apiEquivalentUsd: pricingStatus === "complete" ? report.summary.cost.totalUsd : null,
    knownApiEquivalentSubtotalUsd: pricingStatus === "complete" || pricingStatus === "partial" ? report.summary.cost.totalUsd : null,
    pricingStatus,
    summary: { ...report.summary,
      cost: pricingStatus === "complete" ? report.summary.cost : null,
      knownCostSubtotal: pricingStatus === "partial" ? report.summary.cost : null },
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
  const rangeText = typeof range === "string" ? range.toUpperCase() : `${range.startDate} → ${range.endDate}`;
  const cost = (value: TokenUsageSummary) => usagePricingStatus(value) === "partial"
    ? `≥$${value.cost.totalUsd.toFixed(2)}` : formatUsageCost(value.cost.totalUsd, usagePricingStatus(value), language);
  const modelRows = models.slice(0, 3).map((model, index) => {
    const y = 420 + index * 62;
    const width = Math.max(8, Math.round(model.share * 390));
    return `<text x="72" y="${y}" class="model">${xml(model.label)}</text><text x="760" y="${y}" text-anchor="end" class="model-value">${xml(cost(model))}</text><rect x="72" y="${y + 14}" width="390" height="8" rx="4" class="track"/><rect x="72" y="${y + 14}" width="${width}" height="8" rx="4" class="bar"/>`;
  }).join("");
  const status = usagePricingStatus(summary) === "no_records" ? (english ? "NO RECORDS" : "无记录")
    : budget.status === "disabled" ? (english ? "OFF" : "已关闭")
    : budget.projectedMonthlyUsd === null ? (usagePricingStatus(summary) === "partial" ? english ? "PARTIAL" : "部分定价" : english ? "UNPRICED" : "未定价") : budget.status === "over" ? (english ? "OVER PLAN" : "超出预算") : budget.status === "warning" ? (english ? "NEAR PLAN" : "接近预算") : (english ? "ON TRACK" : "预算正常");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="840" height="640" viewBox="0 0 840 640">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#07110f"/><stop offset="1" stop-color="#111823"/></linearGradient><linearGradient id="accent"><stop stop-color="#66f2ba"/><stop offset="1" stop-color="#58a6ff"/></linearGradient></defs>
  <style>.eyebrow{font:700 14px ui-monospace,monospace;letter-spacing:3px;fill:#66f2ba}.title{font:700 42px ui-monospace,monospace;fill:#f3f7f5}.meta{font:500 15px ui-monospace,monospace;fill:#87958f}.label{font:600 14px ui-monospace,monospace;fill:#82908b}.value{font:700 30px ui-monospace,monospace;fill:#f3f7f5}.cost{fill:#66f2ba}.model{font:600 16px ui-monospace,monospace;fill:#dce6e1}.model-value{font:700 16px ui-monospace,monospace;fill:#66f2ba}.track{fill:#1d2825}.bar{fill:url(#accent)}.fine{font:500 12px ui-monospace,monospace;fill:#6f7d78}</style>
  <rect width="840" height="640" rx="34" fill="url(#bg)"/><rect x="28" y="28" width="784" height="584" rx="24" fill="none" stroke="#26342f"/>
  <text x="72" y="84" class="eyebrow">VIBE USAGE · LOCAL FIRST</text><text x="72" y="142" class="title">${english ? "CODEX USAGE" : "CODEX 用量全景"}</text><text x="72" y="176" class="meta">${xml(rangeText)} · ${now.toISOString().slice(0, 10)} · ${xml(OPENAI_PRICING_CATALOG.version)}</text>
  <text x="72" y="238" class="label">${english ? "TOTAL TOKEN" : "总 TOKEN"}</text><text x="72" y="278" class="value">${compact(summary.totalTokens, language)}</text>
  <text x="315" y="238" class="label">${english ? "API EQUIVALENT" : "API 等价费用"}</text><text x="315" y="278" class="value cost">${xml(cost(summary))}</text>
  <text x="574" y="238" class="label">${english ? "SESSIONS" : "会话数"}</text><text x="574" y="278" class="value">${summary.sessions}</text>
  <text x="72" y="338" class="label">${english ? "CACHE HIT" : "缓存命中"}</text><text x="72" y="374" class="value">${Math.round(summary.cacheHitRate * 100)}%</text>
  <text x="315" y="338" class="label">${english ? "MONTHLY OUTLOOK" : "月度预测"}</text><text x="315" y="374" class="value">${budget.projectedMonthlyUsd === null ? "—" : `$${budget.projectedMonthlyUsd.toFixed(0)}`}</text>
  <text x="574" y="338" class="label">${english ? "BUDGET STATUS" : "预算状态"}</text><text x="574" y="374" class="value cost">${status}</text>
  ${modelRows}
  <text x="72" y="590" class="fine">${summary.unpricedModels.length ? english ? "Unknown prices excluded; ≥ marks priced subtotals. API equivalent, not a bill." : "未知价格未计入；≥ 表示已知费用小计。API 等价估算，非订阅账单。" : english ? "API-equivalent estimate, not a subscription bill. No prompts or responses included." : "API 等价估算，并非订阅账单；不包含提示词、回复或会话标识。"}</text>
  </svg>`;
}

export function buildPricingCatalogJson(): string {
  return JSON.stringify(OPENAI_PRICING_CATALOG, null, 2);
}

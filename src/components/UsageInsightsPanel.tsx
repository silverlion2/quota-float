import {
  ArrowClockwise,
  Bell,
  BellSlash,
  CalendarDots,
  ChartBar,
  CurrencyDollar,
  Database,
  DownloadSimple,
  Gauge,
  ShareNetwork,
  SpinnerGap,
  Wrench,
  X,
} from "@phosphor-icons/react";
import { type CSSProperties, useCallback, useEffect, useMemo, useState } from "react";
import { exportUsageData, fetchCodexTokenUsage, sendDesktopNotification } from "../lib/bridge";
import { clampPercent, formatResetTime } from "../lib/format";
import { deliverNotificationOnce } from "../lib/notificationDelivery";
import { OPENAI_PRICING_CATALOG } from "../lib/openaiPricing";
import { calculateQuotaPace, paceBaselineKey, trackedQuotaWindows } from "../lib/quotaPace";
import {
  buildApiBudgetForecast,
  buildModelBreakdown,
  buildTokenFilterOptions,
  buildTokenHeatmap,
  buildTokenSeries,
  OPENAI_PRICING_SOURCE,
  OPENAI_PRICING_UPDATED_AT,
  OPENAI_PRICING_VERSION,
  relativeChange,
  summarizeTokenReport,
  usageCoverageStart,
  type TokenUsageFilters,
  type UsageRange,
} from "../lib/tokenUsage";
import { buildCodexBillingPlanComparison } from "../lib/billingPlan";
import { buildPricingCatalogJson, buildUsageCsv, buildUsageJson, buildUsageShareSvg } from "../lib/usageExport";
import { buildUsageCalendar, observedTrendUse, recentQuotaTrend, usageSummary } from "../lib/usageInsights";
import type {
  CodexTokenUsageReport,
  DailyPaceBaseline,
  DailyUsageSummary,
  Language,
  ProviderId,
  ProviderSnapshot,
  QuotaHistoryPoint,
  ResetForecast,
  WidgetPreferences,
} from "../types";
import { QuotaHistoryCurve } from "./QuotaHistoryCurve";

interface Props {
  snapshot: ProviderSnapshot;
  snapshots: ProviderSnapshot[];
  history: QuotaHistoryPoint[];
  dailyUsage: DailyUsageSummary[];
  paceBaselines: Record<string, DailyPaceBaseline>;
  language: Language;
  preferences: WidgetPreferences;
  resetForecast?: ResetForecast | null;
  onSelectProvider?: (provider: ProviderId) => void;
  onPreferences?: (preferences: WidgetPreferences) => void;
  onOpenResetForecast?: (url: string) => void;
  onClose?: () => void;
}

type ChartMode = "token" | "cost";
type UsageExport = "csv" | "json" | "svg" | "pricing";
const RANGE_OPTIONS: UsageRange[] = ["today", "24h", "7d", "30d", "90d", "all"];

function percent(value: number | null, digits = 1): string {
  return value === null ? "—" : `${value.toFixed(digits).replace(/\.0$/, "")}%`;
}

function compactNumber(value: number, language: Language): string {
  return new Intl.NumberFormat(language === "en" ? "en-US" : "zh-CN", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function money(value: number): string {
  if (value >= 1000) return `$${new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(value)}`;
  if (value >= 10) return `$${value.toFixed(2)}`;
  if (value >= 1) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(4)}`;
}

function bytes(value: number): string {
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(2)} GiB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MiB`;
  return `${Math.round(value / 1024)} KiB`;
}

function changeLabel(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  return `${value >= 0 ? "+" : ""}${value.toFixed(Math.abs(value) >= 100 ? 0 : 1)}%`;
}

function rangeDayCount(range: UsageRange, allDays = 90): number {
  return range === "today" ? 1 : range === "24h" ? 2 : range === "7d" ? 7 : range === "30d" ? 30 : range === "90d" ? 90 : allDays;
}

function rangeLabel(range: UsageRange, english: boolean): string {
  if (range === "today") return english ? "Today" : "今天";
  if (range === "all") return english ? "All" : "全部";
  return range.toUpperCase();
}

function heatLevel(value: number, maximum: number): 0 | 1 | 2 | 3 | 4 {
  if (value <= 0 || maximum <= 0) return 0;
  const ratio = value / maximum;
  if (ratio < .12) return 1;
  if (ratio < .34) return 2;
  if (ratio < .62) return 3;
  return 4;
}

export function UsageInsightsPanel({
  snapshot,
  snapshots,
  history,
  dailyUsage,
  paceBaselines,
  language,
  preferences,
  resetForecast = null,
  onSelectProvider,
  onPreferences,
  onOpenResetForecast,
  onClose,
}: Props) {
  const english = language === "en";
  const [range, setRange] = useState<UsageRange>("24h");
  const [chartMode, setChartMode] = useState<ChartMode>("token");
  const [modelFilter, setModelFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [terminalFilter, setTerminalFilter] = useState("");
  const [tokenReport, setTokenReport] = useState<CodexTokenUsageReport | null>(null);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [operationMessage, setOperationMessage] = useState<string | null>(null);
  const [budgetDraft, setBudgetDraft] = useState(String(preferences.monthlyApiBudgetUsd));
  const [upgradeDateDraft, setUpgradeDateDraft] = useState(preferences.codexPlanUpgradeDate ?? "");
  const [planTargetDraft, setPlanTargetDraft] = useState(String(preferences.codexPlanValueTargetRatio));
  const now = new Date();
  const filters = useMemo<TokenUsageFilters>(() => ({
    model: modelFilter || undefined,
    project: projectFilter || undefined,
    terminal: terminalFilter || undefined,
  }), [modelFilter, projectFilter, terminalFilter]);

  const windows = trackedQuotaWindows(snapshot);
  const primaryWindow = windows.find((item) => item.period === "weekly") ?? windows[0] ?? null;
  const remaining = primaryWindow ? clampPercent(primaryWindow.window.remainingPercent) : null;
  const pace = primaryWindow
    ? calculateQuotaPace(primaryWindow.window, now, paceBaselines[paceBaselineKey(snapshot.provider, primaryWindow.period)] ?? null)
    : null;
  const providerHistoryStart = history
    .filter((point) => point.provider === snapshot.provider)
    .reduce<number | null>((earliest, point) => {
      const timestamp = Date.parse(point.capturedAt);
      if (!Number.isFinite(timestamp)) return earliest;
      return earliest === null ? timestamp : Math.min(earliest, timestamp);
    }, null);
  const allQuotaDays = providerHistoryStart === null ? 1 : Math.max(1, Math.ceil((now.getTime() - providerHistoryStart) / 86_400_000) + 1);
  const calendar = useMemo(
    () => buildUsageCalendar(dailyUsage, history, snapshot.provider, now, rangeDayCount(range, allQuotaDays)),
    [allQuotaDays, dailyUsage, history, range, snapshot.provider],
  );
  const quotaSummary = useMemo(() => usageSummary(calendar), [calendar]);
  const quotaRangeHours = range === "all" ? null
    : range === "7d" ? 7 * 24
      : range === "30d" ? 30 * 24
        : range === "90d" ? 90 * 24
          : 24;
  const quotaTrend = useMemo(
    () => recentQuotaTrend(history, snapshot.provider, remaining, now, quotaRangeHours),
    [history, quotaRangeHours, remaining, snapshot.provider],
  );
  const quotaCurveHours = quotaRangeHours ?? Math.max(24, quotaTrend.length > 0
    ? (now.getTime() - Date.parse(quotaTrend[0].capturedAt)) / 3_600_000
    : 24);
  const rangeObserved = range === "24h" || range === "today" ? observedTrendUse(quotaTrend) : quotaSummary.observedUsedPercent;
  const cycleUsed = remaining === null ? null : 100 - remaining;

  const loadTokenUsage = useCallback((force = false, rebuild = false) => {
    if (snapshot.provider !== "codex") return;
    setTokenLoading(true);
    setTokenError(null);
    setOperationMessage(null);
    void fetchCodexTokenUsage(force, rebuild)
      .then((report) => {
        setTokenReport(report);
        if (rebuild) setOperationMessage(english ? "Local usage index rebuilt." : "本地用量索引已重建。");
      })
      .catch(() => setTokenError(english ? "Token metadata is unavailable." : "Token 元数据不可用。"))
      .finally(() => setTokenLoading(false));
  }, [english, snapshot.provider]);

  useEffect(() => { loadTokenUsage(false, false); }, [loadTokenUsage]);
  useEffect(() => { setBudgetDraft(String(preferences.monthlyApiBudgetUsd)); }, [preferences.monthlyApiBudgetUsd]);
  useEffect(() => { setUpgradeDateDraft(preferences.codexPlanUpgradeDate ?? ""); }, [preferences.codexPlanUpgradeDate]);
  useEffect(() => { setPlanTargetDraft(String(preferences.codexPlanValueTargetRatio)); }, [preferences.codexPlanValueTargetRatio]);

  const filterOptions = useMemo(
    () => tokenReport && snapshot.provider === "codex" ? buildTokenFilterOptions(tokenReport, range, now) : { models: [], projects: [], terminals: [] },
    [range, snapshot.provider, tokenReport],
  );
  useEffect(() => { if (modelFilter && !filterOptions.models.includes(modelFilter)) setModelFilter(""); }, [filterOptions.models, modelFilter]);
  useEffect(() => { if (projectFilter && !filterOptions.projects.includes(projectFilter)) setProjectFilter(""); }, [filterOptions.projects, projectFilter]);
  useEffect(() => { if (terminalFilter && !filterOptions.terminals.includes(terminalFilter)) setTerminalFilter(""); }, [filterOptions.terminals, terminalFilter]);

  const tokenComparison = useMemo(
    () => snapshot.provider === "codex" && tokenReport ? summarizeTokenReport(tokenReport, range, now, filters) : null,
    [filters, range, snapshot.provider, tokenReport],
  );
  const tokenSummary = tokenComparison?.current ?? null;
  const tokenSeries = useMemo(
    () => snapshot.provider === "codex" && tokenReport ? buildTokenSeries(tokenReport, range, now, filters) : [],
    [filters, range, snapshot.provider, tokenReport],
  );
  const heatmap = useMemo(
    () => snapshot.provider === "codex" && tokenReport ? buildTokenHeatmap(tokenReport, range, now, filters) : [],
    [filters, range, snapshot.provider, tokenReport],
  );
  const modelBreakdown = useMemo(
    () => snapshot.provider === "codex" && tokenReport ? buildModelBreakdown(tokenReport, range, now, filters) : [],
    [filters, range, snapshot.provider, tokenReport],
  );
  const budget = useMemo(
    () => tokenSummary ? buildApiBudgetForecast(
      tokenSummary,
      range,
      preferences.monthlyApiBudgetUsd,
      now,
      tokenReport ? usageCoverageStart(tokenReport, now) : now,
    ) : null,
    [preferences.monthlyApiBudgetUsd, range, tokenReport, tokenSummary],
  );
  const planComparison = useMemo(
    () => snapshot.provider === "codex" && tokenReport && preferences.codexPlanUpgradeDate
      ? buildCodexBillingPlanComparison(tokenReport, preferences.codexPlanUpgradeDate, now, preferences.codexPlanValueTargetRatio)
      : null,
    [preferences.codexPlanUpgradeDate, preferences.codexPlanValueTargetRatio, snapshot.provider, tokenReport],
  );

  useEffect(() => {
    if (!budget || budget.status !== "over" || !preferences.apiBudgetAlertsEnabled || snapshot.provider !== "codex") return;
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const key = `quota-float:api-budget-alert:${month}`;
    void deliverNotificationOnce(
      key,
      () => window.localStorage.getItem(key) !== null,
      () => window.localStorage.setItem(key, new Date().toISOString()),
      () => sendDesktopNotification(
        english ? "API-equivalent budget outlook" : "API 等价预算展望",
        english ? `Projected ${money(budget.projectedMonthlyUsd)} this month against a ${money(budget.budgetUsd)} plan.` : `本月预计 ${money(budget.projectedMonthlyUsd)}，已超过 ${money(budget.budgetUsd)} 的预算。`,
      ),
    );
  }, [budget, english, preferences.apiBudgetAlertsEnabled, snapshot.provider]);

  const totalChange = tokenComparison ? relativeChange(tokenComparison.current.totalTokens, tokenComparison.previous.totalTokens) : null;
  const costChange = tokenComparison ? relativeChange(tokenComparison.current.cost.totalUsd, tokenComparison.previous.cost.totalUsd) : null;
  const inputChange = tokenComparison ? relativeChange(tokenComparison.current.inputTokens, tokenComparison.previous.inputTokens) : null;
  const outputChange = tokenComparison ? relativeChange(tokenComparison.current.outputTokens, tokenComparison.previous.outputTokens) : null;
  const cachedChange = tokenComparison ? relativeChange(tokenComparison.current.cachedInputTokens, tokenComparison.previous.cachedInputTokens) : null;
  const chartMaximum = Math.max(0, ...tokenSeries.map((point) => chartMode === "cost" ? point.costUsd : point.totalTokens));
  const heatMaximum = Math.max(0, ...heatmap.map((cell) => chartMode === "cost" ? cell.costUsd : cell.tokens));
  const knownTokenData = snapshot.provider === "codex" && tokenSummary !== null && tokenSummary.totalTokens > 0;
  const weekdayLabels = english ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] : ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
  const rangeText = rangeLabel(range, english);
  const tokenCoverageStart = tokenReport ? usageCoverageStart(tokenReport, now) : null;
  const coverageDate = tokenCoverageStart && tokenReport?.buckets.length
    ? new Intl.DateTimeFormat(english ? "en-US" : "zh-CN", { year: "numeric", month: "short", day: "numeric" }).format(tokenCoverageStart)
    : null;
  const quotaStartDate = quotaTrend[0]
    ? new Intl.DateTimeFormat(english ? "en-US" : "zh-CN", { year: "numeric", month: "short", day: "numeric" }).format(new Date(quotaTrend[0].capturedAt))
    : null;
  const forecastWindow = resetForecast?.windowHours ?? 48;
  const forecastSourceMeta = resetForecast?.sourceCount && resetForecast.confidence
    ? (english
      ? ` · ${resetForecast.sourceCount} sources · ${resetForecast.confidence} confidence`
      : ` · ${resetForecast.sourceCount} 个来源 · ${resetForecast.confidence === "high" ? "高" : resetForecast.confidence === "medium" ? "中" : "低"}置信度`)
    : "";
  const forecastMeta = resetForecast?.resetAnnounced
    ? (english ? "Provider reset announced" : "平台已宣布重置")
    : (english
      ? `Reset outlook ${Math.round(resetForecast?.score ?? 0)}% · ${forecastWindow}h${forecastSourceMeta}`
      : `重置展望 ${Math.round(resetForecast?.score ?? 0)}% · ${forecastWindow} 小时${forecastSourceMeta}`);
  const tokenValue = (value: number): string => tokenLoading && !tokenReport ? "…" : knownTokenData ? compactNumber(value, language) : "—";
  const activeDays = knownTokenData ? tokenSummary.activeDays : quotaSummary.activeDays;
  const averageActiveDay = knownTokenData && tokenSummary.activeDays > 0 ? `${compactNumber(tokenSummary.totalTokens / tokenSummary.activeDays, language)} Token` : percent(quotaSummary.averageActiveDayPercent);

  const commitBudget = () => {
    const parsed = Number(budgetDraft);
    const value = Number.isFinite(parsed) ? Math.max(0, Math.min(1_000_000, Math.round(parsed * 100) / 100)) : preferences.monthlyApiBudgetUsd;
    setBudgetDraft(String(value));
    onPreferences?.({ ...preferences, monthlyApiBudgetUsd: value });
  };

  const commitUpgradeDate = () => {
    const value = /^\d{4}-\d{2}-\d{2}$/.test(upgradeDateDraft) ? upgradeDateDraft : null;
    setUpgradeDateDraft(value ?? "");
    onPreferences?.({ ...preferences, codexPlanUpgradeDate: value });
  };

  const commitPlanTarget = () => {
    const parsed = Number(planTargetDraft);
    const value = Number.isFinite(parsed) ? Math.max(1, Math.min(10, Math.round(parsed * 100) / 100)) : preferences.codexPlanValueTargetRatio;
    setPlanTargetDraft(String(value));
    onPreferences?.({ ...preferences, codexPlanValueTargetRatio: value });
  };

  const handleExport = async (kind: UsageExport) => {
    if (!tokenReport || !tokenSummary || !budget) return;
    setOperationMessage(null);
    try {
      const content = kind === "csv" ? buildUsageCsv(tokenReport, range, filters, now)
        : kind === "json" ? buildUsageJson(tokenReport, range, filters, now)
          : kind === "svg" ? buildUsageShareSvg(tokenSummary, modelBreakdown, budget, range, language, now)
            : buildPricingCatalogJson();
      const format = kind === "pricing" ? "json" : kind;
      const path = await exportUsageData(content, format);
      if (path) setOperationMessage(english ? `Saved ${format.toUpperCase()} export.` : `已保存 ${format.toUpperCase()} 文件。`);
    } catch {
      setOperationMessage(english ? "Export failed." : "导出失败。");
    }
  };

  return (
    <section className="usage-insights-panel" aria-label={english ? "Usage insights" : "用量洞察"} onMouseDown={(event) => event.stopPropagation()}>
      <header className="usage-insights-header">
        <div>
          <p><ChartBar weight="fill" />VIBE USAGE · LOCAL FIRST</p>
          <h2>{snapshot.displayName} {english ? "usage panorama" : "用量全景"}</h2>
          <small>{snapshot.provider === "codex" ? (english ? "Quota signals + indexed local Codex metadata" : "额度信号 + 增量索引的本地 Codex 元数据") : (english ? "Quota signals · Token metadata is available for Codex" : "额度信号 · Token 元数据目前仅支持 Codex")}</small>
        </div>
        <div className="usage-header-actions">
          {knownTokenData ? <>
            <button type="button" className="usage-icon-action" onClick={() => void handleExport("csv")} aria-label={english ? "Export anonymized CSV" : "导出脱敏 CSV"} title={english ? "Export anonymized CSV" : "导出脱敏 CSV"}><DownloadSimple /></button>
            <button type="button" className="usage-icon-action" onClick={() => void handleExport("svg")} aria-label={english ? "Share SVG summary" : "生成分享卡片"} title={english ? "Share SVG summary" : "生成分享卡片"}><ShareNetwork /></button>
          </> : null}
          {resetForecast && snapshot.provider === "codex" ? <button type="button" className="usage-reset-badge" onClick={() => onOpenResetForecast?.(resetForecast.sourceUrl)} aria-label={forecastMeta} title={forecastMeta}><Gauge weight="bold" />{resetForecast.resetAnnounced ? (english ? "Announced" : "已宣布") : `${Math.round(resetForecast.score)}%`}</button> : null}
          {onClose ? <button type="button" className="usage-close" onClick={onClose} aria-label={english ? "Close usage insights" : "关闭用量洞察"}><X /></button> : null}
        </div>
      </header>

      <div className="usage-toolbar">
        <div className="usage-range-tabs" role="group" aria-label={english ? "Usage range" : "用量区间"}>
          {RANGE_OPTIONS.map((option) => <button type="button" key={option} className={range === option ? "is-active" : ""} aria-pressed={range === option} onClick={() => setRange(option)}>{rangeLabel(option, english)}</button>)}
        </div>
        <label className="usage-provider-filter"><span>{english ? "Provider" : "平台"}</span><select value={snapshot.provider} onChange={(event) => onSelectProvider?.(event.target.value as ProviderId)}>{snapshots.map((item) => <option key={item.provider} value={item.provider}>{item.displayName}</option>)}</select></label>
        {snapshot.provider === "codex" ? <button type="button" className="usage-refresh" disabled={tokenLoading} onClick={() => loadTokenUsage(true, false)} aria-label={english ? "Refresh token metadata" : "刷新 Token 元数据"} title={english ? "Refresh token metadata" : "刷新 Token 元数据"}>{tokenLoading ? <SpinnerGap /> : <ArrowClockwise />}</button> : null}
      </div>

      {snapshot.provider === "codex" ? <div className="usage-dimension-filters" aria-label={english ? "Token dimensions" : "Token 维度筛选"}>
        <label><span>{english ? "Model" : "模型"}</span><select value={modelFilter} onChange={(event) => setModelFilter(event.target.value)}><option value="">{english ? "All models" : "全部模型"}</option>{filterOptions.models.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label><span>{english ? "Project" : "项目"}</span><select value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)}><option value="">{english ? "All projects" : "全部项目"}</option>{filterOptions.projects.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label><span>{english ? "Terminal" : "终端"}</span><select value={terminalFilter} onChange={(event) => setTerminalFilter(event.target.value)}><option value="">{english ? "All sources" : "全部来源"}</option>{filterOptions.terminals.map((value) => <option key={value}>{value}</option>)}</select></label>
        <small>{english ? "Tool names stay excluded to preserve the no-content boundary." : "为保持不解析正文的边界，工具名称不进入索引。"}</small>
      </div> : null}

      <div className="usage-summary-grid usage-summary-grid--extended">
        <article className="usage-stat-card usage-stat-card--cost"><span>{english ? "API equivalent" : "API 等价费用"}{changeLabel(costChange) ? <em>{changeLabel(costChange)}</em> : null}</span><strong>{tokenLoading && !tokenReport ? "…" : knownTokenData ? money(tokenSummary.cost.totalUsd) : "—"}</strong><small>{knownTokenData ? `${Math.round(tokenSummary.pricedTokenCoverage * 100)}% ${english ? "priced coverage" : "已定价覆盖"}` : (english ? "Codex metadata only" : "仅 Codex 元数据")}</small></article>
        <article className="usage-stat-card"><span>{english ? "Total Token" : "总 Token"}{changeLabel(totalChange) ? <em>{changeLabel(totalChange)}</em> : null}</span><strong>{tokenValue(tokenSummary?.totalTokens ?? 0)}</strong><small>{rangeText} · {tokenSummary ? `${tokenSummary.models} ${english ? "models" : "个模型"}` : (english ? "awaiting metadata" : "等待元数据")}</small></article>
        <article className="usage-stat-card"><span>{english ? "Input Token" : "输入 Token"}{changeLabel(inputChange) ? <em>{changeLabel(inputChange)}</em> : null}</span><strong>{tokenValue(tokenSummary?.inputTokens ?? 0)}</strong><small>{tokenSummary ? `${tokenSummary.inputOutputRatio.toFixed(1)}:1 ${english ? "input/output" : "输入/输出"}` : (english ? "includes cached input" : "包含缓存输入")}</small></article>
        <article className="usage-stat-card"><span>{english ? "Output Token" : "输出 Token"}{changeLabel(outputChange) ? <em>{changeLabel(outputChange)}</em> : null}</span><strong>{tokenValue(tokenSummary?.outputTokens ?? 0)}</strong><small>{tokenSummary ? `${compactNumber(tokenSummary.reasoningOutputTokens, language)} ${english ? "reasoning" : "推理"}` : (english ? "model output" : "模型输出")}</small></article>
        <article className="usage-stat-card usage-stat-card--cached"><span>{english ? "Cached Token" : "缓存 Token"}{changeLabel(cachedChange) ? <em>{changeLabel(cachedChange)}</em> : null}</span><strong>{tokenValue(tokenSummary?.cachedInputTokens ?? 0)}</strong><small>{tokenSummary ? `${Math.round(tokenSummary.cacheHitRate * 100)}% ${english ? "cache hit" : "缓存命中"}` : (english ? "cache reads" : "缓存读取")}</small></article>
        <article className="usage-stat-card"><span>{english ? "Sessions" : "会话数"}</span><strong>{tokenValue(tokenSummary?.sessions ?? 0)}</strong><small>{tokenSummary ? `${compactNumber(tokenSummary.averageTokensPerSession, language)} ${english ? "avg/session" : "平均/会话"}` : "—"}</small></article>
        <article className="usage-stat-card"><span>{english ? "Model responses" : "模型响应数"}</span><strong>{tokenValue(tokenSummary?.requests ?? 0)}</strong><small>{pace ? <><span>{pace.unit === "hour" ? (english ? "Hourly guide" : "每小时建议") : (english ? "Daily guide" : "每日建议")}</span> {percent(pace.averageRate)}{tokenSummary ? ` · ${compactNumber(tokenSummary.averageTokensPerResponse, language)} ${english ? "avg/response" : "平均/响应"}` : ""}</> : tokenSummary ? `${compactNumber(tokenSummary.averageTokensPerResponse, language)} ${english ? "avg/response" : "平均/响应"}` : (english ? "token_count events" : "token_count 事件")}</small></article>
        <article className="usage-stat-card"><span>{english ? "Active days" : "活跃天数"}</span><strong>{activeDays}</strong><small>{english ? `${averageActiveDay} avg active day` : `活跃日均 ${averageActiveDay}`}</small></article>
        <article className="usage-stat-card"><span>{english ? "Active streak" : "连续活跃"}</span><strong>{knownTokenData ? tokenSummary.consecutiveActiveDays : "—"}</strong><small>{english ? "consecutive days" : "连续天数"}</small></article>
        <article className="usage-stat-card"><span>{english ? "Peak hour" : "峰值时段"}</span><strong>{knownTokenData && tokenSummary.peakHour !== null ? `${String(tokenSummary.peakHour).padStart(2, "0")}:00` : "—"}</strong><small>{knownTokenData ? `${compactNumber(tokenSummary.longContextTokens, language)} ${english ? "long-context" : "长上下文"}` : "—"}</small></article>
        <article className="usage-stat-card"><span>{english ? "Remaining" : "剩余额度"}</span><strong>{percent(remaining, 0)}</strong><small>{primaryWindow ? formatResetTime(primaryWindow.window.resetsAt, now, language) : (english ? "Quota unavailable" : "暂无额度")}</small></article>
        <article className="usage-stat-card"><span>{english ? "Used this cycle" : "本周期已用"}</span><strong>{percent(cycleUsed, 0)}</strong><small>{english ? "provider-reported quota" : "平台额度"}</small></article>
        <article className="usage-stat-card"><span>{english ? "Range observed" : "区间观测"}</span><strong>{percent(rangeObserved)}</strong><small>{rangeText} · {english ? "quota decrease" : "额度下降"}</small></article>
        <article className="usage-stat-card usage-stat-card--forecast"><span>{english ? "Monthly outlook" : "月度费用预测"}</span><strong>{budget ? money(budget.projectedMonthlyUsd) : "—"}</strong><small>{budget ? `${money(budget.dailyAverageUsd)} ${english ? "daily avg" : "日均"}` : "—"}</small></article>
        <article className={`usage-stat-card usage-stat-card--budget usage-stat-card--${budget?.status ?? "disabled"}`}><span>{english ? "Budget status" : "预算状态"}</span><strong>{budget ? percent(budget.utilization * 100, 0) : "—"}</strong><small>{budget ? `${money(budget.budgetUsd)} ${english ? "monthly plan" : "月度预算"}` : "—"}</small></article>
      </div>

      {snapshot.provider === "codex" ? <section className={`usage-plan-comparison usage-plan-comparison--${planComparison?.recommendation ?? "pending"}`} aria-label={english ? "Plan upgrade comparison" : "套餐升级对比"}>
        <header>
          <div><Gauge weight="duotone" /><span>{english ? "5x → 20x BILLING TEST" : "5x → 20x 账期检验"}</span><strong>{planComparison ? `${planComparison.achievedRatio.toFixed(2)}× / ${planComparison.targetRatio}×` : "—"}</strong></div>
          <div className="usage-plan-controls">
            <label className="usage-plan-date"><span>{english ? "Upgrade / billing start" : "升级 / 账期开始"}</span><input type="date" value={upgradeDateDraft} disabled={!onPreferences} onChange={(event) => setUpgradeDateDraft(event.target.value)} onBlur={commitUpgradeDate} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></label>
            <label className="usage-plan-target"><span>{english ? "Value threshold" : "价值门槛"}</span><input type="number" min="1" max="10" step="0.1" value={planTargetDraft} disabled={!onPreferences} onChange={(event) => setPlanTargetDraft(event.target.value)} onBlur={commitPlanTarget} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /><i>×</i></label>
          </div>
        </header>
        <div className="usage-plan-track" aria-label={planComparison ? (english ? `${Math.round(planComparison.targetProgress * 100)} percent of target` : `已达到目标的 ${Math.round(planComparison.targetProgress * 100)}%`) : (english ? "Set the upgrade date" : "请设置升级日期")}>
          <span style={{ width: `${Math.min(100, Math.max(0, (planComparison?.targetProgress ?? 0) * 100))}%` }} />
          <i />
        </div>
        {planComparison ? <>
          <div className="usage-plan-metrics">
            <div><span>{english ? "5x baseline / day" : "5x 基线 / 日"}</span><strong>{compactNumber(planComparison.baseline.tokensPerDay, language)}</strong><small>{compactNumber(planComparison.baseline.totalTokens, language)} Token / {planComparison.baseline.elapsedDays.toFixed(0)}d</small></div>
            <div><span>{english ? "Latest full 20x cycle" : "最近完整 20x 账期"}</span><strong>{planComparison.completedCycleRatio === null ? "—" : `${planComparison.completedCycleRatio.toFixed(2)}×`}</strong><small>{planComparison.latestCompleted20x ? `${compactNumber(planComparison.latestCompleted20x.tokensPerDay, language)} / ${english ? "day" : "日"}` : (english ? "Waiting for a full cycle" : "等待完整账期")}</small></div>
            <div><span>{english ? "Minimum guidance" : "最低用量指导"}</span><strong>{compactNumber(planComparison.targetTokensPerDay, language)} / {english ? "day" : "日"}</strong><small>{compactNumber(planComparison.targetTokensPerWeek, language)} / {english ? "week" : "周"} · {compactNumber(planComparison.targetTokensCurrentCycle, language)} / {english ? "cycle" : "账期"}</small></div>
          </div>
          <p>{planComparison.recommendation === "keep"
            ? (english
              ? `KEEP 20x: the latest complete cycle reached ${planComparison.completedCycleRatio?.toFixed(2)}x. The current cycle is running at ${planComparison.currentCycleRatio.toFixed(2)}x and has ${compactNumber(planComparison.current20x.totalTokens, language)} versus ${compactNumber(planComparison.targetTokensCurrentToDate, language)} required to date.`
              : `保留 20x：最近完整账期达到 ${planComparison.completedCycleRatio?.toFixed(2)} 倍；当前账期速度为 ${planComparison.currentCycleRatio.toFixed(2)} 倍，累计 ${compactNumber(planComparison.current20x.totalTokens, language)} Token，同期最低线为 ${compactNumber(planComparison.targetTokensCurrentToDate, language)}。`)
            : planComparison.recommendation === "downgrade"
              ? (english
                ? `DOWNGRADE TO 5x: the latest complete cycle reached only ${planComparison.completedCycleRatio?.toFixed(2)}x, below the ${planComparison.targetRatio}x threshold.`
                : `降级回 5x：最近完整账期只有 ${planComparison.completedCycleRatio?.toFixed(2)} 倍，低于 ${planComparison.targetRatio} 倍门槛。`)
              : (english
                ? "No decision yet: wait for a complete 20x billing cycle and a complete local metadata window. Weekly pacing is an early warning only."
                : "暂不决策：需等待完整 20x 账期且本地元数据覆盖完整；周均只作为提前预警。")}</p>
        </> : <p>{english ? "Set the first 20x billing date to compare the preceding full 5x cycle with every 20x cycle after it." : "设置第一次 20x 扣费日期；Quota Float 会用此前完整 5x 账期作为基线，逐账期判断保留或降级。"}</p>}
      </section> : null}

      {knownTokenData && budget ? <section className={`usage-budget-panel usage-budget-panel--${budget.status}`} aria-label={english ? "API-equivalent budget" : "API 等价预算"}>
        <div><CurrencyDollar weight="bold" /><span>{english ? "Monthly API-equivalent plan" : "月度 API 等价预算"}</span><strong>{money(budget.projectedMonthlyUsd)} / {money(budget.budgetUsd)}</strong></div>
        <div className="usage-budget-track"><span style={{ width: `${Math.min(100, budget.utilization * 100)}%` }} /></div>
        <label><span>{english ? "Budget USD" : "预算 USD"}</span><input type="number" min="0" max="1000000" step="10" value={budgetDraft} onChange={(event) => setBudgetDraft(event.target.value)} onBlur={commitBudget} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></label>
        <button type="button" className={preferences.apiBudgetAlertsEnabled ? "is-active" : ""} aria-pressed={preferences.apiBudgetAlertsEnabled} onClick={() => onPreferences?.({ ...preferences, apiBudgetAlertsEnabled: !preferences.apiBudgetAlertsEnabled })}>{preferences.apiBudgetAlertsEnabled ? <Bell /> : <BellSlash />}{english ? "Alert" : "提醒"}</button>
      </section> : null}

      <article className="usage-quota-trend-card">
        <header>
          <span>{english ? `QUOTA REMAINING · ${rangeText.toUpperCase()}` : `剩余额度 · ${rangeText}`}</span>
          <strong>{percent(quotaTrend.at(-1)?.remainingPercent ?? remaining, 1)}</strong>
        </header>
        <QuotaHistoryCurve
          points={quotaTrend}
          language={language}
          variant="insights"
          now={now}
          hours={quotaCurveHours}
          ariaLabel={range === "24h"
            ? (english ? "24-hour quota remaining curve" : "24 小时剩余额度曲线")
            : (english ? `${rangeText} recorded quota remaining curve` : `${rangeText}已记录剩余额度曲线`)}
        />
        <footer>
          <span>{range === "all" ? (quotaStartDate ?? (english ? "First record" : "首次记录")) : range === "today" ? (english ? "Today" : "今天") : `${rangeText} ${english ? "ago" : "前"}`}</span>
          <small>{english ? "Hover or use arrow keys to inspect each sample" : "悬停或使用方向键查看每个时间点"}</small>
          <span>{english ? "Now" : "现在"}</span>
        </footer>
      </article>

      <div className="usage-chart-controls"><div><ChartBar weight="duotone" /><span>{english ? "Usage distribution" : "用量分布"}</span></div><div role="group" aria-label={english ? "Chart metric" : "图表指标"}><button type="button" className={chartMode === "token" ? "is-active" : ""} aria-pressed={chartMode === "token"} onClick={() => setChartMode("token")}>Token</button><button type="button" className={chartMode === "cost" ? "is-active" : ""} aria-pressed={chartMode === "cost"} onClick={() => setChartMode("cost")}>{english ? "Cost" : "费用"}</button></div></div>

      <div className="usage-insights-detail-grid">
        <article className="usage-daily-card">
          <header><span>{range === "today" || range === "24h" ? (english ? "HOURLY TREND" : "小时趋势") : range === "all" ? (english ? "MONTHLY HISTORY" : "月度历史") : (english ? "DAILY TREND" : "每日趋势")}</span><strong>{knownTokenData ? (chartMode === "cost" ? money(tokenSummary.cost.totalUsd) : compactNumber(tokenSummary.totalTokens, language)) : "—"}</strong></header>
          {knownTokenData ? <div className={`usage-bars usage-bars--${tokenSeries.length > 40 ? "dense" : "regular"}`} role="img" aria-label={english ? `${rangeText} token usage trend` : `${rangeText} Token 用量趋势`}>
            {tokenSeries.map((point, index) => {
              const value = chartMode === "cost" ? point.costUsd : point.totalTokens;
              const height = chartMaximum > 0 ? Math.max(value > 0 ? 3 : 0, value / chartMaximum * 100) : 0;
              const uncached = Math.max(0, point.inputTokens - point.cachedInputTokens);
              const total = Math.max(1, uncached + point.cachedInputTokens + point.outputTokens);
              const showLabel = index === 0 || index === tokenSeries.length - 1 || index % Math.max(1, Math.ceil(tokenSeries.length / 6)) === 0;
              return <span className="usage-bar-slot" key={point.key} title={`${point.label} · ${chartMode === "cost" ? money(point.costUsd) : compactNumber(point.totalTokens, language)}`}><i className={`usage-bar${chartMode === "cost" ? " usage-bar--cost" : ""}`} style={{ "--bar-height": `${height}%` } as CSSProperties}>{chartMode === "token" ? <><b className="usage-bar-output" style={{ flexBasis: `${point.outputTokens / total * 100}%` }} /><b className="usage-bar-input" style={{ flexBasis: `${uncached / total * 100}%` }} /><b className="usage-bar-cached" style={{ flexBasis: `${point.cachedInputTokens / total * 100}%` }} /></> : null}</i>{showLabel ? <small>{point.label}</small> : null}</span>;
            })}
          </div> : <div className="usage-chart-empty">{tokenLoading ? <><SpinnerGap />{english ? "Scanning local token metadata…" : "正在扫描本地 Token 元数据…"}</> : tokenError ?? (english ? "Token metadata is currently available for Codex only." : "目前仅 Codex 提供 Token 元数据。")}</div>}
          <footer><span className="usage-legend-input" />{english ? "uncached input" : "非缓存输入"}<span className="usage-legend-cached" />{english ? "cached" : "缓存"}<span className="usage-legend-output" />{english ? "output" : "输出"}</footer>
        </article>

        <article className="usage-hourly-card">
          <header><span><CalendarDots weight="duotone" />{english ? "WEEKDAY × HOUR" : "星期 × 小时"}</span><small>{rangeText} · {chartMode === "cost" ? (english ? "API equivalent" : "API 等价费用") : "Token"}</small></header>
          {knownTokenData ? <div className="usage-hourly-matrix" role="img" aria-label={english ? "Hourly token activity heatmap" : "分时 Token 活跃热力图"}>{weekdayLabels.map((label, weekday) => <div className="usage-hour-row" key={label}><span>{label}</span><div>{heatmap.slice(weekday * 24, weekday * 24 + 24).map((cell) => { const value = chartMode === "cost" ? cell.costUsd : cell.tokens; return <i className={`usage-hour-cell usage-hour-cell--${heatLevel(value, heatMaximum)}`} key={cell.hour} title={`${label} ${String(cell.hour).padStart(2, "0")}:00 · ${chartMode === "cost" ? money(cell.costUsd) : compactNumber(cell.tokens, language)}`} />; })}</div></div>)}<div className="usage-hour-axis"><span>00</span><span>03</span><span>06</span><span>09</span><span>12</span><span>15</span><span>18</span><span>21</span></div></div> : <div className="usage-chart-empty usage-chart-empty--heat">{tokenLoading ? (english ? "Building hourly map…" : "正在生成分时图…") : (english ? "No hourly Token signal for this provider." : "该平台暂无分时 Token 信号。")}</div>}
        </article>
      </div>

      {knownTokenData ? <section className="usage-model-breakdown" aria-label={english ? "Model cost breakdown" : "模型费用明细"}>
        <header><div><Database weight="duotone" /><span>{english ? "MODEL COST LEDGER" : "模型费用账本"}</span></div><small>{modelBreakdown.length} {english ? "models · filtered view" : "个模型 · 当前筛选"}</small></header>
        <div className="usage-model-table" role="table" aria-colcount={5} aria-rowcount={modelBreakdown.length + 1}>
          <div className="usage-model-row usage-model-row--head" role="row"><span role="columnheader">{english ? "Model" : "模型"}</span><span role="columnheader">Token</span><span role="columnheader">{english ? "Sessions" : "会话"}</span><span role="columnheader">{english ? "Cache" : "缓存"}</span><span role="columnheader">{english ? "API equivalent" : "API 等价费用"}</span></div>
          {modelBreakdown.map((model) => <div className="usage-model-row" role="row" key={model.model}><span role="cell"><strong>{model.label}</strong><small>{model.model}</small></span><span role="cell"><strong>{compactNumber(model.totalTokens, language)}</strong><small>{percent(model.share * 100, 0)} {english ? "share" : "占比"}</small></span><span role="cell">{model.sessions}</span><span role="cell">{percent(model.cacheHitRate * 100, 0)}</span><span role="cell" className={model.pricedTokenCoverage < 1 ? "is-unpriced" : ""}>{model.pricedTokenCoverage > 0 ? money(model.cost.totalUsd) : (english ? "Unpriced" : "未定价")}</span></div>)}
        </div>
      </section> : null}

      {snapshot.provider === "codex" ? <section className="usage-maintenance-panel" aria-label={english ? "Local index and pricing maintenance" : "本地索引与价格维护"}>
        <div><Wrench weight="duotone" /><span>{english ? "LOCAL INDEX" : "本地索引"}</span><strong>{tokenReport ? `${tokenReport.cacheStatus.toUpperCase()} · ${tokenReport.scanDurationMs}ms` : "—"}</strong><small>{tokenReport ? `${tokenReport.indexedFiles} ${english ? "files indexed" : "个索引文件"} · ${tokenReport.reusedFiles} ${english ? "reused" : "复用"} · ${bytes(tokenReport.scannedBytes)} ${english ? "read" : "读取"}${coverageDate ? ` · ${english ? "since" : "自"} ${coverageDate}` : ""}` : (english ? "Waiting for metadata" : "等待元数据")}</small></div>
        <div><CurrencyDollar weight="duotone" /><span>{english ? "PRICE CATALOG" : "价格目录"}</span><strong>v{OPENAI_PRICING_VERSION}</strong><small>{OPENAI_PRICING_CATALOG.models.length} {english ? "models · standard API rates" : "个模型 · 标准 API 单价"}</small></div>
        <div className="usage-maintenance-actions"><button type="button" disabled={tokenLoading} onClick={() => loadTokenUsage(true, true)}><ArrowClockwise />{english ? "Rebuild index" : "重建索引"}</button><button type="button" disabled={!knownTokenData} onClick={() => void handleExport("json")}><DownloadSimple />JSON</button><button type="button" disabled={!knownTokenData} onClick={() => void handleExport("pricing")}><DownloadSimple />{english ? "Prices" : "价格表"}</button></div>
      </section> : null}

      {operationMessage ? <div className="usage-operation-message" role="status">{operationMessage}</div> : null}
      <footer className="usage-insights-footnote"><CurrencyDollar weight="bold" /><span>{english ? "Token history covers every retained local Codex session metadata file. Recorded quota history starts when Quota Float began sampling. Prompt and response content is not parsed or stored." : "Token 历史覆盖本机仍保留的全部 Codex 会话元数据；剩余额度历史从 Quota Float 开始采样时起计算；提示词和回复正文不会被解析或保存。"}</span><button type="button" onClick={() => onOpenResetForecast?.(OPENAI_PRICING_SOURCE)}>{english ? `Pricing · ${OPENAI_PRICING_UPDATED_AT}` : `定价来源 · ${OPENAI_PRICING_UPDATED_AT}`}</button>{tokenReport?.truncated ? <em>{english ? `Partial index · ${tokenReport.skippedFiles} files skipped` : `部分索引 · 跳过 ${tokenReport.skippedFiles} 个文件`}</em> : null}</footer>
    </section>
  );
}

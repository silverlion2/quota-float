import { useMemo } from "react";
import type { Language, ProviderSnapshot, QuotaHistoryPoint, ResetForecast } from "../types";
import { calculateResetConsumptionPlan } from "../lib/resetConsumptionPlan";
import { activeResetWindow, freshResetForecast, resetForecastAdvice, resetPrediction, resetSignalSummary, type ResetForecastLoadStatus } from "../lib/resetForecast";
import { formatDateTime } from "../lib/format";
import { QuotaBurndown } from "./QuotaBurndown";

interface Props {
  snapshot: ProviderSnapshot;
  history: QuotaHistoryPoint[];
  forecast: ResetForecast | null;
  now: Date;
  language: Language;
  onOpenSource: (url: string) => void;
  loadStatus?: ResetForecastLoadStatus;
  onRefresh?: () => void;
  id?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function ResetOutlook({ snapshot, history, forecast: incomingForecast, now, language, onOpenSource, loadStatus, onRefresh, id, open, onOpenChange }: Props) {
  const plan = useMemo(() => calculateResetConsumptionPlan(snapshot, history, now), [snapshot, history, now]);
  if (snapshot.provider !== "codex") return null;
  const en = language === "en";
  const forecast = freshResetForecast(incomingForecast, now);
  const prediction = forecast ? resetPrediction(forecast) : null;
  const watchWindow = prediction ? activeResetWindow(prediction.watchWindow, now, prediction.validUntil) : null;
  const expectedWindow = prediction ? activeResetWindow(prediction.expectedWindow, now, new Date(Date.parse(prediction.generatedAt) + 14 * 86400000).toISOString()) : null;
  const summary = forecast ? resetSignalSummary(forecast, en)
    : loadStatus === "loading" ? en ? "Loading public signals…" : "正在获取公开信号…"
    : en ? "No fresh public signal" : "暂无新鲜公开信号";
  const observationNotes = {
    insufficient_history: en ? "Usage estimate needs 3 continuous samples spanning 30 minutes." : "消耗估计需跨 30 分钟的 3 个连续采样。",
    stale_history: en ? "Samples unavailable or stale; waiting for fresh data." : "采样不可用或过期，等待新数据。",
    ambiguous_history: en ? "Weekly window unclear or changed; collecting samples." : "周周期不明确或变化，积累新采样。",
    refill: en ? "Quota refilled. Collecting new samples." : "额度已回补，积累新采样。",
    gap: en ? "Gap exceeded one hour; collecting samples." : "采样间断超过一小时，积累新采样。",
    observed: "",
  };
  const number = (value: number) => new Intl.NumberFormat(en ? "en-US" : "zh-CN", { maximumFractionDigits: 2 }).format(value);
  const rate = (value: number) => `${number(value)} ${en ? "pp/h" : "百分点/小时"}`;
  const windowText = (window: { startAt: string; endAt: string }) => `${formatDateTime(window.startAt, language)} – ${formatDateTime(window.endAt, language)}`;
  return <details id={id} open={open} onToggle={(event) => onOpenChange?.(event.currentTarget.open)} className="reset-outlook" onMouseDown={(event) => event.stopPropagation()}>
    <summary>{en ? "Reset forecast & consumption plan" : "重置预测与消耗计划"}<strong>{summary}</strong></summary>
    <div className="reset-outlook-body">
      {loadStatus === "cached" && forecast ? <p role="status" className="reset-outlook-note">{en ? "Refresh failed. Showing the last valid public signal; its original expiry is unchanged." : "本次刷新失败，保留上次有效公开信号；有效期仍按原数据时间计算。"}</p> : null}
      {!forecast && loadStatus !== "loading" ? <p className="reset-outlook-note">{en ? "Sources may be unreachable, outdated, or invalid. Retry or inspect the public trackers below." : "来源可能暂时无法连接、数据过期或格式无效。可重试或查看下方公开来源。"}</p> : null}
      {prediction ? <section className="reset-prediction" aria-label={en ? "Global reset prediction" : "全局重置预测"}>
        <h4>{en ? "Will Codex reset early?" : "Codex 会提前全局重置吗？"}</h4>
        <dl className="reset-prediction-horizons">
          {prediction.estimate24h !== null ? <div><dt>{en ? "24h forecast" : "24小时预测"}</dt><dd>{number(prediction.estimate24h)}{prediction.basis === "source_model" ? "%" : "/100"}{prediction.basis === "source_model" && prediction.range24h ? <small>{number(prediction.range24h.lower)}–{number(prediction.range24h.upper)}% {en ? "model range" : "模型区间"}</small> : null}</dd></div> : null}
          <div><dt>{en ? "48h forecast" : "48小时预测"}</dt><dd>{number(prediction.estimate48h)}{prediction.basis === "source_model" ? "%" : "/100"}{prediction.basis === "source_model" && prediction.range48h ? <small>{number(prediction.range48h.lower)}–{number(prediction.range48h.upper)}% {en ? "model range" : "模型区间"}</small> : null}</dd></div>
        </dl>
        <p className="reset-prediction-action">{resetForecastAdvice({ ...prediction, watchWindow, expectedWindow }, en)}</p>
        <dl className="reset-prediction-timing">
          {expectedWindow ? <div><dt>{en ? "Reported window · unverified" : "来源报告窗口 · 未核实"}</dt><dd>{windowText(expectedWindow)}</dd></div> : null}
          {watchWindow ? <div><dt>{en ? "Watch window · local time" : "观察时段 · 本地时间"}</dt><dd>{windowText(watchWindow)}</dd></div> : null}
          <div><dt>{en ? "48h forecast ends" : "48小时预测截止"}</dt><dd>{formatDateTime(prediction.validUntil, language)}</dd></div>
        </dl>
        <p className="reset-outlook-note">{watchWindow
          ? en ? "Historical watch window only. " : "仅为历史观察时段。"
          : en ? "No reliable reset date is available. " : "暂无可靠重置日期。"}{en ? "No verified announcement. Horizons start at the data time; ranges are uncalibrated." : "无核实公告；从数据时间起算，区间未经校准。"}</p>
        <p className="reset-outlook-note">{prediction.sourceName} · {en ? "Low confidence" : "低置信度"} · {prediction.calibration === "experimental" ? en ? "Experimental model" : "实验模型" : en ? "Uncalibrated signal" : "未校准信号"}<br />{en ? "As of " : "数据时间："}{formatDateTime(prediction.generatedAt, language)}</p>
      </section> : null}
      {onRefresh ? <button type="button" className="usage-refresh" disabled={loadStatus === "loading"} onClick={onRefresh}>{loadStatus === "loading" ? en ? "Refreshing…" : "正在刷新…" : en ? "Refresh reset forecast" : "刷新重置预测"}</button> : null}
      <details className="reset-evidence">
      <summary>{en ? "Why this forecast? View sources" : "为什么这样预测？查看来源"}</summary>
      {prediction ? <p className="reset-outlook-note">{prediction.reportedLastResetAt
        ? en ? `Baseline: ${formatDateTime(prediction.reportedLastResetAt, language)}. Source selected by baseline, detail and freshness; no averaging.` : `基线：${formatDateTime(prediction.reportedLastResetAt, language)}。按日期、完整度及时效选源，不平均分数。`
        : en ? "Reset history unavailable; fallback reference only." : "缺少重置历史，仅作备用参考。"}</p> : null}
      {forecast?.quality === "conflicting" ? <p className="reset-outlook-note">{en ? "Sources disagree. Compare their baselines below." : "来源有分歧，可在下方对比日期和分数。"}</p> : null}
      {forecast?.sources?.map((source) => <div className="reset-outlook-source" key={source.sourceUrl}>
        <button type="button" onClick={() => onOpenSource(source.sourceUrl)}>{source.name} ↗</button>
        {source.sourceUrl === prediction?.sourceUrl ? <small>{en ? "Primary reference" : "主要参考"}</small> : null}
        <span>{source.score}/100 · {source.included === false ? en ? "Excluded: older baseline" : "已排除：较旧基线" : en ? "Tracker score" : "来源分数"}</span>
        <small>{en ? "Data: " : "数据时间："}{formatDateTime(source.fetchedAt, language)}</small>
        <small>{en ? "Last reported reset: " : "来源记录的最近重置："}{source.lastResetAt ? formatDateTime(source.lastResetAt, language) : en ? "Unknown" : "未知"}</small>
      </div>)}
      {!forecast?.sources?.length ? <div className="reset-outlook-source">{[
        ["Codex Reset", "https://codex-reset.com/"],
        ["Codex Reset Radar", "https://codexresetradar.com/"],
        ["Will Codex Reset Today", "https://codexreset.app/"],
      ].map(([name, url]) => <button type="button" key={url} onClick={() => onOpenSource(url)}>{name} ↗</button>)}</div> : null}
      </details>
      <h4>{en ? "Personal consumption plan" : "个人消耗计划"}</h4>
      {plan ? <>
        <QuotaBurndown plan={plan} resetsAt={snapshot.weeklyWindow!.resetsAt!} language={language} />
        <dl>
          <div><dt>{en ? "Remaining / time left" : "剩余额度 / 剩余时间"}</dt><dd>{number(plan.remainingPercent)}% / {number(plan.hoursUntilReset)}h</dd></div>
          <div><dt>{en ? "Target average" : "目标平均速度"}</dt><dd>{rate(plan.targetPercentPerHour)}</dd></div>
          {plan.observedBurnPercentPerHour !== null ? <>
            <div><dt>{en ? "Observed average" : "实测平均速度"}</dt><dd>{rate(plan.observedBurnPercentPerHour)}</dd></div>
            <div><dt>{en ? "Unused at personal reset" : "个人重置时预计剩余"}</dt><dd>{number(plan.forecastUnusedPercentAtReset!)}%</dd></div>
            {plan.forecastHoursToExhaustion !== null && plan.forecastHoursToExhaustion < plan.hoursUntilReset ? <div><dt>{en ? "Quota runs out before reset" : "预计提前耗尽"}</dt><dd>{number(plan.forecastHoursToExhaustion)}h</dd></div> : null}
          </> : null}
        </dl>
        <p className="reset-outlook-note">{plan.observedBurnPercentPerHour !== null
          ? en ? `${plan.sampleCount} samples / ${number(plan.sampleSpanMinutes)} min, including idle time. Assumes the average continues.` : `${number(plan.sampleSpanMinutes)} 分钟 / ${plan.sampleCount} 个采样，含空闲时间；假设平均速度持续。`
          : observationNotes[plan.observationStatus]}</p>
        <p className="reset-outlook-note">{en ? "pp/h: weekly percentage points/hour. Short-window limits still apply." : "速度：周额度百分点/小时；仍受短周期限额约束。"}</p>
      </> : <p>{en ? "Needs fresh weekly quota and a future personal reset." : "需要最新周额度及未来个人重置时间。"}</p>}
    </div>
  </details>;
}

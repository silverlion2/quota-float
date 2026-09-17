import { useMemo } from "react";
import type { Language, ProviderSnapshot, QuotaHistoryPoint, ResetForecast } from "../types";
import { calculateResetConsumptionPlan } from "../lib/resetConsumptionPlan";
import { freshResetForecast, resetSignalSummary, type ResetForecastLoadStatus } from "../lib/resetForecast";
import { formatDateTime } from "../lib/format";

interface Props {
  snapshot: ProviderSnapshot;
  history: QuotaHistoryPoint[];
  forecast: ResetForecast | null;
  now: Date;
  language: Language;
  onOpenSource: (url: string) => void;
  loadStatus?: ResetForecastLoadStatus;
  onRefresh?: () => void;
}

export function ResetOutlook({ snapshot, history, forecast: incomingForecast, now, language, onOpenSource, loadStatus, onRefresh }: Props) {
  const plan = useMemo(() => calculateResetConsumptionPlan(snapshot, history, now), [snapshot, history, now]);
  if (snapshot.provider !== "codex") return null;
  const en = language === "en";
  const forecast = freshResetForecast(incomingForecast, now);
  const summary = forecast ? resetSignalSummary(forecast, en)
    : loadStatus === "loading" ? en ? "Loading public signals…" : "正在获取公开信号…"
    : en ? "No fresh public signal" : "暂无新鲜公开信号";
  const observationNotes = {
    insufficient_history: en ? "Recent continuous history is insufficient for a burn estimate. Need 3 samples spanning 30 minutes." : "近期连续样本不足；至少需要跨 30 分钟的 3 个采样。",
    stale_history: en ? "Recent history contains stale or unavailable data. Waiting for a fresh continuous segment." : "近期记录含过期或不可用数据，等待新的连续采样。",
    ambiguous_history: en ? "Quota window identity changed or the history is ambiguous. Waiting for matching weekly samples." : "额度周期发生变化或记录无法明确对应周额度，等待匹配采样。",
    refill: en ? "A quota refill interrupted the observed rate. Collecting samples after the refill." : "额度补充打断了原有消耗速度，正在积累补充后的采样。",
    gap: en ? "A gap longer than an hour interrupted the observed rate. Keep monitoring to collect continuous samples." : "超过一小时的采样间断打断了速度估算，请保持连续监测。",
    observed: "",
  };
  const number = (value: number) => new Intl.NumberFormat(en ? "en-US" : "zh-CN", { maximumFractionDigits: 2 }).format(value);
  const rate = (value: number) => `${number(value)} ${en ? "pp/h" : "百分点/小时"}`;
  return <details className="reset-outlook" onMouseDown={(event) => event.stopPropagation()}>
    <summary>{en ? "Reset forecast & consumption plan" : "重置预测与消耗计划"}<strong>{summary}</strong></summary>
    <div className="reset-outlook-body">
      <h4>{en ? "Public reset evidence" : "公开重置依据"}</h4>
      {loadStatus === "cached" && forecast ? <p role="status" className="reset-outlook-note">{en ? "Refresh failed. Showing the last valid public signal; its original expiry is unchanged." : "本次刷新失败，保留上次有效公开信号；有效期仍按原数据时间计算。"}</p> : null}
      {!forecast && loadStatus !== "loading" ? <p className="reset-outlook-note">{en ? "Sources may be unreachable, outdated, or invalid. Retry or inspect the public trackers below." : "来源可能暂时无法连接、数据过期或格式无效。可重试或查看下方公开来源。"}</p> : null}
      {forecast?.quality === "conflicting" ? <p className="reset-outlook-note">{en ? "Trackers disagree about reset history or differ by more than 25 score points. No combined estimate is shown." : "来源记录的重置历史不一致，或分数相差超过 25 分；暂不展示合并估计。"}</p> : null}
      {forecast?.quality === "limited" ? <p className="reset-outlook-note">{en ? "Reset history is missing or lacks corroboration. Individual source scores remain available below." : "重置历史缺失或缺少其他来源佐证，下方仍可查看各来源分数。"}</p> : null}
      <p className="reset-outlook-note">{en ? "These tracker scores are uncalibrated. An early global reset is uncertain; the consumption target uses your personal schedule." : "第三方分数尚未校准，提前全局重置仍不确定；消耗目标按你的个人周期计算。"}</p>
      {onRefresh ? <button type="button" className="usage-refresh" disabled={loadStatus === "loading"} onClick={onRefresh}>{loadStatus === "loading" ? en ? "Refreshing…" : "正在刷新…" : en ? "Refresh reset forecast" : "刷新重置预测"}</button> : null}
      {forecast?.sources?.map((source) => <div className="reset-outlook-source" key={source.sourceUrl}>
        <button type="button" onClick={() => onOpenSource(source.sourceUrl)}>{source.name} ↗</button>
        <span>{source.score}/100 · {source.included === false ? en ? "Excluded" : "未纳入" : en ? "Tracker score" : "来源分数"}</span>
        <small>{en ? "Data: " : "数据时间："}{formatDateTime(source.fetchedAt, language)}</small>
        <small>{en ? "Last reported reset: " : "来源记录的最近重置："}{source.lastResetAt ? formatDateTime(source.lastResetAt, language) : en ? "Unknown" : "未知"}</small>
      </div>)}
      {!forecast?.sources?.length ? <div className="reset-outlook-source">{[
        ["Codex Reset", "https://codex-reset.com/"],
        ["Codex Reset Radar", "https://codexresetradar.com/"],
        ["Will Codex Reset Today", "https://codexreset.app/"],
      ].map(([name, url]) => <button type="button" key={url} onClick={() => onOpenSource(url)}>{name} ↗</button>)}</div> : null}
      {forecast?.exclusions?.map((source) => <p className="reset-outlook-note" key={source.sourceUrl}>{source.name} — {en ? "Excluded: its reset history is older than the date corroborated by other trackers." : "已排除：其重置历史落后于其他来源一致记录的日期。"}</p>)}
      <h4>{en ? "Personal consumption plan" : "个人消耗计划"}</h4>
      {plan ? <>
        <p>{en ? "To use the remaining weekly quota by your personal reset:" : "在个人重置前用完剩余周额度："}</p>
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
          ? en ? `Based on ${plan.sampleCount} samples over ${number(plan.sampleSpanMinutes)} minutes, including idle time. Assumes this average continues.` : `基于最近 ${number(plan.sampleSpanMinutes)} 分钟的 ${plan.sampleCount} 个采样，包含空闲时间；仅在此平均速度持续时成立。`
          : observationNotes[plan.observationStatus]}</p>
        <p className="reset-outlook-note">{en ? "pp/h = percentage points of weekly quota per hour. Short-window limits may interrupt usage." : "速度单位为周额度百分点/小时；短周期限额仍可能使消耗中断。"}</p>
      </> : <p>{en ? "A fresh weekly quota and a future personal reset time are needed." : "需要最新周额度和有效的未来个人重置时间。"}</p>}
    </div>
  </details>;
}

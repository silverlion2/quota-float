import { CalendarDots, ChartLineUp, Target, X } from "@phosphor-icons/react";
import { useMemo, type CSSProperties } from "react";
import { clampPercent, formatResetTime } from "../lib/format";
import { buildUsageCalendar, recentQuotaTrend, usageSummary } from "../lib/usageInsights";
import { calculateQuotaPace, paceBaselineKey, trackedQuotaWindows } from "../lib/quotaPace";
import type { DailyPaceBaseline, DailyUsageSummary, Language, ProviderSnapshot, QuotaHistoryPoint } from "../types";

interface Props {
  snapshot: ProviderSnapshot;
  history: QuotaHistoryPoint[];
  dailyUsage: DailyUsageSummary[];
  paceBaselines: Record<string, DailyPaceBaseline>;
  language: Language;
  onClose?: () => void;
}

function lineGeometry(values: number[]): { line: string; area: string } | null {
  if (values.length < 2) return null;
  const points = values.map((value, index) => {
    const x = 4 + (index / (values.length - 1)) * 212;
    const y = 66 - (clampPercent(value) / 100) * 56;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return {
    line: `M ${points.join(" L ")}`,
    area: `M 4 70 L ${points.join(" L ")} L 216 70 Z`,
  };
}

function percent(value: number | null, digits = 1): string {
  return value === null ? "—" : `${value.toFixed(digits).replace(/\.0$/, "")}%`;
}

export function UsageInsightsPanel({ snapshot, history, dailyUsage, paceBaselines, language, onClose }: Props) {
  const english = language === "en";
  const now = new Date();
  const windows = trackedQuotaWindows(snapshot);
  const primaryWindow = windows.find((item) => item.period === "weekly") ?? windows[0] ?? null;
  const remaining = primaryWindow ? clampPercent(primaryWindow.window.remainingPercent) : null;
  const pace = primaryWindow
    ? calculateQuotaPace(primaryWindow.window, now, paceBaselines[paceBaselineKey(snapshot.provider, primaryWindow.period)] ?? null)
    : null;
  const calendar = useMemo(
    () => buildUsageCalendar(dailyUsage, history, snapshot.provider, now),
    [dailyUsage, history, snapshot.provider],
  );
  const summary = useMemo(() => usageSummary(calendar), [calendar]);
  const trend = useMemo(
    () => recentQuotaTrend(history, snapshot.provider, remaining, now),
    [history, remaining, snapshot.provider],
  );
  const geometry = lineGeometry(trend.map((point) => point.remainingPercent));
  const guide = pace ? pace.averageRate : null;
  const todayRatio = summary.todayUsedPercent !== null && guide !== null && guide > 0
    ? Math.min(100, (summary.todayUsedPercent / guide) * 100)
    : 0;
  const cycleUsed = remaining === null ? null : 100 - remaining;
  const leadingCells = calendar[0]?.date.getDay() ?? 0;
  const dateFormatter = new Intl.DateTimeFormat(english ? "en-US" : "zh-CN", { month: "short", day: "numeric" });
  const ringDegrees = remaining === null ? 0 : remaining * 3.6;

  return (
    <section className="usage-insights-panel" aria-label={english ? "Usage insights" : "用量洞察"} onMouseDown={(event) => event.stopPropagation()}>
      <header className="usage-insights-header">
        <div>
          <p><ChartLineUp weight="bold" />{english ? "LOCAL SIGNAL" : "本地信号"}</p>
          <h2>{snapshot.displayName} {english ? "usage rhythm" : "用量节奏"}</h2>
          <small>{english ? "Provider quota + local observations" : "平台额度 + 本地观测"}</small>
        </div>
        {onClose ? <button type="button" onClick={onClose} aria-label={english ? "Close usage insights" : "关闭用量洞察"}><X /></button> : null}
      </header>

      <div className="usage-insights-top">
        <article className="usage-ring-card">
          <div className="usage-ring" style={{ "--usage-ring": `${ringDegrees}deg` } as CSSProperties}>
            <div><strong>{percent(remaining, 0)}</strong><span>{english ? "remaining" : "剩余"}</span></div>
          </div>
          <p>{primaryWindow ? formatResetTime(primaryWindow.window.resetsAt, now, language) : english ? "Percentage quota unavailable" : "暂无百分比额度"}</p>
        </article>

        <article className="usage-trend-card">
          <header><span>{english ? "24H QUOTA TRAJECTORY" : "24 小时额度轨迹"}</span><strong>{trend.length > 1 ? `${Math.max(0, trend[0].remainingPercent - trend.at(-1)!.remainingPercent).toFixed(1)}%` : "—"}</strong></header>
          <svg viewBox="0 0 220 74" preserveAspectRatio="none" role="img" aria-label={english ? "Remaining quota trajectory" : "剩余额度轨迹"}>
            <defs><linearGradient id="usage-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="currentColor" stopOpacity=".24" /><stop offset="1" stopColor="currentColor" stopOpacity="0" /></linearGradient></defs>
            <path className="usage-trend-grid" d="M 4 14 H 216 M 4 42 H 216 M 4 70 H 216" />
            {geometry ? <><path className="usage-trend-area" d={geometry.area} /><path className="usage-trend-line" d={geometry.line} /></> : null}
          </svg>
          <footer><span>{english ? "24h ago" : "24 小时前"}</span><span>{english ? "now" : "现在"}</span></footer>
        </article>
      </div>

      <article className="usage-target-card">
        <header><span><Target weight="duotone" />{english ? "Pace targets" : "用量目标"}</span><small>{pace?.status === "over_pace" ? (english ? "Over guide" : "高于建议") : (english ? "Observed locally" : "本地观测")}</small></header>
        <div className="usage-target-row">
          <div><strong>{english ? "Today" : "今日"}</strong><span>{percent(summary.todayUsedPercent)} {english ? "observed" : "已观测"}</span></div>
          <div className="usage-target-track"><i style={{ width: `${todayRatio}%` }} /></div>
          <b>{guide === null ? "—" : english ? `${percent(guide)} guide` : `建议 ${percent(guide)}`}</b>
        </div>
        <div className="usage-target-row">
          <div><strong>{english ? "Current cycle" : "当前周期"}</strong><span>{percent(cycleUsed)} {english ? "used" : "已用"}</span></div>
          <div className="usage-target-track"><i style={{ width: `${cycleUsed ?? 0}%` }} /></div>
          <b>{remaining === null ? "—" : `${percent(remaining, 0)} ${english ? "left" : "剩余"}`}</b>
        </div>
      </article>

      <article className="usage-calendar-card">
        <header>
          <span><CalendarDots weight="duotone" />{english ? "Last 90 days" : "近 90 天"}</span>
          <small>{english ? `${summary.activeDays} active days · ${percent(summary.averageActiveDayPercent)} avg` : `${summary.activeDays} 个活跃日 · 日均 ${percent(summary.averageActiveDayPercent)}`}</small>
        </header>
        <div className="usage-calendar-body">
          <div className="usage-weekdays" aria-hidden="true"><span>{english ? "M" : "一"}</span><span>{english ? "W" : "三"}</span><span>{english ? "F" : "五"}</span><span>{english ? "S" : "日"}</span></div>
          <div className="usage-calendar-grid" role="img" aria-label={english ? "90 day observed usage heatmap" : "90 天已观测用量热力图"}>
            {Array.from({ length: leadingCells }, (_, index) => <i className="usage-day usage-day--spacer" key={`spacer-${index}`} />)}
            {calendar.map((day) => (
              <i
                className={`usage-day usage-day--${day.level}${day.observedUsedPercent === null ? " usage-day--unknown" : ""}`}
                key={day.localDate}
                title={`${dateFormatter.format(day.date)} · ${day.observedUsedPercent === null ? (english ? "no local sample" : "无本地样本") : percent(day.observedUsedPercent)}`}
              />
            ))}
          </div>
          <div className="usage-calendar-legend" aria-hidden="true"><span>{english ? "less" : "少"}</span>{[0, 1, 2, 3, 4].map((level) => <i className={`usage-day usage-day--${level}`} key={level} />)}<span>{english ? "more" : "多"}</span></div>
        </div>
      </article>
      <footer className="usage-insights-footnote">{english ? "Local history only · no prompt or token content is collected" : "仅使用本地历史 · 不收集提示词或 token 内容"}</footer>
    </section>
  );
}

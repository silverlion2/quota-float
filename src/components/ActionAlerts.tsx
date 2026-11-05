import { useId, useState } from "react";
import { actionAlertSnoozed, type ActionAlert } from "../lib/actionAlerts";
import type { ActionAlertRecord } from "../lib/actionAlertLifecycle";
import type { Language } from "../types";
import "./action-alerts.css";

interface ActionAlertsProps {
  alerts: ActionAlert[];
  language: Language;
  snoozes?: Record<string, string>;
  now: Date;
  onAction: (alert: ActionAlert) => void;
  onSnooze: (alert: ActionAlert) => void;
  onResume?: (alert: ActionAlert) => void;
  onRefresh: () => void;
  history?: ActionAlertRecord[];
}
type Filter = "all" | "expiry" | "quota" | "later";

export function ActionAlerts({ alerts, language, snoozes = {}, now, onAction, onSnooze, onResume, onRefresh, history = [] }: ActionAlertsProps) {
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const queueId = useId();
  const en = language === "en";
  const text = (english: string, chinese: string) => en ? english : chinese;
  const snoozed = (alert: ActionAlert) => actionAlertSnoozed(alert, snoozes, now);
  const priority = { critical: 0, warning: 1, notice: 2 };
  const ordered = [...alerts].sort((a, b) => Number(snoozed(a)) - Number(snoozed(b)) || priority[a.severity] - priority[b.severity]
    || (a.deadline ? Date.parse(a.deadline) : Infinity) - (b.deadline ? Date.parse(b.deadline) : Infinity));
  const active = ordered.filter((alert) => !snoozed(alert));
  const urgent = active.filter((alert) => alert.severity === "critical").length;
  const closed = history.filter((record) => record.status !== "active")
    .sort((a, b) => Date.parse(b.closedAt || b.lastSeenAt) - Date.parse(a.closedAt || a.lastSeenAt)).slice(0, 20);
  const date = (value: string) => Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat(en ? "en-US" : "zh-CN", {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "short",
  }).format(new Date(value)) : text("Time unavailable", "时间未知");
  const category = (kind: ActionAlert["kind"]) => kind === "quota-reset-unused" ? text("Quota reset", "额度重置")
    : kind === "low-quota" ? text("Low quota", "额度不足") : kind === "signed-out" ? text("Sign-in needed", "需要登录") : text("Expiry reminder", "到期提醒");
  const urgency = (alert: ActionAlert) => {
    if (!alert.deadline || !Number.isFinite(Date.parse(alert.deadline))) return text(alert.severity === "critical" ? "Urgent" : "Pending", alert.severity === "critical" ? "紧急" : "待处理");
    const left = Date.parse(alert.deadline) - now.getTime();
    if (left <= 0) return text("Time reached · refresh", "已到记录时间 · 请刷新");
    const minutes = Math.floor(left / 60_000);
    if (minutes < 1) return text("Less than 1m left", "剩余不足 1 分钟");
    if (minutes < 60) return text(`${minutes}m left`, `剩余 ${minutes} 分钟`);
    if (minutes < 1440) return text(`${Math.floor(minutes / 60)}h left`, `剩余 ${Math.floor(minutes / 60)} 小时`);
    return text(`${Math.floor(minutes / 1440)}d left`, `剩余 ${Math.floor(minutes / 1440)} 天`);
  };
  if (!alerts.length && !closed.length) return null;

  const row = (alert: ActionAlert) => {
    const paused = snoozed(alert);
    return <article className={`action-alerts__item action-alerts__item--${alert.severity}${paused ? " is-snoozed" : ""}`} key={alert.id}>
      <div className="action-alerts__meta"><span>{alert.provider} / {category(alert.kind)}</span><span className="action-alerts__urgency">{paused ? text("Later", "稍后") : urgency(alert)}</span></div>
      <div className="action-alerts__title"><span className="action-alerts__dot" aria-hidden="true" /><strong>{alert.title}</strong></div>
      {alert.amountLabel ? <strong className="action-alerts__amount">{alert.amountLabel}</strong> : null}
      {alert.deadline && Number.isFinite(Date.parse(alert.deadline)) ? <time className="action-alerts__deadline" dateTime={alert.deadline}>{date(alert.deadline)}</time> : null}
      {paused ? <p className="action-alerts__paused">{text("Snoozed until ", "稍后提醒至 ")}<time dateTime={snoozes[alert.id]}>{date(snoozes[alert.id])}</time></p> : null}
      <div className="action-alerts__actions">
        <button className="action-alerts__primary" type="button" onClick={() => onAction(alert)}>{alert.actionLabel}</button>
        {paused ? onResume ? <button type="button" onClick={() => onResume(alert)}>{text("Resume now", "立即恢复")}</button> : null
          : <button type="button" onClick={() => onSnooze(alert)}>{text("Remind later (up to 15m)", "稍后提醒（最多15分钟）")}</button>}
      </div>
      <details className="action-alerts__evidence"><summary>{text("Why this reminder", "提醒依据")}</summary><p>{alert.detail}</p>{alert.evidenceLabel ? <p>{alert.evidenceLabel}</p> : null}</details>
    </article>;
  };
  const filtered = ordered.filter((alert) => filter === "all" || (filter === "later" ? snoozed(alert) : filter === "expiry" ? alert.kind.includes("expiry") : alert.kind === "low-quota" || alert.kind === "quota-reset-unused"));

  return <section className="action-alerts" aria-label={text("Action reminders", "待办提醒")} onMouseDown={(event) => event.stopPropagation()}>
    <div className="action-alerts__heading">
      <span>{text("Action reminders", "待办提醒")} <small>{en ? `${active.length} active · ${alerts.length} total` : `${active.length} 条待处理 · 共 ${alerts.length} 条`}</small></span>
      {alerts.length ? <button type="button" aria-expanded={expanded} aria-controls={queueId} onClick={() => setExpanded(!expanded)}>{expanded ? text("Collapse", "收起") : text("View all", "查看全部")} <span aria-hidden="true">{expanded ? "−" : "+"}</span></button> : null}
    </div>
    {alerts.length ? <div className="action-alerts__summary" aria-label={text("Reminder summary", "提醒摘要")}><span className={urgent ? "has-urgent" : ""}><b>{urgent}</b> {text("Urgent", "紧急")}</span><span><b>{active.length - urgent}</b> {text("Pending", "待处理")}</span><span><b>{alerts.length - active.length}</b> {text("Later", "稍后")}</span></div> : null}
    {expanded ? <>
      <div className="action-alerts__filters" role="group" aria-label={text("Filter reminders", "筛选提醒")}>{([ ["all", text("All", "全部")], ["expiry", text("Expiry", "到期")], ["quota", text("Quota", "额度")], ["later", text("Later", "稍后")] ] as [Filter, string][]).map(([value, label]) => <button type="button" key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div>
      <div id={queueId} className="action-alerts__queue" tabIndex={0} aria-label={text("All reminders", "全部提醒")}>{filtered.length ? filtered.map(row) : <p>{text("No reminders in this category.", "此分类暂无提醒。")}</p>}</div>
    </> : active[0] ? <><div className="action-alerts__next">{text("NEXT ACTION", "优先处理")}</div>{row(active[0])}</> : <p className="action-alerts__all-paused">{alerts.length ? text("All reminders snoozed. View all for resume times.", "全部提醒已暂缓，展开可查看恢复时间。") : text("No active reminders. Past records remain available below.", "当前没有待处理提醒，可在下方回看本地记录。")}</p>}
    {closed.length ? <details className="action-alerts__history"><summary>{text("Local history", "本地回看")} <span>{closed.length}</span></summary><div className="action-alerts__history-list">{closed.map((record) => <article key={record.key}><strong>{record.provider} · {category(record.kind)}</strong><p>{record.status === "deadline-passed" ? text("Recorded time passed; usage still needs checking.", "已过记录时间，是否使用待核对。") : text("No longer meets reminder conditions after refresh.", "刷新后已不再满足提醒条件。")}</p>{record.deadline ? <time dateTime={record.deadline}>{date(record.deadline)}</time> : null}<details><summary>{text("Recorded context", "当时依据")}</summary><p>{record.detail}</p><p>{text("Last observed: ", "最后观察：")}{date(record.lastSeenAt)}</p></details></article>)}</div></details> : null}
    <div className="action-alerts__footer"><button type="button" onClick={onRefresh}>{text("Action taken · refresh to confirm", "已操作，刷新确认")}</button></div>
  </section>;
}

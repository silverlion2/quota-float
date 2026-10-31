import { useId, useState } from "react";
import { actionAlertSnoozed, type ActionAlert } from "../lib/actionAlerts";
import type { Language } from "../types";
import "./action-alerts.css";

interface ActionAlertsProps {
  alerts: ActionAlert[];
  language: Language;
  snoozes?: Record<string, string>;
  now: Date;
  onAction: (alert: ActionAlert) => void;
  onSnooze: (alert: ActionAlert) => void;
  onRefresh: () => void;
}

export function ActionAlerts({ alerts, language, snoozes = {}, now, onAction, onSnooze, onRefresh }: ActionAlertsProps) {
  const [expanded, setExpanded] = useState(false);
  const queueId = useId();
  const en = language === "en";
  const snoozed = (alert: ActionAlert) => actionAlertSnoozed(alert, snoozes, now);
  const priority = { critical: 0, warning: 1, notice: 2 };
  const ordered = [...alerts].sort((a, b) => priority[a.severity] - priority[b.severity]
    || (a.deadline ? Date.parse(a.deadline) : Infinity) - (b.deadline ? Date.parse(b.deadline) : Infinity));
  const active = ordered.filter((alert) => !snoozed(alert));
  const date = (value: string) => new Intl.DateTimeFormat(en ? "en-US" : "zh-CN", {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "short",
  }).format(new Date(value));
  if (!alerts.length) return null;

  const row = (alert: ActionAlert) => {
    const paused = snoozed(alert);
    return <article className={`action-alerts__item action-alerts__item--${alert.severity}${paused ? " is-snoozed" : ""}`} key={alert.id}>
      <div className="action-alerts__title"><span className="action-alerts__dot" aria-hidden="true" /><strong>{alert.title}</strong></div>
      <p>{alert.detail}</p>
      {alert.deadline && Number.isFinite(Date.parse(alert.deadline)) ? <time className="action-alerts__deadline" dateTime={alert.deadline}>{date(alert.deadline)}</time> : null}
      {paused ? <p className="action-alerts__paused">{en ? "Snoozed until " : "稍后提醒至 "}<time dateTime={snoozes[alert.id]}>{date(snoozes[alert.id])}</time></p> : null}
      <div className="action-alerts__actions">
        <button className="action-alerts__primary" type="button" onClick={() => onAction(alert)}>{alert.actionLabel}</button>
        {!paused ? <button type="button" onClick={() => onSnooze(alert)}>{en ? "Remind later (up to 15m)" : "稍后提醒（最多15分钟）"}</button> : null}
      </div>
    </article>;
  };

  return <section className="action-alerts" aria-label={en ? "Action reminders" : "待办提醒"} onMouseDown={(event) => event.stopPropagation()}>
    <div className="action-alerts__heading">
      <span>{en ? "Action reminders" : "待办提醒"} <small>{en ? `${active.length} active · ${alerts.length} total` : `${active.length} 条待处理 · 共 ${alerts.length} 条`}</small></span>
      <button type="button" aria-expanded={expanded} aria-controls={queueId} onClick={() => setExpanded(!expanded)}>{expanded ? (en ? "Collapse" : "收起") : (en ? "View all" : "查看全部")} <span aria-hidden="true">{expanded ? "−" : "+"}</span></button>
    </div>
    {expanded ? <div id={queueId} className="action-alerts__queue" tabIndex={0} aria-label={en ? "All reminders" : "全部提醒"}>{ordered.map(row)}</div>
      : active[0] ? row(active[0]) : <p className="action-alerts__all-paused">{en ? "All reminders snoozed. View all for resume times." : "全部提醒已暂缓，展开可查看恢复时间。"}</p>}
    <div className="action-alerts__footer"><button type="button" onClick={onRefresh}>{en ? "Action taken · refresh to confirm" : "已操作，刷新确认"}</button></div>
  </section>;
}

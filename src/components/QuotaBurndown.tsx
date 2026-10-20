import type { Language } from "../types";
import type { ResetConsumptionPlan } from "../lib/resetConsumptionPlan";
import { formatDateTime } from "../lib/format";
import { QuotaHistoryCurve } from "./QuotaHistoryCurve";
import "./QuotaBurndown.css";

interface Props {
  plan: ResetConsumptionPlan | null;
  resetsAt: string;
  language: Language;
}

export function QuotaBurndown({ plan, resetsAt, language }: Props) {
  if (!plan?.points.length) return null;
  const en = language === "en";
  const title = en ? "Personal weekly burndown" : "个人周额度消耗曲线";
  const { points } = plan;
  const resetAt = Date.parse(resetsAt);
  const first = points[0];
  const latest = points.at(-1)!;
  const duration = Date.parse(latest.capturedAt) - Date.parse(first.capturedAt);
  const date = (time: string) => formatDateTime(time, language);
  return <section className="quota-burndown" aria-label={title}>
    <h4>{title}</h4>
    <QuotaHistoryCurve points={points} language={language} variant="insights"
      now={new Date(latest.capturedAt)} hours={Math.max(1, duration) / 3600000}
      ariaLabel={`${title}: ←/→, Home/End`}
      referenceGuide={{ startPercent: first.remainingPercent,
        endPercent: first.remainingPercent * (1 - duration / (resetAt - Date.parse(first.capturedAt))) }} />
    <p className="reset-outlook-note">{date(first.capturedAt)} – {date(latest.capturedAt)}<br />{en ? "Personal reset" : "个人重置"} · {date(resetsAt)}</p>
    <p className="reset-outlook-note">{en ? "Solid: last ≤6h recorded. Dashed: even use to 0% at personal reset, not a forecast." : "实线：最近≤6小时采样。虚线：至个人重置时归零的均匀消耗，非预测。"}</p>
  </section>;
}

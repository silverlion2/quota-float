import type { Language } from "../types";
import type { UsageBreakdownDimension, UsageBreakdownRow } from "../lib/tokenUsage";

interface Props {
  rows: UsageBreakdownRow[];
  dimension: UsageBreakdownDimension;
  onDimension: (dimension: UsageBreakdownDimension) => void;
  metric: "token" | "cost";
  language: Language;
}

export function UsageBreakdown({ rows, dimension, onDimension, metric, language }: Props) {
  const en = language === "en";
  const sorted = [...rows].sort((a, b) => (metric === "cost" ? b.knownCostUsd - a.knownCostUsd : b.totalTokens - a.totalTokens) || a.key.localeCompare(b.key));
  const compact = (value: number) => new Intl.NumberFormat(en ? "en-US" : "zh-CN", { notation: "compact", maximumFractionDigits: 1 }).format(value);
  return <section className="usage-breakdown" aria-label={en ? "Project and terminal distribution" : "项目与终端分布"}>
    <header className="usage-chart-controls">
      <strong>{en ? "Where usage goes" : "用量花在哪里"}</strong>
      <div role="group" aria-label={en ? "Distribution dimension" : "分布维度"}>
        {(["project", "terminal"] as const).map((value) => <button key={value} type="button" className={dimension === value ? "is-active" : ""} aria-pressed={dimension === value} onClick={() => onDimension(value)}>{value === "project" ? en ? "Projects" : "项目" : en ? "Terminals" : "终端"}</button>)}
      </div>
    </header>
    <p>{en ? `Top ${Math.min(8, rows.length)} of ${rows.length} · current range and filters · ${metric === "cost" ? "API equivalent" : "Token"}` : `前 ${Math.min(8, rows.length)} / ${rows.length} 项 · 当前区间与筛选 · ${metric === "cost" ? "API 等价费用" : "Token"}`}</p>
    {sorted.length ? <ol>{sorted.slice(0, 8).map((row) => {
      const share = metric === "cost" ? row.costShare : row.tokenShare;
      return <li key={row.key}>
        <div><span>{row.label === "Unknown" ? en ? "Unknown" : "未知" : row.label === "Other" ? en ? "Other" : "其他" : row.label}</span><strong>{metric === "token" ? compact(row.totalTokens) : row.costUsd === null ? en ? "Unpriced / partial" : "未定价 / 部分费用" : `$${row.costUsd.toFixed(2)}`}</strong><small>{share === null ? "—" : `${Math.round(share * 100)}%`}</small></div>
        {share !== null ? <progress aria-label={row.label} max={100} value={share * 100} /> : null}
      </li>;
    })}</ol> : <p>{en ? "No records in this selection." : "当前选择没有记录。"}</p>}
    {metric === "cost" && rows.some((row) => row.costShare === null) ? <p>{en ? "Unknown pricing: cost shares are unavailable." : "存在未知价格，暂不计算费用占比。"}</p> : null}
  </section>;
}

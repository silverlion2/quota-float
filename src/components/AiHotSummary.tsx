import type { AiHotCreditsReport, AiHotReport } from "../lib/aihot";
import type { AiHotSignal } from "../lib/aihotIntegration";
import type { Language, ProviderId } from "../types";
import "./aihot-summary.css";

export function AiHotSummary({ enabled, signals, report, credits, provider, loading, language, onOpen }: {
  enabled: boolean; signals: AiHotSignal[]; report: AiHotReport | null; credits: AiHotCreditsReport | null;
  provider: ProviderId; loading: boolean; language: Language; onOpen: () => void;
}) {
  const en = language === "en";
  const unread = signals.filter(signal => signal.unread);
  const relevant = unread.filter(signal => signal.provider === provider);
  const latest = relevant[0] ?? unread[0];
  const stale = report?.sources.some(source => source.status !== "healthy");
  return <section className="aihot-summary" aria-label={en ? "AIHOT linked updates" : "AIHOT 平台动态"}>
    <div><strong>AIHOT</strong><span>{!enabled ? (en ? "Connect public updates" : "关联公开额度动态")
      : loading ? (en ? "Checking public sources…" : "正在检查公开来源…")
      : unread.length ? (en ? `${unread.length} unread · ${relevant.length} for this provider` : `${unread.length} 条未读 · 当前平台 ${relevant.length} 条`)
      : en ? "No new updates for enabled providers" : "已启用平台暂无新动态"}</span></div>
    {latest ? <p><strong>{latest.status === "confirmed" ? (en ? "Source-confirmed public report" : "来源已确认的公开报道") : (en ? "Unconfirmed announcement" : "未确认公告")}</strong> · {latest.event.title}</p> : <p>{en ? "Reset reports and free-credit offers, alongside your quota." : "在额度旁查看重置公告与免费额度活动。"}</p>}
    <footer><small>{enabled && stale ? (en ? "Some sources are unavailable or stale" : "部分来源不可用或已过期")
      : credits ? (en ? `${credits.offers.length} public credit offers · check eligibility` : `${credits.offers.length} 项公开额度活动 · 以适用条件为准`)
      : en ? "Public reports do not confirm your account reset" : "公开公告不代表你的账户已重置"}</small>
    <button type="button" onClick={onOpen}>{en ? "View AIHOT" : "查看 AIHOT"}</button></footer>
  </section>;
}

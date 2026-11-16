import { ArrowClockwise, ArrowSquareOut } from "@phosphor-icons/react";
import { useRef, useState, useEffect } from "react";
import { AIHOT_CREDITS_URL, AIHOT_PROVIDERS, type AiHotEventStatus, type AiHotProvider, type AiHotReport } from "../lib/aihot";
import { fetchAiHotResets, openExternalUrl, usesSyntheticData } from "../lib/bridge";
import type { Language } from "../types";

export function AiHotPanel({ language }: { language: Language }) {
  const zh = language !== "en";
  const [report, setReport] = useState<AiHotReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [linkFailed, setLinkFailed] = useState(false);
  const [provider, setProvider] = useState<AiHotProvider | "all">("all");
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const labels = zh ? {
    title: "AIHOT 额度动态", hint: "公开重置消息与免费额度活动。适用范围以来源为准；个人余额和重置时间仍以平台账户数据为准。",
    load: "加载公开消息", refresh: "刷新消息", loading: "正在检查公开来源…", cache: "按需访问 AIHOT，不发送账户或额度数据；请求至少间隔 10 分钟，期间显示缓存。",
    failed: "检查失败，保留上次消息，请稍后重试。", all: "全部", source: "查看来源", scan: "来源核验", unknown: "未知", reported: "确认报道时间",
    empty: "来源当前没有返回消息。", healthy: "已获取", stale: "旧数据 · 暂未更新", unavailable: "暂不可用", scope: "适用范围未说明", reportUpdated: "消息更新时间",
    credits: "免费额度活动", creditsHint: "在 AIHOT 查看可领取的 AI 额度、条件与有效期。领取及账户操作在对应网站完成。",
    openCredits: "查看免费额度", linkFailed: "无法打开来源，请稍后重试。", preview: "合成预览数据", initial: "点击加载以查看公开消息。",
  } : {
    title: "AIHOT quota radar", hint: "Public reset reports and free-credit offers. Eligibility depends on the source; your personal balance and reset time still come from your provider account.",
    load: "Load public reports", refresh: "Refresh reports", loading: "Checking public sources…", cache: "Contacts AIHOT on demand without account or quota data. Requests are at least 10 minutes apart; cached reports appear between checks.",
    failed: "Check failed. Previous reports are retained; please retry later.", all: "All", source: "View source", scan: "Source verified", unknown: "Unknown", reported: "Confirmation reported",
    empty: "The source returned no reports.", healthy: "Retrieved", stale: "Older data · not refreshed", unavailable: "Unavailable", scope: "Eligibility not specified", reportUpdated: "Report updated",
    credits: "Free-credit offers", creditsHint: "Browse AI credit offers, eligibility and expiry on AIHOT. Claims and account actions happen on the relevant website.",
    openCredits: "Browse free credits", linkFailed: "Could not open the source. Please retry.", preview: "Synthetic preview data", initial: "Load public reports to begin.",
  };
  const statuses: Record<AiHotEventStatus, string> = zh
    ? { announced: "已公告", in_progress: "进行中", confirmed: "来源已确认", expired_unconfirmed: "已过期 · 未确认", likely_completed: "可能完成 · 未确认" }
    : { announced: "Announced", in_progress: "In progress", confirmed: "Source confirmed", expired_unconfirmed: "Expired · unconfirmed", likely_completed: "Likely completed · unconfirmed" };
  const date = (value: string | null) => value && Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleString(zh ? "zh-CN" : "en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : labels.unknown;
  const load = async () => {
    if (pending.current) return;
    pending.current = true;
    setLoading(true);
    setFailed(false);
    try { const next = await fetchAiHotResets(); if (mounted.current) setReport(next); }
    catch { if (mounted.current) setFailed(true); }
    finally { pending.current = false; if (mounted.current) setLoading(false); }
  };
  const open = (url: string) => {
    setLinkFailed(false);
    void openExternalUrl(url).catch(() => { if (mounted.current) setLinkFailed(true); });
  };
  return <section className="codex-extensions aihot-panel" aria-label={labels.title}>
    <div className="control-section-title"><span>{labels.title}</span><button type="button" onClick={() => void load()} disabled={loading}><ArrowClockwise />{report ? labels.refresh : labels.load}</button></div>
    <p className="extensions-note">{labels.hint}</p>
    <p className="extensions-note">{labels.cache}</p>
    {usesSyntheticData() ? <p className="extensions-note">{labels.preview}</p> : null}
    <div className="control-section-title"><span>{labels.credits}</span><button type="button" onClick={() => open(AIHOT_CREDITS_URL)}><ArrowSquareOut />{labels.openCredits}</button></div>
    <p className="extensions-note">{labels.creditsHint}</p>
    {report ? <label className="control-field"><span>{zh ? "平台" : "Provider"}</span><select value={provider} onChange={(event) => setProvider(event.target.value as typeof provider)}><option value="all">{labels.all}</option>{Object.entries(AIHOT_PROVIDERS).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label> : null}
    <p role="status" aria-live="polite" className="extensions-note">{loading ? labels.loading : failed ? labels.failed : !report ? labels.initial : null}</p>
    <div className="provider-health-list" aria-busy={loading}>
      {report?.sources.filter((source) => provider === "all" || source.provider === provider).map((source) => <article key={source.provider} className="provider-health-item">
        <i aria-hidden="true" /><div className="provider-health-copy">
          <header><strong>{AIHOT_PROVIDERS[source.provider]}</strong><span>{labels[source.status]}</span></header>
          <p className="provider-health-guidance">{labels.scan}: {date(source.updatedAt)}</p>
          {source.events.map((event) => <div className="aihot-event" key={event.id}>
            <p className="provider-health-guidance"><strong>{event.title}</strong></p>
            <p className="provider-health-guidance">{labels.reportUpdated}: {date(event.updatedAt)}</p>
            <p className="provider-health-guidance">{statuses[event.status]} · {event.scope || labels.scope}</p>
            {event.status === "confirmed" && event.reportedAt ? <p className="provider-health-guidance">{labels.reported}: {date(event.reportedAt)}</p> : null}
          </div>)}
          {!source.events.length ? <p className="provider-health-guidance">{source.status === "healthy" ? labels.empty : labels.unavailable}</p> : null}
          <div className="control-section-title"><button type="button" onClick={() => open(source.sourceUrl)} aria-label={`${labels.source}: ${AIHOT_PROVIDERS[source.provider]}`}><ArrowSquareOut />{labels.source}</button></div>
        </div>
      </article>)}
    </div>
    {linkFailed ? <p className="extensions-note" role="alert">{labels.linkFailed}</p> : null}
  </section>;
}

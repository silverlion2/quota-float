import { ArrowClockwise, ArrowSquareOut } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { AIHOT_CREDITS_URL, AIHOT_PROVIDERS, type AiHotCreditsReport, type AiHotEventStatus, type AiHotProvider, type AiHotReport } from "../lib/aihot";
import { matchesAiHotCreditProvider } from "../lib/aihotIntegration";
import { openAiHotOffer, openExternalUrl, usesSyntheticData } from "../lib/bridge";
import type { Language, ProviderId } from "../types";
import "./aihot.css";

export interface AiHotPanelProps {
  language: Language;
  report: AiHotReport | null;
  credits: AiHotCreditsReport | null;
  loading: boolean;
  failed: boolean;
  onRefresh: () => void;
  enabledProviders: ProviderId[];
  integrationEnabled: boolean;
  onIntegrationEnabled: (enabled: boolean) => void;
  notificationsEnabled: boolean;
  onNotificationsEnabled: (enabled: boolean) => void;
  onMarkRead: () => void;
}

type Filter = "enabled" | "all" | AiHotProvider | `credit:${string}`;
export function AiHotPanel(props: AiHotPanelProps) {
  const { language, report, credits, loading, failed, onRefresh, enabledProviders, integrationEnabled, onIntegrationEnabled, notificationsEnabled, onNotificationsEnabled, onMarkRead } = props;
  const zh = language !== "en";
  const [view, setView] = useState<"reports" | "credits">("reports");
  const [reportProvider, setReportProvider] = useState<Filter>("enabled");
  const [creditProvider, setCreditProvider] = useState<Filter>("all");
  const provider = view === "reports" ? reportProvider : creditProvider;
  const setProvider = view === "reports" ? setReportProvider : setCreditProvider;
  const [linkFailed, setLinkFailed] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const mounted = useRef(true);
  const pendingLink = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const labels = zh ? {
    title: "AIHOT 公开动态", hint: "公开报道不代表个人额度到账；个人余额和重置时间仍以平台账户数据为准。平台筛选仅表示相关性，不代表领取资格。",
    load: "加载公开消息", refresh: "刷新消息", loading: "正在检查公开来源…", cache: "仅访问公开来源，不发送账户或额度数据。手动加载可独立使用；启用整合后定期检查，缓存期间不会重复请求。",
    failed: "部分检查失败。已有消息保留，请留意各来源状态并稍后重试。", all: "全部公开平台", enabled: "已启用平台", source: "查看来源", scan: "来源数据时间", checked: "最近检查", unknown: "未知", reported: "确认报道时间",
    empty: "来源当前没有返回消息。", healthy: "来源可用", stale: "旧数据 · 暂未更新", unavailable: "暂不可用", scope: "适用范围未说明", reportUpdated: "消息更新时间",
    credits: "免费额度目录", creditsHint: "来源列出的额度与条件，不计入个人余额。领取、登录和账户操作在对应平台完成。",
    openCredits: "AIHOT 完整目录", linkFailed: "无法打开链接。请刷新来源后重试。", preview: "合成预览数据", initial: "点击加载以查看公开消息。",
    reports: "重置动态", filter: "平台筛选", noMatch: "已选平台暂无相关公开信息。可查看全部平台；这不影响你的个人额度。", showAll: "查看全部公开平台",
    enabledTitle: "关联已启用平台并自动检查", enabledHint: "应用运行时每 15 分钟检查，显示提示与未读标记。", notifications: "来源已确认消息的桌面提醒", notificationsHint: "仅在开启整合后生效；不代表个人额度到账。", markRead: "标记消息已读",
    amount: "来源列出的额度", requirements: "领取条件", instructions: "领取方式", models: "适用模型", validity: "有效期说明", deadline: "明确截止时间", noDeadline: "来源未提供明确截止时间", verified: "来源核验", claim: "前往领取网站", expired: "已过截止时间", refreshFirst: "刷新来源后再打开领取网站", noClaim: "来源未提供领取链接", unspecified: "来源未说明", noOffers: "来源当前没有返回额度活动。",
  } : {
    title: "AIHOT public updates", hint: "Public reports do not confirm credits in your account; your personal balance and reset time still come from your provider account. Provider filters indicate relevance, not eligibility.",
    load: "Load public reports", refresh: "Refresh reports", loading: "Checking public sources…", cache: "Only public sources are contacted; no account or quota data is sent. Manual loading works independently. Enabling integration adds periodic checks with cached results between requests.",
    failed: "Some checks failed. Previous reports are retained; check each source status and retry later.", all: "All public providers", enabled: "Enabled platforms", source: "View source", scan: "Source data time", checked: "Last checked", unknown: "Unknown", reported: "Confirmation reported",
    empty: "The source returned no reports.", healthy: "Source available", stale: "Older data · not refreshed", unavailable: "Unavailable", scope: "Eligibility not specified", reportUpdated: "Report updated",
    credits: "Free-credit catalogue", creditsHint: "Source-listed credits and conditions are not part of your personal balance. Claims, sign-in and account actions happen on the relevant provider website.",
    openCredits: "Full AIHOT catalogue", linkFailed: "Could not open the link. Refresh the source and retry.", preview: "Synthetic preview data", initial: "Load public reports to begin.",
    reports: "Reset reports", filter: "Provider filter", noMatch: "No public information matches these platforms. Browse all providers; your personal quota is unaffected.", showAll: "Browse all public providers",
    enabledTitle: "Show public updates in quota views", enabledHint: "Check every 15 minutes while the app runs; show signals and unread markers.", notifications: "Desktop alerts for source-confirmed reports", notificationsHint: "Requires integration; does not confirm credits in your account.", markRead: "Mark reports read",
    amount: "Source-listed credits", requirements: "Eligibility", instructions: "How to claim", models: "Models", validity: "Validity terms", deadline: "Explicit deadline", noDeadline: "No explicit deadline supplied by the source", verified: "Source verification", claim: "Open claim website", expired: "Past the stated deadline", refreshFirst: "Refresh the source before opening a claim website", noClaim: "No claim link supplied by the source", unspecified: "Not specified by the source", noOffers: "The source returned no credit offers.",
  };
  const statuses: Record<AiHotEventStatus, string> = zh
    ? { announced: "已公告", in_progress: "进行中", confirmed: "来源已确认", expired_unconfirmed: "已过期 · 未确认", likely_completed: "可能完成 · 未确认" }
    : { announced: "Announced", in_progress: "In progress", confirmed: "Source confirmed", expired_unconfirmed: "Expired · unconfirmed", likely_completed: "Likely completed · unconfirmed" };
  const categories = zh ? { daily: "每日", weekly: "每周", monthly: "每月", other: "其他" } : { daily: "Daily", weekly: "Weekly", monthly: "Monthly", other: "Other" };
  const date = (value: string | null) => value && Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleString(zh ? "zh-CN" : "en", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : labels.unknown;
  const open = async (action: () => Promise<void>, key: string) => {
    if (pendingLink.current) return;
    pendingLink.current = true;
    setLinkFailed(false); setOpening(key);
    try { await action(); }
    catch { if (mounted.current) setLinkFailed(true); }
    finally { pendingLink.current = false; if (mounted.current) setOpening(null); }
  };
  const openSource = (url: string) => { void open(() => openExternalUrl(url), url); };
  const sources = report?.sources.filter((source) => provider === "all" || (provider === "enabled" ? enabledProviders.includes(source.provider as ProviderId) : source.provider === provider)) ?? [];
  const offers = credits?.offers.filter((offer) => provider === "all" || (provider.startsWith("credit:") ? offer.provider === provider.slice(7) : matchesAiHotCreditProvider(offer.provider, provider === "enabled" ? enabledProviders : [provider as ProviderId]))) ?? [];
  const creditProviders = [...new Set(credits?.offers.map(offer => offer.provider) ?? [])].sort();
  const noMatch = view === "reports" ? report && !sources.length : credits && credits.offers.length > 0 && !offers.length;
  return <section className="codex-extensions aihot-panel" aria-label={labels.title}>
    <div className="aihot-toolbar"><h3>{labels.title}</h3><button type="button" className="aihot-action" onClick={onRefresh} disabled={loading}><ArrowClockwise />{report || credits ? labels.refresh : labels.load}</button></div>
    <p className="aihot-boundary">{labels.hint}</p>
    <details className="aihot-preferences"><summary>{zh ? "关联与提醒设置" : "Integration and alerts"}<span>{integrationEnabled ? (zh ? "已开启" : "On") : (zh ? "未开启" : "Off")}</span></summary><div className="aihot-settings">
      <label><input type="checkbox" checked={integrationEnabled} onChange={(event) => onIntegrationEnabled(event.target.checked)} /><span>{labels.enabledTitle}<small>{labels.enabledHint}</small></span></label>
      <label><input type="checkbox" checked={notificationsEnabled} disabled={!integrationEnabled} onChange={(event) => onNotificationsEnabled(event.target.checked)} /><span>{labels.notifications}<small>{labels.notificationsHint}</small></span></label>
    </div>
    <p className="aihot-note">{labels.cache}</p></details>
    {usesSyntheticData() ? <p className="aihot-note">{labels.preview}</p> : null}
    <div className="aihot-tabs" role="group" aria-label={zh ? "公开信息类型" : "Public information type"}>
      <button type="button" aria-pressed={view === "reports"} onClick={() => setView("reports")}>{labels.reports}</button>
      <button type="button" aria-pressed={view === "credits"} onClick={() => setView("credits")}>{labels.credits}</button>
    </div>
    <div className="aihot-filter-row"><label className="control-field"><span>{labels.filter}</span><select value={provider} onChange={(event) => setProvider(event.target.value as Filter)}><option value="enabled">{labels.enabled}</option><option value="all">{labels.all}</option>{view === "credits" ? creditProviders.map(name => <option key={name} value={`credit:${name}`}>{name}</option>) : Object.entries(AIHOT_PROVIDERS).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <button type="button" className="aihot-action" onClick={onMarkRead} disabled={!report}>{labels.markRead}</button></div>
    <p role="status" aria-live="polite" className="aihot-note">{loading ? labels.loading : failed ? labels.failed : !report && !credits ? labels.initial : null}</p>
    {linkFailed ? <p className="aihot-note" role="alert">{labels.linkFailed}</p> : null}
    {noMatch ? <div className="aihot-empty"><p>{labels.noMatch}</p><button type="button" className="aihot-action" onClick={() => setProvider("all")}>{labels.showAll}</button></div> : null}
    {view === "reports" ? <div className="provider-health-list" aria-busy={loading}>
      {report ? <p className="aihot-note">{labels.checked}: {date(report.checkedAt)}</p> : null}
      {sources.map((source) => <article key={source.provider} className={`provider-health-item provider-health-item--${source.status === "healthy" ? "ok" : source.status}`}>
        <i aria-hidden="true" /><div className="provider-health-copy">
          <header><strong>{AIHOT_PROVIDERS[source.provider]}</strong><span>{labels[source.status]}</span></header>
          <p className="provider-health-guidance">{labels.scan}: {date(source.updatedAt)}</p>
          {source.events.map((event) => <div className="aihot-event" key={event.id}>
            <p><strong>{event.title}</strong></p><p>{labels.reportUpdated}: {date(event.updatedAt)}</p>
            <p>{statuses[event.status]} · {event.scope || labels.scope}</p>
            {event.status === "confirmed" && event.reportedAt ? <p>{labels.reported}: {date(event.reportedAt)}</p> : null}
            <button type="button" className="aihot-action" onClick={() => openSource(event.url)} aria-label={`${labels.source}: ${event.title}`}><ArrowSquareOut />{labels.source}</button>
          </div>)}
          {!source.events.length ? <p className="provider-health-guidance">{source.status === "healthy" ? labels.empty : labels.unavailable}</p> : null}
          {!source.events.length ? <button type="button" className="aihot-action" onClick={() => openSource(source.sourceUrl)} aria-label={`${labels.source}: ${AIHOT_PROVIDERS[source.provider]}`}><ArrowSquareOut />{labels.source}</button> : null}
        </div>
      </article>)}
    </div> : <div className="aihot-credits" aria-busy={loading}>
      <p className="aihot-note">{labels.creditsHint}</p>
      <button type="button" className="aihot-action" onClick={() => openSource(AIHOT_CREDITS_URL)}><ArrowSquareOut />{labels.openCredits}</button>
      {credits ? <div className={`aihot-source-status aihot-source-status--${credits.status}`}><strong>{labels[credits.status]}</strong><span>{labels.scan}: {date(credits.updatedAt)}</span><span>{labels.checked}: {date(credits.checkedAt)}</span></div> : null}
      {credits && !credits.offers.length ? <p className="aihot-note">{credits.status === "healthy" ? labels.noOffers : labels.unavailable}</p> : null}
      {offers.map((offer) => {
        const expired = !!offer.deadlineAt && Date.parse(offer.deadlineAt) <= Date.now();
        const blocked = expired ? labels.expired : credits?.status !== "healthy" ? labels.refreshFirst : !offer.claimUrl ? labels.noClaim : null;
        return <article className="aihot-credit" key={offer.id} aria-label={offer.title}>
          <header><strong>{offer.title}</strong><span>{categories[offer.category]}</span></header>
          <p className="aihot-credit-provider">{offer.provider}</p>
          <dl><div><dt>{labels.amount}</dt><dd>{offer.amount || labels.unspecified}</dd></div>
            <div><dt>{labels.requirements}</dt><dd>{offer.requirements || (zh ? "适用条件未说明" : "Eligibility not specified")}</dd></div>
            <div><dt>{labels.instructions}</dt><dd>{offer.instructions || labels.unspecified}</dd></div>
            <div><dt>{labels.models}</dt><dd>{offer.models || labels.unspecified}</dd></div>
            {offer.validity ? <div><dt>{labels.validity}</dt><dd>{offer.validity}</dd></div> : null}
            <div><dt>{labels.deadline}</dt><dd>{offer.deadlineAt ? date(offer.deadlineAt) : labels.noDeadline}</dd></div>
            <div><dt>{labels.verified}</dt><dd>{date(offer.verifiedAt)}{offer.verification ? ` · ${offer.verification}` : ""}</dd></div>
          </dl>
          {blocked ? <p className="aihot-note">{blocked}</p> : null}
          <div className="aihot-credit-actions"><button type="button" className="aihot-action" disabled={!!blocked || loading || opening !== null} onClick={() => void open(() => openAiHotOffer(offer.id), offer.id)}><ArrowSquareOut />{labels.claim}</button><button type="button" className="aihot-action" onClick={() => openSource(offer.sourceUrl)}><ArrowSquareOut />{labels.source}</button></div>
        </article>;
      })}
    </div>}
  </section>;
}

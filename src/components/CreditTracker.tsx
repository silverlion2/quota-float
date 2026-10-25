import { useId, useState } from "react";
import { creditChanges, creditPools } from "../lib/credits";
import type { Language, ProviderSnapshot, QuotaHistoryPoint } from "../types";
import "./credits.css";

interface CreditTrackerProps {
  snapshot: ProviderSnapshot;
  history: readonly QuotaHistoryPoint[];
  now: Date;
  language: Language;
  defaultExpanded?: boolean;
}

export function CreditTracker({ snapshot, history, now, language, defaultExpanded = false }: CreditTrackerProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const id = useId();
  const en = language === "en";
  const pools = creditPools(snapshot);
  const number = (value: number) => new Intl.NumberFormat(en ? "en-US" : "zh-CN", { maximumFractionDigits: 6 }).format(value);
  const date = (value: string) => Number.isFinite(Date.parse(value))
    ? new Intl.DateTimeFormat(en ? "en-US" : "zh-CN", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "short" }).format(new Date(value))
    : en ? "Time unavailable" : "时间未知";
  const unknown = en ? "Expiry not provided" : "未提供到期时间";
  const badge = (value: string) => Date.parse(value) <= now.getTime() ? (en ? "Expired" : "已到期")
    : Date.parse(value) - now.getTime() <= 7 * 86_400_000 ? (en ? "Within 7 days" : "7 天内到期") : null;
  const label = (kind: "reset" | "balance") => kind === "reset" ? (en ? "Reset credits" : "重置 credits")
    : snapshot.provider === "codex" ? (en ? "Extra credits" : "额外 credits") : (en ? "Usage credits" : "用量 credits");
  const stale = snapshot.status === "stale" || (snapshot.status === "ok" && now.getTime() - Date.parse(snapshot.updatedAt) > 30 * 60_000);
  const status = stale ? (en ? "Last known · stale" : "上次已知值 · 数据陈旧")
    : snapshot.status === "loading" ? (en ? "Loading" : "读取中")
    : snapshot.status === "signed_out" ? (en ? "Sign in required" : "需要登录")
    : snapshot.status === "unavailable" ? (en ? "Unavailable" : "不可用") : null;
  if (!pools.length) return null;

  return <section className="credit-tracker" aria-label={en ? "Credits" : "Credits 追踪"} onMouseDown={(event) => event.stopPropagation()}>
    <div className="credit-tracker__heading">
      <span>{en ? "Credits" : "Credits 追踪"}</span>
      <button type="button" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(!expanded)} onMouseDown={(event) => event.stopPropagation()}>
        {expanded ? (en ? "Hide details" : "收起明细") : (en ? "Credit details" : "Credits 明细")} <span aria-hidden="true">{expanded ? "−" : "+"}</span>
      </button>
    </div>
    {status ? <p className="credit-tracker__status">{status}</p> : null}
    <div className="credit-tracker__pools">
      {pools.map((pool) => {
        const dated = pool.expirations.filter((grant) => grant.expiresAt && grant.remaining !== 0);
        const next = dated.find((grant) => Date.parse(grant.expiresAt!) > now.getTime()) ?? dated[0];
        const active = pool.remaining !== 0 && !pool.unlimited && pool.remaining !== null;
        return <div className="credit-tracker__pool" key={pool.kind}>
          <div className="credit-tracker__metric"><span>{label(pool.kind)}</span><strong>{pool.unlimited ? "∞" : pool.remaining === null ? "—" : number(pool.remaining)}</strong></div>
          <p className="credit-tracker__expiry">{pool.unlimited ? (en ? "Unlimited · expiry not provided" : "不限量 · 未提供到期时间")
            : pool.remaining === 0 ? (en ? "No credits remaining" : "暂无剩余 credits")
            : active && next?.expiresAt ? <>{en ? "Reported expiry" : "已知到期时间"} <time dateTime={next.expiresAt}>{date(next.expiresAt)}</time>{badge(next.expiresAt) ? <b className="credit-tracker__badge">{badge(next.expiresAt)}</b> : null}</>
            : unknown}</p>
          {active && dated.length > 0 && pool.expirations.some((grant) => !grant.expiresAt && grant.remaining !== 0)
            ? <p>{en ? "Some expiry dates unknown" : "部分到期时间未知"}</p> : null}
        </div>;
      })}
    </div>
    {expanded ? <div className="credit-tracker__details" id={id} tabIndex={0} role="region" aria-label={en ? "Credits history and expiration" : "Credits 历史与到期明细"}>
      {snapshot.provider === "codex" ? <p>{en ? "Available account data does not include per-purchase expiry dates for extra credits." : "当前账号数据未包含额外 credits 的逐笔到期时间。"}</p> : null}
      <p>{en ? "Reported dates may cover only part of the balance; amounts are unknown unless shown." : "已知日期可能仅覆盖部分余额；未标明的数量未知。"}</p>
      {pools.map((pool) => {
        const changes = creditChanges(history, snapshot, pool.kind, now);
        return <div className="credit-tracker__ledger" key={pool.kind}>
          <h4>{label(pool.kind)}</h4>
          {pool.remaining === 0 ? <p>{en ? "No credits remaining" : "暂无剩余 credits"}</p> : pool.expirations.length ? <ul>{pool.expirations.map((grant, index) => <li key={index}>
            <span>{grant.expiresAt ? <><time dateTime={grant.expiresAt}>{date(grant.expiresAt)}</time>{badge(grant.expiresAt) ? <b className="credit-tracker__badge">{badge(grant.expiresAt)}</b> : null}</> : unknown}</span>
            <span>{grant.remaining === null ? (en ? "Amount unknown" : "数量未知") : `${number(grant.remaining)} credits`}</span>
          </li>)}</ul> : <p>{unknown}</p>}
          <h4>{en ? "Local changes · past 30 days" : "本地变化 · 近 30 天"}</h4>
          {changes.length ? <ul>{changes.map((change) => <li key={change.at}><time dateTime={change.at}>{date(change.at)}</time><span>{number(change.remaining)} <small>({change.delta === null ? (en ? "baseline" : "基线") : `${change.delta > 0 ? "+" : ""}${number(change.delta)}`})</small></span></li>)}</ul> : <p>{en ? "No local observations" : "暂无本地记录"}</p>}
        </div>;
      })}
      <p>{en ? "Observed changes may include consumption, expiry or refills; this is not a billing ledger." : "观察到的变化可能包含消耗、到期或补充，并非账单明细。"}</p>
      <p>{en ? "Data timestamp" : "数据时间"} <time dateTime={snapshot.updatedAt}>{date(snapshot.updatedAt)}</time></p>
    </div> : null}
  </section>;
}

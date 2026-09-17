import { useCallback, useEffect, useRef, useState } from "react";
import { fetchCodexProfileStats } from "../lib/bridge";
import { formatDateTime } from "../lib/format";
import { requestLatest } from "../lib/latestRequest";
import type { CodexProfileStats, Language } from "../types";

export function CodexProfileSummary({ language }: { language: Language }) {
  const [profile, setProfile] = useState<CodexProfileStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const request = useRef({ sequence: 0 });
  const en = language === "en";
  const refresh = useCallback(() => {
    setLoading(true);
    requestLatest(request.current, fetchCodexProfileStats, (value) => {
      setProfile(value);
      setFailed(false);
    }, (error) => {
      if (typeof error === "object" && error !== null && "clearCached" in error && error.clearCached === true) setProfile(null);
      setFailed(true);
    }, () => setLoading(false));
  }, []);
  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 10 * 60_000);
    return () => { request.current.sequence += 1; window.clearInterval(timer); };
  }, [refresh]);
  const number = (value: number | null | undefined) => value == null ? "—" : new Intl.NumberFormat(en ? "en-US" : "zh-CN", { notation: "compact", maximumFractionDigits: 2 }).format(value);
  const exact = (value: number | null | undefined) => value == null ? (en ? "Not provided" : "来源未提供") : `${value.toLocaleString(en ? "en-US" : "zh-CN")} Token`;
  return <section className="usage-profile-summary" aria-label={en ? "Codex Profile account statistics" : "Codex Profile 账户统计"}>
    <header><strong>Codex Profile · {en ? "Account lifetime" : "账户终生累计"}</strong><button type="button" className="usage-refresh" disabled={loading} onClick={refresh}>{loading ? en ? "Refreshing…" : "正在刷新…" : en ? "Refresh Profile" : "刷新 Profile"}</button></header>
    <div className="usage-summary-grid">
      <article className="usage-stat-card"><span>{en ? "Lifetime Token" : "终生 Token"}</span><strong>{loading && !profile ? "…" : number(profile?.lifetimeTokens)}</strong><small>{exact(profile?.lifetimeTokens)}</small></article>
      <article className="usage-stat-card"><span>{en ? "Peak daily Token" : "单日 Token 峰值"}</span><strong>{number(profile?.peakDailyTokens)}</strong><small>{exact(profile?.peakDailyTokens)}</small></article>
      <article className="usage-stat-card"><span>{en ? "Current streak" : "当前连续使用"}</span><strong>{number(profile?.currentStreakDays)}</strong><small>{en ? "days · Profile" : "天 · Profile"}</small></article>
      <article className="usage-stat-card"><span>{en ? "Longest streak" : "最长连续使用"}</span><strong>{number(profile?.longestStreakDays)}</strong><small>{en ? "days · Profile" : "天 · Profile"}</small></article>
      <article className="usage-stat-card"><span>{en ? "Longest chat" : "最长单次任务"}</span><strong>{profile?.longestRunningTurnSeconds == null ? "—" : `${(profile.longestRunningTurnSeconds / 3600).toLocaleString(en ? "en-US" : "zh-CN", { maximumFractionDigits: 2 })}h`}</strong><small>{en ? "Profile recorded duration" : "Profile 记录时长"}</small></article>
      <article className="usage-stat-card"><span>{en ? "Account tasks" : "账户任务数"}</span><strong>{number(profile?.totalThreads)}</strong><small>{en ? "Profile total" : "Profile 累计"}</small></article>
    </div>
    <p>{en ? "From the same account endpoint as Codex Profile. Includes account history; independent of the local chart range and filters." : "读取 Codex Profile 同一账户接口，包含账户历史；不受下方本机图表区间和筛选影响。"}</p>
    {profile ? <small>{en ? "Read at: " : "读取时间："}{formatDateTime(profile.fetchedAt, language)}</small> : null}
    {failed ? <p role="status">{profile ? en ? "Refresh failed; showing the previous Profile result. It may be out of date." : "刷新失败，显示上次 Profile 结果，可能已过期。" : en ? "Profile statistics are unavailable. Local records below are not a substitute for the account lifetime total." : "Profile 统计暂不可用，下方本机记录不能替代账户终生总量。"}</p> : null}
  </section>;
}

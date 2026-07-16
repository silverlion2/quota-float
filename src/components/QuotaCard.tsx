import { ArrowClockwise, ClockCounterClockwise, CloudSlash, PushPin, PushPinSlash, SignIn, WarningCircle } from "@phosphor-icons/react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { clampPercent, formatDateTime, formatResetDate, formatResetTime, quotaTier } from "../lib/format";
import { copy, normalizeLanguage } from "../lib/i18n";
import { PROVIDER_CATALOG, type ProviderDefinition } from "../lib/providers";
import type { Language, ProviderId, ProviderSnapshot, WidgetPreferences } from "../types";
import { ProviderMark } from "./ProviderMark";

interface Props {
  snapshot: ProviderSnapshot;
  snapshots: ProviderSnapshot[];
  preferences: WidgetPreferences;
  onSelectProvider: (provider: ProviderId) => void;
  onLock: () => void;
  onLanguage: () => void;
  onDrag: () => void;
  onHover: (hovered: boolean) => void;
  onRefresh?: () => void;
  isConsuming?: boolean;
  consumingProviders: ReadonlySet<string>;
  notice?: string | null;
  initialShowCreditTip?: boolean;
}

function StatusIcon({ status, expired = false }: { status: ProviderSnapshot["status"]; expired?: boolean }) {
  if (status === "signed_out") return <SignIn weight="duotone" />;
  if (status === "stale" || expired) return <ClockCounterClockwise weight="duotone" />;
  if (status === "unavailable") return <CloudSlash weight="duotone" />;
  return <WarningCircle weight="duotone" />;
}

function localizedBackendMessage(message: string | null, language: Language): string | null {
  if (!message) return null;
  if (language === "en") return message;
  const normalized = message.toLowerCase();
  if (normalized.includes("sign in") || normalized.includes("login")) return "Codex 登录已失效，请重新登录。";
  if (normalized.includes("rate limited")) return "请求过于频繁，将稍后自动重试。";
  if (normalized.includes("network")) return "网络不可用，将自动重试。";
  if (normalized.includes("format")) return "额度响应格式已变化。";
  if (normalized.includes("missing the weekly")) return "额度响应缺少每周窗口。";
  if (normalized.includes("refresh is already running")) return "额度正在刷新，请稍候。";
  return message;
}

function ProviderLedgerRow({
  definition,
  snapshot,
  selected,
  consuming,
  language,
  onSelect,
}: {
  definition: ProviderDefinition;
  snapshot?: ProviderSnapshot;
  selected: boolean;
  consuming: boolean;
  language: Language;
  onSelect: (provider: ProviderId) => void;
}) {
  const t = copy[language];
  const weekly = snapshot?.weeklyWindow ? clampPercent(snapshot.weeklyWindow.remainingPercent) : null;
  const balance = snapshot?.balanceRemaining ?? null;
  const unlimited = snapshot?.balanceUnit === "unlimited";
  const unlimitedLabel = language === "en" ? "Unlimited" : "不限量";
  const value = unlimited
    ? "∞"
    : weekly !== null
    ? `${weekly}%`
    : balance !== null
      ? new Intl.NumberFormat(language === "en" ? "en-US" : "zh-CN", { maximumFractionDigits: 1 }).format(balance)
      : "--";
  const detail = !snapshot
    ? t.notDetected
    : consuming
      ? t.active
      : snapshot.status === "stale"
        ? t.dataStale
        : snapshot.status === "signed_out"
          ? t.notSignedIn
            : snapshot.status !== "ok"
              ? t.temporarilyUnavailable
            : unlimited
              ? unlimitedLabel
            : weekly !== null
              ? `${t.weeklyShort} · ${formatResetDate(snapshot.weeklyWindow?.resetsAt ?? null, language)}`
              : snapshot.balanceUnit ?? t.balanceRemaining;

  return (
    <button
      type="button"
      className={`provider-row${selected ? " is-selected" : ""}${consuming ? " is-consuming" : ""}`}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={() => onSelect(definition.id)}
      disabled={!snapshot}
      aria-pressed={selected}
    >
      <ProviderMark provider={definition.id} label={definition.label} />
      <span className="provider-identity">
        <strong>{definition.label}</strong>
        <small>{snapshot?.plan ?? ""}</small>
      </span>
      <span className="provider-value">
        <strong>{value}</strong>
        <small>{detail}</small>
      </span>
    </button>
  );
}

export const QuotaCard = memo(function QuotaCard({
  snapshot,
  snapshots,
  preferences,
  onSelectProvider,
  onLock,
  onLanguage,
  onDrag,
  onHover,
  onRefresh,
  isConsuming = false,
  consumingProviders,
  notice = null,
  initialShowCreditTip = false,
}: Props) {
  const [showCreditTip, setShowCreditTip] = useState(initialShowCreditTip);
  const language = normalizeLanguage(preferences.language);
  const t = copy[language];
  const weekly = snapshot.weeklyWindow ? clampPercent(snapshot.weeklyWindow.remainingPercent) : null;
  const balance = snapshot.balanceRemaining ?? null;
  const unlimited = snapshot.balanceUnit === "unlimited";
  const unlimitedLabel = language === "en" ? "Unlimited" : "不限量";
  const formattedBalance = unlimited
    ? "∞"
    : balance !== null
    ? new Intl.NumberFormat(language === "en" ? "en-US" : "zh-CN", { maximumFractionDigits: 1 }).format(balance)
    : null;
  const metricTitle = unlimited ? unlimitedLabel : weekly !== null ? t.weeklyRemaining : balance !== null ? t.balanceRemaining : t.unavailableStatus;
  const metricLabel = weekly !== null
    ? t.availableLabel(weekly)
    : unlimited
      ? unlimitedLabel
    : balance !== null
      ? `${formattedBalance} ${snapshot.balanceUnit ?? ""}`.trim()
      : null;
  const staleAge = Date.now() - new Date(snapshot.updatedAt).getTime();
  const staleExpired = snapshot.status === "stale" && staleAge > 30 * 60_000;
  const available = snapshot.status === "ok" || (snapshot.status === "stale" && !staleExpired);
  const tier = quotaTier(weekly);
  const indicatorState = isConsuming ? "active" : snapshot.status === "ok" ? "ok" : snapshot.status === "stale" ? "stale" : "error";
  const indicatorLabel = isConsuming
    ? t.active
    : snapshot.status === "ok"
      ? t.dataSynced
      : snapshot.status === "stale"
        ? t.dataStale
        : snapshot.status === "signed_out"
          ? t.notSignedIn
          : t.unavailableStatus;
  const message = localizedBackendMessage(snapshot.message, language);
  const creditExpirations = useMemo(() => (snapshot.resetCreditExpiresAt ?? []).map((value, index) => {
    return t.creditItem(index, formatDateTime(value, language));
  }), [language, snapshot.resetCreditExpiresAt, t]);
  const snapshotsByProvider = useMemo(() => new Map(snapshots.map((item) => [item.provider, item])), [snapshots]);

  return (
    <main
      className={`quota-card quota-card--${snapshot.status} quota-card--${tier}`}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onMouseDown={(event) => { if (event.button === 0) void onDrag(); }}
    >
      <div className="aurora" aria-hidden="true" />
      <span className="sr-only" aria-live="polite">{available ? metricLabel : message}</span>
      {notice ? <p className="operation-notice" role="status">{notice}</p> : null}
      <section className="primary-pane">
        <header className="card-header">
          <div>
            <p className="eyebrow">{snapshot.displayName} · {snapshot.plan ?? t.accountFallback}</p>
            {snapshot.status !== "stale" ? <p className="updated">{metricTitle}</p> : null}
          </div>
        </header>

        {available && (weekly !== null || balance !== null) ? (
          <>
            <section className="primary-metric" aria-label={metricLabel ?? undefined}>
              <span>{weekly ?? formattedBalance}</span><small>{weekly !== null ? "%" : unlimited ? "" : ` ${snapshot.balanceUnit ?? ""}`}</small>
            </section>
            {weekly !== null ? <div className="progress" role="progressbar" aria-label={t.availableLabel(weekly)} aria-valuemin={0} aria-valuemax={100} aria-valuenow={weekly}>
              <span style={{ width: `${weekly}%` }} />
            </div> : null}
            <p className="reset-time">{weekly !== null ? formatResetTime(snapshot.weeklyWindow?.resetsAt ?? null, new Date(), language) : unlimited ? unlimitedLabel : snapshot.balanceUnit ?? ""}</p>
            <footer className="primary-footer">
              {weekly !== null || snapshot.resetCredits !== null ? <div className="quota-meta">
                {weekly !== null ? <p>{t.weeklyResetDate(formatResetDate(snapshot.weeklyWindow?.resetsAt ?? null, language))}</p> : null}
                <div className="reset-credit-row" onMouseDown={(event) => event.stopPropagation()}>
                  <span>{snapshot.resetCredits === null ? t.resetCreditUnknown : t.resetCredits(snapshot.resetCredits)}</span>
                  {snapshot.resetCredits !== null && snapshot.resetCredits > 0 ? (
                    <button type="button" className="reset-credit-button" onClick={() => setShowCreditTip((value) => !value)} aria-expanded={showCreditTip} aria-label={t.view}>{t.view}</button>
                  ) : null}
                </div>
                {showCreditTip ? (
                  <div className="reset-credit-tip" role="status" onMouseDown={(event) => event.stopPropagation()}>
                    {creditExpirations.length > 0 ? creditExpirations.map((item) => <p key={item}>{item}</p>) : <p>{t.noCreditExpiration}</p>}
                  </div>
                ) : null}
              </div> : null}
              <ProviderMark provider={snapshot.provider} label={snapshot.displayName} />
            </footer>
          </>
        ) : (
          <section className="error-state" aria-live="polite">
            <div className="status-icon" aria-hidden="true"><StatusIcon status={snapshot.status} expired={staleExpired} /></div>
            <div><strong>{snapshot.status === "signed_out" ? t.signedInRequired : staleExpired ? t.staleExpired : t.temporarilyUnavailable}</strong>
            <p>{message ?? t.errorUnavailable}</p></div>
            {snapshot.status === "stale" ? (
              <button type="button" className="error-refresh-button" onMouseDown={(event) => event.stopPropagation()} onClick={onRefresh} disabled={!onRefresh} aria-label={t.refreshQuota}>
                <ArrowClockwise />
                <span>{t.refresh}</span>
              </button>
            ) : null}
          </section>
        )}
      </section>

      <aside className="provider-ledger">
        <header className="ledger-header">
          <p>{t.allServices}<span>{snapshots.length}/{PROVIDER_CATALOG.length}</span></p>
          {!preferences.locked ? (
            <nav className="card-actions" aria-label={t.controls} onMouseDown={(event) => event.stopPropagation()}>
              <span className={`usage-indicator usage-indicator--${indicatorState}`} role="status" aria-label={indicatorLabel} title={indicatorLabel}><i /></span>
              <button className="language-button" onClick={onLanguage} aria-label={t.switchLanguage} title={t.switchLanguage}>{language === "en" ? "中" : "EN"}</button>
              <button onClick={onLock} aria-label={preferences.alwaysOnTop ? t.pinOff : t.pinOn} title={preferences.alwaysOnTop ? t.pinOff : t.pinOn}>
                {preferences.alwaysOnTop ? <PushPin /> : <PushPinSlash />}
              </button>
            </nav>
          ) : null}
        </header>
        <div className="provider-list">
          {PROVIDER_CATALOG.map((definition) => (
            <ProviderLedgerRow
              key={definition.id}
              definition={definition}
              snapshot={snapshotsByProvider.get(definition.id)}
              selected={snapshot.provider === definition.id}
              consuming={consumingProviders.has(definition.id)}
              language={language}
              onSelect={onSelectProvider}
            />
          ))}
        </div>
      </aside>
    </main>
  );
});

export const QuotaOrb = memo(function QuotaOrb({ snapshot, onDrag, onHover, language = "zh-CN" }: Pick<Props, "snapshot" | "onDrag" | "onHover"> & { language?: Language }) {
  const [idle, setIdle] = useState(false);
  const idleTimer = useRef<number | null>(null);
  const activeLanguage = normalizeLanguage(language);
  const t = copy[activeLanguage];
  const weekly = snapshot.weeklyWindow ? clampPercent(snapshot.weeklyWindow.remainingPercent) : null;
  const balance = snapshot.balanceRemaining ?? null;
  const unlimited = snapshot.balanceUnit === "unlimited";
  const compactBalance = unlimited
    ? "∞"
    : balance !== null
    ? new Intl.NumberFormat(activeLanguage === "en" ? "en-US" : "zh-CN", { notation: "compact", maximumFractionDigits: 1 }).format(balance)
    : null;
  const tier = quotaTier(weekly);
  const available = snapshot.status === "ok" && (weekly !== null || balance !== null);
  const accessibleLabel = weekly !== null
    ? t.availableLabel(weekly)
    : unlimited
      ? (activeLanguage === "en" ? "Unlimited" : "不限量")
    : `${balance} ${snapshot.balanceUnit ?? ""}`.trim();

  useEffect(() => {
    idleTimer.current = window.setTimeout(() => setIdle(true), 2000);
    return () => {
      if (idleTimer.current !== null) window.clearTimeout(idleTimer.current);
    };
  }, []);

  const handleMouseEnter = () => {
    if (idleTimer.current !== null) window.clearTimeout(idleTimer.current);
    setIdle(false);
    onHover(true);
  };

  return (
    <main
      className={`quota-orb quota-card--${snapshot.status} quota-card--${tier}${idle ? " quota-orb--idle" : ""}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => onHover(false)}
      onMouseDown={(event) => { if (event.button === 0) void onDrag(); }}
      aria-label={available ? accessibleLabel : localizedBackendMessage(snapshot.message, activeLanguage) ?? t.unavailableStatus}
    >
      <div className="aurora" aria-hidden="true" />
      {available ? (
        <section className="orb-metric">
          <span>{weekly ?? compactBalance}</span>
          <small>{weekly !== null ? "%" : !unlimited && snapshot.balanceUnit === "credits" ? "cr" : ""}</small>
        </section>
      ) : (
        <section className="orb-unavailable">
          <StatusIcon status={snapshot.status} />
        </section>
      )}
    </main>
  );
});

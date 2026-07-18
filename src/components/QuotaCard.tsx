import { ArrowClockwise, ArrowsInSimple, ArrowsOutSimple, CheckCircle, ClockCounterClockwise, CloudArrowDown, CloudSlash, DotsSixVertical, Pulse, PushPin, PushPinSlash, SignIn, SpinnerGap, WarningCircle, X } from "@phosphor-icons/react";
import { memo, type PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { clampPercent, formatDateTime, formatResetDate, formatResetTime, quotaTier } from "../lib/format";
import { copy, normalizeLanguage } from "../lib/i18n";
import { normalizeProviderOrder, PROVIDER_CATALOG, type ProviderDefinition } from "../lib/providers";
import type { RecentCodexReset } from "../lib/resetDetection";
import type { Language, ProviderId, ProviderSnapshot, VolcengineDiagnostics, WidgetPreferences } from "../types";
import { ProviderMark } from "./ProviderMark";
import { EMPTY_UPDATE_STATE, UpdatePanel, type UpdateViewState } from "./UpdatePanel";

interface Props {
  snapshot: ProviderSnapshot;
  snapshots: ProviderSnapshot[];
  preferences: WidgetPreferences;
  onSelectProvider: (provider: ProviderId) => void;
  onReorderProviders?: (order: ProviderId[]) => void;
  onLock: () => void;
  onToggleStayExpanded?: () => void;
  onLanguage: () => void;
  onDrag: () => void;
  onHover: (hovered: boolean) => void;
  onRefresh?: () => void;
  onDiagnostics?: () => void;
  onCloseDiagnostics?: () => void;
  onReconnect?: () => void;
  diagnostics?: VolcengineDiagnostics | null;
  diagnosticsOpen?: boolean;
  diagnosticsLoading?: boolean;
  reconnecting?: boolean;
  recentCodexReset?: RecentCodexReset | null;
  updateState?: UpdateViewState;
  updateOpen?: boolean;
  onUpdateOpen?: () => void;
  onUpdateClose?: () => void;
  onUpdateDownload?: () => void;
  onUpdateInstall?: () => void;
  onUpdateRetry?: () => void;
  onUpdateLater?: () => void;
  onUpdateSkip?: () => void;
  onUpdateRelease?: () => void;
  isConsuming?: boolean;
  consumingProviders: ReadonlySet<string>;
  notice?: ReactNode;
  initialShowCreditTip?: boolean;
}

function StatusIcon({ status, expired = false }: { status: ProviderSnapshot["status"]; expired?: boolean }) {
  if (status === "signed_out") return <SignIn weight="duotone" />;
  if (status === "stale" || expired) return <ClockCounterClockwise weight="duotone" />;
  if (status === "unavailable") return <CloudSlash weight="duotone" />;
  return <WarningCircle weight="duotone" />;
}

function localizedBackendMessage(message: string | null, language: Language, provider = "Volcengine"): string | null {
  if (!message) return null;
  if (language === "en") return message;
  const normalized = message.toLowerCase();
  if (normalized.includes("sign in") || normalized.includes("login") || normalized.includes("reconnect")) return `${provider} 登录已失效，请重新连接。`;
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
  sortable,
  dragging,
  dragTarget,
  onReorderPointerDown,
  onReorderPointerMove,
  onReorderPointerUp,
  onReorderPointerCancel,
  onMove,
}: {
  definition: ProviderDefinition;
  snapshot?: ProviderSnapshot;
  selected: boolean;
  consuming: boolean;
  language: Language;
  onSelect: (provider: ProviderId) => void;
  sortable: boolean;
  dragging: boolean;
  dragTarget: boolean;
  onReorderPointerDown: (event: ReactPointerEvent<HTMLButtonElement>, provider: ProviderId) => void;
  onReorderPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onReorderPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onReorderPointerCancel: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onMove: (provider: ProviderId, offset: -1 | 1) => void;
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
    <div
      className={`provider-row-shell${dragging ? " is-dragging" : ""}${dragTarget ? " is-drag-target" : ""}`}
      data-provider-id={definition.id}
      role="listitem"
      tabIndex={sortable ? 0 : -1}
      aria-label={sortable ? t.reorderProvider(definition.label) : undefined}
      title={sortable ? t.reorderProvider(definition.label) : undefined}
      onMouseDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (!sortable || !event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
        event.preventDefault();
        event.stopPropagation();
        onMove(definition.id, event.key === "ArrowUp" ? -1 : 1);
      }}
    >
      <button
        type="button"
        className={`provider-row${selected ? " is-selected" : ""}${consuming ? " is-consuming" : ""}`}
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
      {sortable ? (
        <button
          type="button"
          className="provider-reorder-grip"
          aria-label={t.reorderProvider(definition.label)}
          title={t.reorderProvider(definition.label)}
          onMouseDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => onReorderPointerDown(event, definition.id)}
          onPointerMove={onReorderPointerMove}
          onPointerUp={onReorderPointerUp}
          onPointerCancel={onReorderPointerCancel}
        >
          <DotsSixVertical weight="bold" />
        </button>
      ) : null}
    </div>
  );
}

function VolcengineDiagnosticsPanel({
  value,
  language,
  loading,
  reconnecting,
  onClose,
  onReconnect,
}: {
  value: VolcengineDiagnostics | null;
  language: Language;
  loading: boolean;
  reconnecting: boolean;
  onClose: () => void;
  onReconnect: () => void;
}) {
  const t = copy[language];
  const healthy = Boolean(
    value?.installed
    && value.authenticated
    && value.recommendedProfile
    && !value.stalePath
    && !value.lastError,
  );

  return (
    <section
      className="diagnostics-panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="volcengine-diagnostics-title"
      onMouseDown={(event) => event.stopPropagation()}
    >
      <header className="diagnostics-header">
        <div>
          <p className="diagnostics-kicker">VOLCENGINE · PREFLIGHT</p>
          <h2 id="volcengine-diagnostics-title">{t.diagnosticsTitle}</h2>
          <p>{t.diagnosticsSubtitle}</p>
        </div>
        <button type="button" onClick={onClose} aria-label={t.closeDiagnostics} title={t.closeDiagnostics}><X /></button>
      </header>

      {loading && !value ? (
        <div className="diagnostics-loading" role="status"><SpinnerGap /><span>{t.diagnosticsLoading}</span></div>
      ) : value ? (
        <>
          <div className="diagnostics-body">
            <div className={`diagnostics-health${healthy ? " is-healthy" : " is-attention"}`}>
              {healthy ? <CheckCircle weight="duotone" /> : <WarningCircle weight="duotone" />}
              <strong>{healthy ? t.diagnosticsHealthy : t.diagnosticsAttention}</strong>
              <small>{value.cliVersion ?? t.cliMissing}</small>
            </div>
            <dl className="diagnostics-grid">
              <div><dt>{t.cliStatus}</dt><dd>{value.installed ? t.cliInstalled : t.cliMissing}</dd></div>
              <div><dt>{t.authentication}</dt><dd>{value.authenticated ? `${t.signedIn}${value.authMethod ? ` · ${value.authMethod}` : ""}` : t.signedOut}</dd></div>
              <div><dt>{t.profile}</dt><dd title={value.profileName ?? undefined}>{value.profileName ?? "—"}</dd></div>
              <div><dt>{t.region}</dt><dd>{value.profileRegion ?? "—"}</dd></div>
              <div className="diagnostics-wide"><dt>{t.executable}</dt><dd title={value.executablePath ?? undefined}>{value.executablePath ?? "—"}{value.executableSource ? ` · ${value.executableSource}` : ""}</dd></div>
              <div className="diagnostics-wide"><dt>{t.lastError}</dt><dd title={value.lastError ?? undefined}>{value.lastError ?? t.noLastError}</dd></div>
            </dl>
          </div>
          <footer className="diagnostics-footer">
            <p className={value.stalePath || !value.recommendedProfile ? "diagnostics-hint is-warning" : "diagnostics-hint"}>
              {value.stalePath ? t.pathFallback : value.recommendedProfile ? t.recommendedProfile : t.profileWarning}
            </p>
            <button type="button" className="diagnostics-reconnect" onClick={onReconnect} disabled={reconnecting || !value.installed}>
              {reconnecting ? <SpinnerGap /> : <SignIn />}
              <span>{reconnecting ? t.reconnecting : t.reconnect}</span>
            </button>
          </footer>
        </>
      ) : (
        <div className="diagnostics-loading" role="status"><WarningCircle /><span>{t.errorUnavailable}</span></div>
      )}
    </section>
  );
}

export const QuotaCard = memo(function QuotaCard({
  snapshot,
  snapshots,
  preferences,
  onSelectProvider,
  onReorderProviders = () => undefined,
  onLock,
  onToggleStayExpanded = () => undefined,
  onLanguage,
  onDrag,
  onHover,
  onRefresh,
  onDiagnostics = () => undefined,
  onCloseDiagnostics = () => undefined,
  onReconnect = () => undefined,
  diagnostics = null,
  diagnosticsOpen = false,
  diagnosticsLoading = false,
  reconnecting = false,
  recentCodexReset = null,
  updateState = EMPTY_UPDATE_STATE,
  updateOpen = false,
  onUpdateOpen = () => undefined,
  onUpdateClose = () => undefined,
  onUpdateDownload = () => undefined,
  onUpdateInstall = () => undefined,
  onUpdateRetry = () => undefined,
  onUpdateLater = () => undefined,
  onUpdateSkip = () => undefined,
  onUpdateRelease = () => undefined,
  isConsuming = false,
  consumingProviders,
  notice = null,
  initialShowCreditTip = false,
}: Props) {
  const [showCreditTip, setShowCreditTip] = useState(initialShowCreditTip);
  const [draggedProvider, setDraggedProvider] = useState<ProviderId | null>(null);
  const [dragTargetProvider, setDragTargetProvider] = useState<ProviderId | null>(null);
  const [reorderAnnouncement, setReorderAnnouncement] = useState("");
  const providerPointerDrag = useRef<{ source: ProviderId; target: ProviderId; after: boolean; pointerId: number } | null>(null);
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
  const message = localizedBackendMessage(snapshot.message, language, snapshot.displayName);
  const overlayOpen = diagnosticsOpen || updateOpen;
  const updateAttention = !["idle", "current"].includes(updateState.phase);
  const creditExpirations = useMemo(() => (snapshot.resetCreditExpiresAt ?? []).map((value, index) => {
    return t.creditItem(index, formatDateTime(value, language));
  }), [language, snapshot.resetCreditExpiresAt, t]);
  const snapshotsByProvider = useMemo(() => new Map(snapshots.map((item) => [item.provider, item])), [snapshots]);
  const providerDefinitions = useMemo(() => {
    const byProvider = new Map(PROVIDER_CATALOG.map((definition) => [definition.id, definition]));
    return normalizeProviderOrder(preferences.providerOrder).map((provider) => byProvider.get(provider)!);
  }, [preferences.providerOrder]);
  const resetMarker = snapshot.provider === "codex" && snapshot.status === "ok" ? recentCodexReset : null;

  const commitProviderOrder = (source: ProviderId, target: ProviderId, after = false) => {
    const order = providerDefinitions.map((definition) => definition.id);
    const sourceIndex = order.indexOf(source);
    const targetIndex = order.indexOf(target);
    if (sourceIndex < 0 || targetIndex < 0 || source === target) return;
    order.splice(sourceIndex, 1);
    const remainingTarget = order.indexOf(target);
    const insertAt = remainingTarget + (after ? 1 : 0);
    order.splice(insertAt, 0, source);
    onReorderProviders(order);
    setReorderAnnouncement(t.providerMoved(PROVIDER_CATALOG.find((item) => item.id === source)?.label ?? source, insertAt + 1));
  };

  const moveProvider = (provider: ProviderId, offset: -1 | 1) => {
    const order = providerDefinitions.map((definition) => definition.id);
    const index = order.indexOf(provider);
    const nextIndex = index + offset;
    if (index < 0 || nextIndex < 0 || nextIndex >= order.length) return;
    [order[index], order[nextIndex]] = [order[nextIndex], order[index]];
    onReorderProviders(order);
    setReorderAnnouncement(t.providerMoved(providerDefinitions[index].label, nextIndex + 1));
  };

  const providerAtPoint = (clientX: number, clientY: number) => {
    const row = document.elementFromPoint?.(clientX, clientY)?.closest<HTMLElement>("[data-provider-id]");
    if (!row) return null;
    const provider = row.dataset.providerId as ProviderId | undefined;
    if (!provider || !providerDefinitions.some((definition) => definition.id === provider)) return null;
    const bounds = row.getBoundingClientRect();
    return { provider, after: clientY > bounds.top + bounds.height / 2 };
  };

  const updateProviderPointerDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = providerPointerDrag.current;
    if (!drag || drag.pointerId !== (event.pointerId ?? 1)) return;
    event.preventDefault();
    event.stopPropagation();
    const target = providerAtPoint(event.clientX, event.clientY);
    if (!target) return;
    providerPointerDrag.current = { ...drag, target: target.provider, after: target.after };
    setDragTargetProvider(target.provider);
  };

  const finishProviderPointerDrag = (event: ReactPointerEvent<HTMLButtonElement>, canceled: boolean) => {
    const drag = providerPointerDrag.current;
    if (!drag || drag.pointerId !== (event.pointerId ?? 1)) return;
    event.preventDefault();
    event.stopPropagation();
    const finalTarget = providerAtPoint(event.clientX, event.clientY);
    const target = finalTarget ? { ...drag, target: finalTarget.provider, after: finalTarget.after } : drag;
    if (event.currentTarget.hasPointerCapture?.(drag.pointerId)) event.currentTarget.releasePointerCapture(drag.pointerId);
    providerPointerDrag.current = null;
    setDraggedProvider(null);
    setDragTargetProvider(null);
    if (!canceled) commitProviderOrder(target.source, target.target, target.after);
  };

  return (
    <main
      className={`quota-card quota-card--${snapshot.status} quota-card--${tier}`}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onMouseDown={(event) => { if (event.button === 0) void onDrag(); }}
    >
      <div className="aurora" aria-hidden="true" />
      <span className="sr-only" aria-live="polite">{available ? metricLabel : message}</span>
      <span className="sr-only" aria-live="polite">{reorderAnnouncement}</span>
      {notice ? <div className="operation-notice" role="status">{notice}</div> : null}
      {diagnosticsOpen ? (
        <VolcengineDiagnosticsPanel
          value={diagnostics}
          language={language}
          loading={diagnosticsLoading}
          reconnecting={reconnecting}
          onClose={onCloseDiagnostics}
          onReconnect={onReconnect}
        />
      ) : null}
      {updateOpen ? (
        <UpdatePanel
          state={updateState}
          language={language}
          onClose={onUpdateClose}
          onDownload={onUpdateDownload}
          onInstall={onUpdateInstall}
          onRetry={onUpdateRetry}
          onLater={onUpdateLater}
          onSkip={onUpdateSkip}
          onOpenRelease={onUpdateRelease}
        />
      ) : null}
      <section className="primary-pane" aria-hidden={overlayOpen || undefined} inert={overlayOpen || undefined}>
        <header className="card-header">
          <div>
            <p className="eyebrow">{snapshot.displayName} · {snapshot.plan ?? t.accountFallback}</p>
            <div className="metric-context">
              {snapshot.status !== "stale" ? <p className="updated">{metricTitle}</p> : null}
              {resetMarker ? <span className="recent-reset" title={t.resetDetectedAt(formatDateTime(resetMarker.resetAt, language))}><ClockCounterClockwise weight="bold" />{t.recentlyReset}</span> : null}
            </div>
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
            <div><strong>{snapshot.status === "signed_out" ? t.signedInRequiredFor(snapshot.displayName) : staleExpired ? t.staleExpired : t.temporarilyUnavailable}</strong>
            <p>{message ?? t.errorUnavailable}</p></div>
            <div className="error-actions">
              {snapshot.status === "stale" ? (
                <button type="button" className="error-refresh-button" onMouseDown={(event) => event.stopPropagation()} onClick={onRefresh} disabled={!onRefresh} aria-label={t.refreshQuota}>
                  <ArrowClockwise />
                  <span>{t.refresh}</span>
                </button>
              ) : null}
              {snapshot.provider === "volcengine" && snapshot.status === "signed_out" ? (
                <button type="button" className="error-refresh-button error-reconnect-button" onMouseDown={(event) => event.stopPropagation()} onClick={onReconnect} disabled={reconnecting} aria-label={t.reconnect}>
                  {reconnecting ? <SpinnerGap /> : <SignIn />}
                  <span>{reconnecting ? t.reconnecting : t.reconnect}</span>
                </button>
              ) : null}
              {snapshot.provider === "volcengine" && snapshot.status !== "ok" ? (
                <button type="button" className="error-refresh-button" onMouseDown={(event) => event.stopPropagation()} onClick={onDiagnostics} aria-label={t.diagnostics}>
                  <Pulse />
                  <span>{t.diagnostics}</span>
                </button>
              ) : null}
            </div>
          </section>
        )}
      </section>

      <aside className="provider-ledger" aria-hidden={overlayOpen || undefined} inert={overlayOpen || undefined}>
        <header className="ledger-header">
          <p>{t.allServices}<span>{snapshots.length}/{PROVIDER_CATALOG.length}</span></p>
          {!preferences.locked ? (
            <nav className="card-actions" aria-label={t.controls} onMouseDown={(event) => event.stopPropagation()}>
              <span className={`usage-indicator usage-indicator--${indicatorState}`} role="status" aria-label={indicatorLabel} title={indicatorLabel}><i /></span>
              <button className={updateAttention ? "update-action update-action--active" : "update-action"} onClick={onUpdateOpen} aria-label={t.appUpdate} title={t.appUpdate}><CloudArrowDown /></button>
              <button onClick={onDiagnostics} aria-label={t.diagnostics} title={t.diagnostics}><Pulse /></button>
              <button className="language-button" onClick={onLanguage} aria-label={t.switchLanguage} title={t.switchLanguage}>{language === "en" ? "中" : "EN"}</button>
              <button className={preferences.stayExpanded ? "expand-button expand-button--active" : "expand-button"} onClick={onToggleStayExpanded} aria-pressed={preferences.stayExpanded} aria-label={preferences.stayExpanded ? t.keepExpandedOff : t.keepExpandedOn} title={preferences.stayExpanded ? t.keepExpandedOff : t.keepExpandedOn}>
                {preferences.stayExpanded ? <ArrowsInSimple weight="bold" /> : <ArrowsOutSimple />}
              </button>
              <button onClick={onLock} aria-label={preferences.alwaysOnTop ? t.pinOff : t.pinOn} title={preferences.alwaysOnTop ? t.pinOff : t.pinOn}>
                {preferences.alwaysOnTop ? <PushPin /> : <PushPinSlash />}
              </button>
            </nav>
          ) : null}
        </header>
        <div className="provider-list" role="list">
          {providerDefinitions.map((definition) => (
            <ProviderLedgerRow
              key={definition.id}
              definition={definition}
              snapshot={snapshotsByProvider.get(definition.id)}
              selected={snapshot.provider === definition.id}
              consuming={consumingProviders.has(definition.id)}
              language={language}
              onSelect={onSelectProvider}
              sortable={!preferences.locked}
              dragging={draggedProvider === definition.id}
              dragTarget={dragTargetProvider === definition.id && draggedProvider !== definition.id}
              onReorderPointerDown={(event, provider) => {
                if (event.button !== 0) return;
                event.preventDefault();
                event.stopPropagation();
                const pointerId = event.pointerId ?? 1;
                providerPointerDrag.current = { source: provider, target: provider, after: false, pointerId };
                setDraggedProvider(provider);
                setDragTargetProvider(provider);
                event.currentTarget.setPointerCapture?.(pointerId);
              }}
              onReorderPointerMove={updateProviderPointerDrag}
              onReorderPointerUp={(event) => finishProviderPointerDrag(event, false)}
              onReorderPointerCancel={(event) => finishProviderPointerDrag(event, true)}
              onMove={moveProvider}
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
      aria-label={available ? accessibleLabel : localizedBackendMessage(snapshot.message, activeLanguage, snapshot.displayName) ?? t.unavailableStatus}
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

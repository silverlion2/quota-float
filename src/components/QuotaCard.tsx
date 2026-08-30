import { ArrowClockwise, ArrowSquareOut, ArrowsInSimple, ArrowsOutSimple, CheckCircle, ClockCounterClockwise, CloudArrowDown, CloudSlash, DotsSixVertical, Gauge, GearSix, Pulse, PushPin, PushPinSlash, SignIn, SpinnerGap, WarningCircle, X } from "@phosphor-icons/react";
import { lazy, memo, Suspense, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";
import { clampPercent, formatDateTime, formatResetDate, formatResetTime, quotaTier } from "../lib/format";
import { copy, normalizeLanguage, resetForecastLabel, resetForecastTitle } from "../lib/i18n";
import { useModalDialog } from "../lib/modalDialog";
import { normalizeProviderOrder, PROVIDER_CATALOG, type ProviderDefinition } from "../lib/providers";
import { snapshotRemainingPercent, sortProviderIdsByRisk } from "../lib/providerPresentation";
import { calculateQuotaPace, localDateKey, paceBaselineKey, trackedQuotaWindows, type NamedQuotaWindow, type QuotaPace, type QuotaPeriod } from "../lib/quotaPace";
import type { RecentCodexReset } from "../lib/resetDetection";
import { recentQuotaTrend, type QuotaTrendPoint } from "../lib/usageInsights";
import type { BarEdge, CockpitRegion, ColorTheme, CompactLayout, DailyPaceBaseline, DailyUsageSummary, Language, ProviderId, ProviderSnapshot, QuotaHistoryPoint, ResetForecast, ResolvedAppearance, VolcengineDiagnostics, WidgetPreferences } from "../types";
import { ProviderMark } from "./ProviderMark";
import { ProviderLogoSlider } from "./ProviderLogoSlider";
import { QuotaHistoryCurve } from "./QuotaHistoryCurve";
import { EMPTY_UPDATE_STATE, UpdatePanel, type UpdateViewState } from "./UpdatePanel";

const UsageInsightsPanel = lazy(() => import("./UsageInsightsPanel").then((module) => ({ default: module.UsageInsightsPanel })));

interface Props {
  snapshot: ProviderSnapshot;
  snapshots: ProviderSnapshot[];
  preferences: WidgetPreferences;
  resolvedAppearance?: ResolvedAppearance;
  collapsing?: boolean;
  onSelectProvider: (provider: ProviderId) => void;
  onPreferences?: (preferences: WidgetPreferences) => void;
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
  resetForecast?: ResetForecast | null;
  onOpenResetForecast?: (url: string) => void;
  paceBaselines?: Record<string, DailyPaceBaseline>;
  history?: QuotaHistoryPoint[];
  dailyUsage?: DailyUsageSummary[];
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
  controlCenter?: ReactNode;
  controlOpen?: boolean;
  onControlOpen?: () => void;
  onDetachCockpitRegion?: (region: CockpitRegion) => void;
  initialShowCreditTip?: boolean;
  initialInsightsOpen?: boolean;
}

function StatusIcon({ status, expired = false }: { status: ProviderSnapshot["status"]; expired?: boolean }) {
  if (status === "signed_out") return <SignIn weight="duotone" />;
  if (status === "stale" || expired) return <ClockCounterClockwise weight="duotone" />;
  if (status === "unavailable") return <CloudSlash weight="duotone" />;
  return <WarningCircle weight="duotone" />;
}

function quotaAvailableLabel(period: QuotaPeriod, remaining: number, language: Language): string {
  const t = copy[language];
  if (period === "weekly") return t.availableLabel(remaining);
  const label = period === "5h" ? t.fiveHourShort : t.monthlyShort;
  return language === "en"
    ? `${label} quota remaining ${remaining}%`
    : `${label}剩余 ${remaining}%`;
}

function QuotaPaceHint({ pace, language, provider }: { pace: QuotaPace; language: Language; provider: ProviderId }) {
  const t = copy[language];
  const number = new Intl.NumberFormat(language === "en" ? "en-US" : "zh-CN", { maximumFractionDigits: 1 });
  const statusLabel = pace.status === "on_track" ? t.onTrack : pace.status === "over_pace" ? t.overPaceBy(number.format(pace.overByPercent)) : t.paceUnknown;
  const unit = pace.unit === "hour" ? t.hourUnit : t.dayUnit;
  return (
    <div className={`quota-pace-hint quota-pace-hint--${pace.status}`} role="status">
      <span>
        {pace.status === "on_track" ? <CheckCircle weight="fill" /> : pace.status === "over_pace" ? <WarningCircle weight="fill" /> : <ClockCounterClockwise />}
        {statusLabel}
      </span>
      <div className="quota-pace-copy">
        {provider === "codex" ? <small className="quota-pace-used">{t.usedSinceReset(number.format(pace.todayUsedPercent))}</small> : null}
        {pace.todayRemainingPercent !== null ? <small className="quota-pace-today">{t.todayPlannedRemaining(number.format(pace.todayRemainingPercent))}</small> : null}
        <small>{t.averageSuggested(number.format(pace.averageRate), unit)}</small>
      </div>
    </div>
  );
}

function QuotaWindowList({ windows, provider, language, paceBaselines }: { windows: NamedQuotaWindow[]; provider: ProviderId; language: Language; paceBaselines: Record<string, DailyPaceBaseline> }) {
  const t = copy[language];
  const number = new Intl.NumberFormat(language === "en" ? "en-US" : "zh-CN", { maximumFractionDigits: 1 });
  const labels: Record<QuotaPeriod, string> = {
    "5h": t.fiveHourShort,
    weekly: t.weeklyShort,
    monthly: t.monthlyShort,
  };
  return (
    <section className="quota-window-list" aria-label={t.quotaWindows}>
      {windows.map(({ period, window }) => {
        const remaining = clampPercent(window.remainingPercent);
        const pace = calculateQuotaPace(window, new Date(), paceBaselines[paceBaselineKey(provider, period)] ?? null);
        const statusLabel = pace.status === "on_track" ? t.onTrack : pace.status === "over_pace" ? t.overPaceBy(number.format(pace.overByPercent)) : t.paceUnknown;
        const unit = pace.unit === "hour" ? t.hourUnit : t.dayUnit;
        return (
          <article className={`quota-window quota-window--${pace.status}`} key={period}>
            <header>
              <strong>{labels[period]}</strong>
              <span>{remaining}%</span>
              <em>
                {pace.status === "on_track" ? <CheckCircle weight="fill" /> : pace.status === "over_pace" ? <WarningCircle weight="fill" /> : <ClockCounterClockwise />}
                {statusLabel}
              </em>
            </header>
            <div className="quota-window-progress" role="progressbar" aria-label={`${labels[period]} ${remaining}%`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={remaining}>
              <span style={{ width: `${remaining}%` }} />
            </div>
            <footer>
              {pace.todayRemainingPercent !== null ? <span className="quota-pace-today">{t.todayPlannedRemaining(number.format(pace.todayRemainingPercent))}</span> : null}
              <span>{t.averageSuggested(number.format(pace.averageRate), unit)}</span>
              <span>{formatResetTime(window.resetsAt, new Date(), language)}</span>
            </footer>
          </article>
        );
      })}
    </section>
  );
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
  dragAfter,
  onReorderPointerDown,
  onReorderPointerMove,
  onReorderPointerUp,
  onReorderPointerCancel,
  onMove,
  condensed,
  history,
  showHistory,
  preferRisk,
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
  dragAfter: boolean;
  onReorderPointerDown: (event: ReactPointerEvent<HTMLButtonElement>, provider: ProviderId) => void;
  onReorderPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onReorderPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onReorderPointerCancel: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onMove: (provider: ProviderId, offset: -1 | 1) => void;
  condensed: boolean;
  history: QuotaTrendPoint[];
  showHistory: boolean;
  preferRisk: boolean;
}) {
  const t = copy[language];
  const riskWindow = snapshot
    ? trackedQuotaWindows(snapshot).sort((left, right) => left.window.remainingPercent - right.window.remainingPercent)[0] ?? null
    : null;
  const quotaWindow = preferRisk && riskWindow
    ? { label: riskWindow.period === "weekly" ? t.weeklyShort : riskWindow.period === "5h" ? t.fiveHourShort : t.monthlyShort, window: riskWindow.window }
    : snapshot?.weeklyWindow
    ? { label: t.weeklyShort, window: snapshot.weeklyWindow }
    : snapshot?.shortWindow
      ? { label: t.fiveHourShort, window: snapshot.shortWindow }
      : snapshot?.monthlyWindow
        ? { label: t.monthlyShort, window: snapshot.monthlyWindow }
        : null;
  const remaining = quotaWindow ? clampPercent(quotaWindow.window.remainingPercent) : null;
  const balance = snapshot?.balanceRemaining ?? null;
  const unlimited = snapshot?.balanceUnit === "unlimited";
  const unlimitedLabel = language === "en" ? "Unlimited" : "不限量";
  const value = unlimited
    ? "∞"
    : remaining !== null
    ? `${remaining}%`
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
            : quotaWindow
              ? `${quotaWindow.label} · ${formatResetDate(quotaWindow.window.resetsAt, language)}`
              : snapshot.balanceUnit ?? t.balanceRemaining;

  return (
    <div
      className={`provider-row-shell${dragging ? " is-dragging" : ""}${dragTarget ? ` is-drag-target ${dragAfter ? "is-drag-after" : "is-drag-before"}` : ""}${condensed ? " is-condensed" : ""}${sortable ? "" : " is-fixed"}`}
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
        className={`provider-row${selected ? " is-selected" : ""}${consuming ? " is-consuming" : ""}${showHistory ? " has-history" : ""}`}
        onClick={() => onSelect(definition.id)}
        disabled={!snapshot}
        aria-pressed={selected}
      >
        <ProviderMark provider={definition.id} label={definition.label} />
        <span className="provider-identity">
          <strong>{definition.label}</strong>
          <small>{snapshot?.plan ?? ""}</small>
        </span>
        {showHistory ? <span className="provider-history"><QuotaHistoryCurve points={history} language={language} variant="micro" interactive={false} /></span> : null}
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
  const dialogRef = useModalDialog<HTMLElement>(onClose);
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
      ref={dialogRef}
      className="diagnostics-panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="volcengine-diagnostics-title"
      tabIndex={-1}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <header className="diagnostics-header">
        <div>
          <p className="diagnostics-kicker">VOLCENGINE · PREFLIGHT</p>
          <h2 id="volcengine-diagnostics-title">{t.diagnosticsTitle}</h2>
          <p>{t.diagnosticsSubtitle}</p>
        </div>
        <button type="button" onClick={onClose} aria-label={t.closeDiagnostics} title={t.closeDiagnostics} data-dialog-initial-focus><X /></button>
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

export interface CockpitDashboardProps {
  snapshot: ProviderSnapshot;
  history: QuotaHistoryPoint[];
  dailyUsage: DailyUsageSummary[];
  paceBaselines: Record<string, DailyPaceBaseline>;
  language: Language;
  focusedRegion: CockpitRegion | null;
  onFocusRegion: (region: CockpitRegion | null) => void;
  onDetachRegion?: (region: CockpitRegion) => void;
  detached?: boolean;
}

export function CockpitDashboard({
  snapshot,
  history,
  dailyUsage,
  paceBaselines,
  language,
  focusedRegion,
  onFocusRegion,
  onDetachRegion,
  detached = false,
}: CockpitDashboardProps) {
  const windows = trackedQuotaWindows(snapshot);
  const headlineWindow = windows.find(({ period }) => period === "weekly") ?? windows[0] ?? null;
  const remaining = headlineWindow ? clampPercent(headlineWindow.window.remainingPercent) : null;
  const balance = snapshot.balanceRemaining ?? null;
  const unlimited = snapshot.balanceUnit === "unlimited";
  const headlineValue = remaining !== null
    ? `${remaining}%`
    : unlimited
      ? "∞"
      : balance !== null
        ? new Intl.NumberFormat(language === "en" ? "en-US" : "zh-CN", { notation: "compact", maximumFractionDigits: 1 }).format(balance)
        : "—";
  const trendNow = new Date();
  const historyPoints = recentQuotaTrend(history, snapshot.provider, remaining, trendNow, 24);
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const usageByDate = new Map(
    dailyUsage
      .filter((item) => item.provider === snapshot.provider)
      .map((item) => [item.localDate, item.observedUsedPercent] as const),
  );
  const activityDays = Array.from({ length: 91 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (90 - index));
    const dateKey = localDateKey(date);
    const value = usageByDate.get(dateKey) ?? null;
    const level = value === null || value <= 0 ? 0 : value < 3 ? 1 : value < 8 ? 2 : value < 16 ? 3 : 4;
    return { dateKey, value, level };
  });
  const observedTotal = activityDays.reduce((total, item) => total + (item.value ?? 0), 0);
  const periodLabels: Record<QuotaPeriod, string> = language === "en"
    ? { "5h": "5 hours", weekly: "Week", monthly: "Month" }
    : { "5h": "5 小时", weekly: "本周", monthly: "本月" };
  const focusLabel = (region: CockpitRegion) => focusedRegion === region
    ? (language === "en" ? "Restore dashboard" : "恢复驾驶舱")
    : (language === "en" ? "Enlarge this area" : "放大这个区域");
  const toggleFocus = (region: CockpitRegion) => onFocusRegion(focusedRegion === region ? null : region);
  const detachLabel = language === "en" ? "Detach this area" : "拆出这个区域";

  const panelActions = (region: CockpitRegion) => detached ? null : (
    <div className="cockpit-panel-actions">
      {onDetachRegion ? (
        <button type="button" className="cockpit-focus-button cockpit-detach-button" aria-label={detachLabel} title={detachLabel} onMouseDown={(event) => event.stopPropagation()} onClick={() => onDetachRegion(region)}>
          <ArrowSquareOut />
        </button>
      ) : null}
      <button type="button" className="cockpit-focus-button" aria-label={focusLabel(region)} aria-pressed={focusedRegion === region} onMouseDown={(event) => event.stopPropagation()} onClick={() => toggleFocus(region)}>
        {focusedRegion === region ? <ArrowsInSimple /> : <ArrowsOutSimple />}
      </button>
    </div>
  );

  return (
    <section className={`cockpit-dashboard${detached ? " cockpit-dashboard--detached" : ""}`} data-focus={focusedRegion ?? "none"} aria-label={language === "en" ? "Quota cockpit" : "额度驾驶舱"}>
      <article className="cockpit-panel cockpit-panel--overview">
        <header>
          <div><span>{language === "en" ? "Quota snapshot" : "额度快照"}</span><small>{snapshot.displayName} · {snapshot.plan ?? (language === "en" ? "Local account" : "本地账户")}</small></div>
          {panelActions("overview")}
        </header>
        <div className="cockpit-overview-body">
          <div className="cockpit-ring" style={{ "--cockpit-progress": `${Math.round((remaining ?? (unlimited ? 100 : 0)) * 3.6)}deg` } as CSSProperties} role="img" aria-label={remaining !== null ? `${headlineValue} ${language === "en" ? "remaining" : "剩余"}` : headlineValue}>
            <div><strong>{headlineValue}</strong><small>{remaining !== null ? (language === "en" ? "remaining" : "剩余") : snapshot.balanceUnit ?? ""}</small></div>
          </div>
          <div className="cockpit-trend">
            <div><span>{language === "en" ? "Quota remaining · 24h" : "剩余额度 · 24 小时"}</span><small>{historyPoints.length >= 2 ? (language === "en" ? `${historyPoints.length} local samples · hover to inspect` : `${historyPoints.length} 个本地样本 · 悬停查看`) : (language === "en" ? "Collecting local samples" : "正在积累本地样本")}</small></div>
            <QuotaHistoryCurve points={historyPoints} language={language} variant="cockpit" now={trendNow} ariaLabel={language === "en" ? "24-hour quota remaining curve" : "24 小时剩余额度曲线"} />
          </div>
        </div>
      </article>

      <article className="cockpit-panel cockpit-panel--pace">
        <header>
          <div><span>{language === "en" ? "Pace plan" : "节奏计划"}</span><small>{language === "en" ? "Remaining vs. today's plan" : "剩余额度与今日计划"}</small></div>
          {panelActions("pace")}
        </header>
        <div className="cockpit-pace-list">
          {windows.length > 0 ? windows.map(({ period, window }) => {
            const windowRemaining = clampPercent(window.remainingPercent);
            const pace = calculateQuotaPace(window, new Date(), paceBaselines[paceBaselineKey(snapshot.provider, period)] ?? null);
            const paceLabel = pace.status === "on_track"
              ? (language === "en" ? "On track" : "节奏正常")
              : pace.status === "over_pace"
                ? (language === "en" ? `${pace.overByPercent.toFixed(1)}% over` : `超出 ${pace.overByPercent.toFixed(1)}%`)
                : (language === "en" ? "Learning" : "学习中");
            return (
              <div className={`cockpit-pace-row cockpit-pace-row--${pace.status}`} key={period}>
                <div><strong>{periodLabels[period]}</strong><span>{windowRemaining}%</span><small>{paceLabel}</small></div>
                <div className="cockpit-pace-track" role="progressbar" aria-label={`${periodLabels[period]} ${windowRemaining}%`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={windowRemaining}><i style={{ width: `${windowRemaining}%` }} /></div>
              </div>
            );
          }) : (
            <div className="cockpit-balance-fallback"><strong>{headlineValue}</strong><span>{unlimited ? (language === "en" ? "Unlimited plan" : "不限量计划") : snapshot.balanceUnit ?? (language === "en" ? "No quota window" : "暂无额度周期")}</span></div>
          )}
        </div>
      </article>

      <article className="cockpit-panel cockpit-panel--activity">
        <header>
          <div><span>{language === "en" ? "Last 90 days" : "近 90 天用量"}</span><small>{language === "en" ? `Observed use ${observedTotal.toFixed(1)}%` : `观测用量合计 ${observedTotal.toFixed(1)}%`}</small></div>
          {panelActions("activity")}
        </header>
        <div className="cockpit-heatmap" aria-label={language === "en" ? "90-day observed usage heatmap" : "90 天观测用量热力图"}>
          {activityDays.map((item) => <span key={item.dateKey} className={`cockpit-day cockpit-day--${item.level}`} title={`${item.dateKey} · ${item.value === null ? (language === "en" ? "No sample" : "无样本") : `${item.value.toFixed(1)}%`}`} />)}
        </div>
        <footer><span>{language === "en" ? "Less" : "少"}</span>{[0, 1, 2, 3, 4].map((level) => <i key={level} className={`cockpit-day cockpit-day--${level}`} />)}<span>{language === "en" ? "More" : "多"}</span></footer>
      </article>
    </section>
  );
}

export const QuotaCard = memo(function QuotaCard({
  snapshot,
  snapshots,
  preferences,
  resolvedAppearance = "light",
  onSelectProvider,
  onPreferences = () => undefined,
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
  resetForecast = null,
  onOpenResetForecast = () => undefined,
  paceBaselines = {},
  history = [],
  dailyUsage = [],
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
  controlCenter = null,
  controlOpen = false,
  onControlOpen = () => undefined,
  onDetachCockpitRegion,
  initialShowCreditTip = false,
  initialInsightsOpen = false,
  collapsing = false,
}: Props) {
  const [showCreditTip, setShowCreditTip] = useState(initialShowCreditTip);
  const [insightsOpen, setInsightsOpen] = useState(initialInsightsOpen);
  const [cockpitFocus, setCockpitFocus] = useState<CockpitRegion | null>(null);
  const [draggedProvider, setDraggedProvider] = useState<ProviderId | null>(null);
  const [dragTargetProvider, setDragTargetProvider] = useState<ProviderId | null>(null);
  const [dragTargetAfter, setDragTargetAfter] = useState(false);
  const [reorderAnnouncement, setReorderAnnouncement] = useState("");
  const providerPointerDrag = useRef<{ source: ProviderId; target: ProviderId; after: boolean; pointerId: number } | null>(null);
  const quotaTabRef = useRef<HTMLButtonElement>(null);
  const insightsTabRef = useRef<HTMLButtonElement>(null);
  const language = normalizeLanguage(preferences.language);
  const t = copy[language];
  const tabId = useId();
  const quotaTabId = `${tabId}-quota-tab`;
  const insightsTabId = `${tabId}-insights-tab`;
  const quotaPanelId = `${tabId}-quota-panel`;
  const insightsPanelId = `${tabId}-insights-panel`;
  const quotaWindows = trackedQuotaWindows(snapshot);
  const showQuotaWindowList = quotaWindows.length > 1;
  const singleQuotaWindow = quotaWindows.length === 1 ? quotaWindows[0] : null;
  const singleRemaining = singleQuotaWindow
    ? clampPercent(singleQuotaWindow.window.remainingPercent)
    : null;
  const singleWindowPace = quotaWindows.length === 1
    ? calculateQuotaPace(quotaWindows[0].window, new Date(), paceBaselines[paceBaselineKey(snapshot.provider, quotaWindows[0].period)] ?? null)
    : null;
  const balance = snapshot.balanceRemaining ?? null;
  const unlimited = snapshot.balanceUnit === "unlimited";
  const unlimitedLabel = language === "en" ? "Unlimited" : "不限量";
  const formattedBalance = unlimited
    ? "∞"
    : balance !== null
    ? new Intl.NumberFormat(language === "en" ? "en-US" : "zh-CN", { maximumFractionDigits: 1 }).format(balance)
    : null;
  const singleWindowTitle = singleQuotaWindow?.period === "weekly"
    ? t.weeklyRemaining
    : singleQuotaWindow?.period === "5h"
      ? t.fiveHourShort
      : singleQuotaWindow?.period === "monthly"
        ? t.monthlyShort
        : null;
  const metricTitle = showQuotaWindowList ? t.quotaWindows : unlimited ? unlimitedLabel : singleWindowTitle ?? (balance !== null ? t.balanceRemaining : t.unavailableStatus);
  const metricLabel = showQuotaWindowList
    ? t.quotaWindows
    : singleRemaining !== null && singleQuotaWindow
    ? quotaAvailableLabel(singleQuotaWindow.period, singleRemaining, language)
    : unlimited
      ? unlimitedLabel
    : balance !== null
      ? `${formattedBalance} ${snapshot.balanceUnit ?? ""}`.trim()
      : null;
  const staleAge = Date.now() - new Date(snapshot.updatedAt).getTime();
  const staleExpired = snapshot.status === "stale" && staleAge > 30 * 60_000;
  const available = snapshot.status === "ok" || (snapshot.status === "stale" && !staleExpired);
  const tier = quotaTier(quotaWindows.length > 0 ? Math.min(...quotaWindows.map(({ window }) => clampPercent(window.remainingPercent))) : null);
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
  const overlayOpen = diagnosticsOpen || updateOpen || controlOpen;
  const quotaTabLabel = language === "en" ? "Quota" : "\u989d\u5ea6";
  const insightsTabLabel = language === "en" ? "Insights" : "\u6d1e\u5bdf";
  const updateAttention = !["idle", "current"].includes(updateState.phase);
  const creditExpirations = useMemo(() => (snapshot.resetCreditExpiresAt ?? []).map((value, index) => {
    return t.creditItem(index, formatDateTime(value, language));
  }), [language, snapshot.resetCreditExpiresAt, t]);
  const snapshotsByProvider = useMemo(() => new Map(snapshots.map((item) => [item.provider, item])), [snapshots]);
  const percentageHistoryByProvider = useMemo(() => {
    const historyNow = new Date();
    return new Map(PROVIDER_CATALOG.map((definition) => [
      definition.id,
      recentQuotaTrend(history, definition.id, null, historyNow, 24),
    ]));
  }, [history]);
  const providerDefinitions = useMemo(() => {
    const byProvider = new Map(PROVIDER_CATALOG.map((definition) => [definition.id, definition]));
    const visibleOrder = normalizeProviderOrder(preferences.providerOrder).filter((provider) => !preferences.hiddenProviders.includes(provider));
    const displayedOrder = preferences.riskFirst ? sortProviderIdsByRisk(visibleOrder, snapshots) : visibleOrder;
    return displayedOrder.map((provider) => byProvider.get(provider)!);
  }, [preferences.hiddenProviders, preferences.providerOrder, preferences.riskFirst, snapshots]);
  const resetMarker = snapshot.provider === "codex" && snapshot.status === "ok" ? recentCodexReset : null;
  const visibleResetForecast = snapshot.provider === "codex" ? resetForecast : null;

  useEffect(() => setCockpitFocus(null), [preferences.expandedLayout, snapshot.provider]);

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
    setDragTargetAfter(target.after);
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
    setDragTargetAfter(false);
    if (!canceled) commitProviderOrder(target.source, target.target, target.after);
  };

  return (
    <main
      className={`quota-card quota-card--${snapshot.status} quota-card--${tier} quota-card--layout-${preferences.layoutMode} quota-card--expanded-${preferences.expandedLayout} quota-card--style-${preferences.colorTheme} quota-card--theme-${resolvedAppearance} quota-card--origin-${preferences.compactLayout === "bar" || preferences.compactLayout === "bottleneck" ? preferences.barEdge : "center"}${overlayOpen ? " quota-card--overlay-open" : ""}${diagnosticsOpen ? " quota-card--diagnostics-open" : ""}${updateOpen ? " quota-card--update-open" : ""}${insightsOpen ? " quota-card--insights-open" : ""}${collapsing ? " quota-card--collapsing" : ""}`}
      style={{ "--accent-color": preferences.accentColor } as CSSProperties}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onMouseDown={(event) => { if (event.button === 0) void onDrag(); }}
    >
      <div className="aurora" aria-hidden="true" />
      <span className="sr-only" aria-live="polite">{available ? metricLabel : message}</span>
      <span className="sr-only" aria-live="polite">{reorderAnnouncement}</span>
      {notice ? <div className="operation-notice" role="status">{notice}</div> : null}
      {controlOpen ? controlCenter : null}
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
      <div className="quota-card-content">
      <header className="quota-panel-header" aria-hidden={overlayOpen || undefined} inert={overlayOpen || undefined}>
        <div className="quota-panel-navigation">
          <p className="quota-panel-brand">QUOTA FLOAT <span>· LOCAL FIRST</span></p>
          <div className="quota-panel-tabs" role="tablist" aria-label={language === "en" ? "Widget views" : "\u5c0f\u7ec4\u4ef6\u89c6\u56fe"} onMouseDown={(event) => event.stopPropagation()}>
            <button
              type="button"
              ref={quotaTabRef}
              id={quotaTabId}
              className={insightsOpen ? "" : "is-active"}
              role="tab"
              aria-selected={!insightsOpen}
              aria-controls={quotaPanelId}
              tabIndex={insightsOpen ? -1 : 0}
              onClick={() => setInsightsOpen(false)}
              onKeyDown={(event) => {
                if (event.key === "ArrowRight" || event.key === "ArrowLeft" || event.key === "End") {
                  event.preventDefault();
                  setInsightsOpen(true);
                  requestAnimationFrame(() => insightsTabRef.current?.focus());
                }
              }}
            >
              {quotaTabLabel}
            </button>
            <button
              type="button"
              ref={insightsTabRef}
              id={insightsTabId}
              className={insightsOpen ? "is-active" : ""}
              role="tab"
              aria-selected={insightsOpen}
              aria-controls={insightsPanelId}
              tabIndex={insightsOpen ? 0 : -1}
              onClick={() => setInsightsOpen(true)}
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "Home") {
                  event.preventDefault();
                  setInsightsOpen(false);
                  requestAnimationFrame(() => quotaTabRef.current?.focus());
                }
              }}
            >
              {insightsTabLabel}
            </button>
          </div>
        </div>
        {!preferences.locked ? (
          <nav className="card-actions quota-panel-actions" aria-label={t.controls} onMouseDown={(event) => event.stopPropagation()}>
            <span className={`usage-indicator usage-indicator--${indicatorState}`} role="status" aria-label={indicatorLabel} title={indicatorLabel}><i /></span>
            <button className={updateAttention ? "update-action update-action--active" : "update-action"} onClick={onUpdateOpen} aria-label={t.appUpdate} title={t.appUpdate}><CloudArrowDown /></button>
            <button className={controlOpen ? "control-action control-action--active" : "control-action"} onClick={onControlOpen} aria-label={language === "en" ? "Control center" : "\u63a7\u5236\u4e2d\u5fc3"} title={language === "en" ? "Control center" : "\u63a7\u5236\u4e2d\u5fc3"}><GearSix /></button>
            <button onClick={onDiagnostics} aria-label={t.diagnostics} title={t.diagnostics}><Pulse /></button>
            <button className="language-button" onClick={onLanguage} aria-label={t.switchLanguage} title={t.switchLanguage}>{language === "en" ? "\u4e2d" : "EN"}</button>
            <button className={preferences.stayExpanded ? "expand-button expand-button--active" : "expand-button"} onClick={onToggleStayExpanded} aria-pressed={preferences.stayExpanded} aria-label={preferences.stayExpanded ? t.keepExpandedOff : t.keepExpandedOn} title={preferences.stayExpanded ? t.keepExpandedOff : t.keepExpandedOn}>
              {preferences.stayExpanded ? <ArrowsInSimple weight="bold" /> : <ArrowsOutSimple />}
            </button>
            <button onClick={onLock} aria-label={preferences.alwaysOnTop ? t.pinOff : t.pinOn} title={preferences.alwaysOnTop ? t.pinOff : t.pinOn}>
              {preferences.alwaysOnTop ? <PushPin /> : <PushPinSlash />}
            </button>
          </nav>
        ) : null}
      </header>

      <div
        className="quota-tab-panel quota-tab-panel--quota"
        id={quotaPanelId}
        role="tabpanel"
        aria-labelledby={quotaTabId}
        hidden={insightsOpen}
        aria-hidden={overlayOpen || undefined}
        inert={overlayOpen || undefined}
      >
      {preferences.expandedLayout === "cockpit" ? (
        <div className="expanded-provider-strip" aria-label={language === "en" ? "Provider quick switch" : "平台快捷切换"}>
          <p>{language === "en" ? "Providers" : "平台"}<span>{providerDefinitions.length}</span></p>
          <ProviderLogoSlider
            providers={providerDefinitions.map((definition) => ({ id: definition.id, label: definition.label }))}
            selected={snapshot.provider}
            onSelect={onSelectProvider}
            ariaLabel={language === "en" ? "Choose provider" : "选择平台"}
          />
        </div>
      ) : null}
      {preferences.expandedLayout === "cockpit" ? (
        <CockpitDashboard
          snapshot={snapshot}
          history={history}
          dailyUsage={dailyUsage}
          paceBaselines={paceBaselines}
          language={language}
          focusedRegion={cockpitFocus}
          onFocusRegion={setCockpitFocus}
          onDetachRegion={onDetachCockpitRegion}
        />
      ) : (
      <>
      <section className="primary-pane" key={snapshot.provider}>
        <header className="card-header">
          <div>
            <p className="eyebrow">{snapshot.displayName} · {snapshot.plan ?? t.accountFallback}</p>
            <div className="metric-context">
              {snapshot.status !== "stale" ? <p className="updated">{metricTitle}</p> : null}
              {resetMarker ? <span className="recent-reset" title={t.resetDetectedAt(formatDateTime(resetMarker.resetAt, language))}><ClockCounterClockwise weight="bold" />{t.recentlyReset}</span> : null}
              {visibleResetForecast ? (
                <button
                  type="button"
                  className={`reset-forecast${visibleResetForecast.resetAnnounced ? " reset-forecast--announced" : ""}`}
                  title={resetForecastTitle(language, visibleResetForecast)}
                  aria-label={resetForecastTitle(language, visibleResetForecast)}
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={() => onOpenResetForecast(visibleResetForecast.sourceUrl)}
                >
                  <Gauge weight="bold" />
                  <span className="reset-forecast-copy">
                    <small>{language === "en" ? "Unofficial outlook" : "非官方重置展望"}</small>
                    <strong>{resetForecastLabel(language, visibleResetForecast.score, visibleResetForecast.windowHours, visibleResetForecast.resetAnnounced)}</strong>
                  </span>
                </button>
              ) : null}
            </div>
          </div>
        </header>

        {available && (quotaWindows.length > 0 || balance !== null) ? (
          <>
            {showQuotaWindowList ? (
              <QuotaWindowList windows={quotaWindows} provider={snapshot.provider} language={language} paceBaselines={paceBaselines} />
            ) : (
              <>
                <section className="primary-metric" aria-label={metricLabel ?? undefined}>
                  <span>{singleRemaining ?? formattedBalance}</span><small>{singleRemaining !== null ? "%" : unlimited ? "" : ` ${snapshot.balanceUnit ?? ""}`}</small>
                </section>
                {singleRemaining !== null && singleQuotaWindow ? <div className="progress" role="progressbar" aria-label={quotaAvailableLabel(singleQuotaWindow.period, singleRemaining, language)} aria-valuemin={0} aria-valuemax={100} aria-valuenow={singleRemaining}>
                  <span style={{ width: `${singleRemaining}%` }} />
                </div> : null}
                <p className="reset-time">{singleQuotaWindow ? formatResetTime(singleQuotaWindow.window.resetsAt, new Date(), language) : unlimited ? unlimitedLabel : snapshot.balanceUnit ?? ""}</p>
                {singleWindowPace ? <QuotaPaceHint pace={singleWindowPace} language={language} provider={snapshot.provider} /> : balance !== null && !unlimited ? (
                  <div className="quota-pace-hint quota-pace-hint--unknown" role="status"><span><ClockCounterClockwise />{t.paceNeedsPeriod}</span></div>
                ) : null}
              </>
            )}
            <footer className={`primary-footer${showQuotaWindowList ? " primary-footer--windows" : ""}`}>
              {!showQuotaWindowList && (singleQuotaWindow?.period === "weekly" || snapshot.resetCredits !== null) ? <div className="quota-meta">
                {singleQuotaWindow?.period === "weekly" ? <p>{t.weeklyResetDate(formatResetDate(singleQuotaWindow.window.resetsAt, language))}</p> : null}
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
              {!showQuotaWindowList ? <ProviderMark provider={snapshot.provider} label={snapshot.displayName} /> : null}
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
          <p>{t.allServices}<span>{providerDefinitions.length}/{PROVIDER_CATALOG.length}</span>{preferences.riskFirst ? <b>{language === "en" ? "RISK FIRST" : "风险优先"}</b> : null}</p>
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
              sortable={!preferences.locked && !preferences.riskFirst}
              dragging={draggedProvider === definition.id}
              dragTarget={dragTargetProvider === definition.id && draggedProvider !== definition.id}
              dragAfter={dragTargetAfter}
              onReorderPointerDown={(event, provider) => {
                if (event.button !== 0) return;
                event.preventDefault();
                event.stopPropagation();
                const pointerId = event.pointerId ?? 1;
                providerPointerDrag.current = { source: provider, target: provider, after: false, pointerId };
                setDraggedProvider(provider);
                setDragTargetProvider(provider);
                setDragTargetAfter(false);
                event.currentTarget.setPointerCapture?.(pointerId);
              }}
              onReorderPointerMove={updateProviderPointerDrag}
              onReorderPointerUp={(event) => finishProviderPointerDrag(event, false)}
              onReorderPointerCancel={(event) => finishProviderPointerDrag(event, true)}
              onMove={moveProvider}
              condensed={preferences.collapsedProviders.includes(definition.id)}
              history={percentageHistoryByProvider.get(definition.id) ?? []}
              showHistory={preferences.showHistorySparklines}
              preferRisk={preferences.riskFirst}
            />
          ))}
        </div>
      </aside>
      </>
      )}
      </div>

      <div
        className="quota-tab-panel quota-tab-panel--insights"
        id={insightsPanelId}
        role="tabpanel"
        aria-labelledby={insightsTabId}
        hidden={!insightsOpen}
        aria-hidden={overlayOpen || undefined}
        inert={overlayOpen || undefined}
      >
        {insightsOpen ? <Suspense fallback={<div className="usage-chart-empty" role="status">{language === "en" ? "Loading usage insights…" : "正在加载用量洞察…"}</div>}>
          <UsageInsightsPanel
            snapshot={snapshot}
            snapshots={snapshots}
            history={history}
            dailyUsage={dailyUsage}
            paceBaselines={paceBaselines}
            language={language}
            preferences={preferences}
            resetForecast={visibleResetForecast}
            onSelectProvider={onSelectProvider}
            onPreferences={onPreferences}
            onOpenResetForecast={onOpenResetForecast}
          />
        </Suspense> : null}
      </div>
      </div>
    </main>
  );
});

export const QuotaOrb = memo(function QuotaOrb({ snapshot, onDrag, onHover, language = "zh-CN", compactLayout = "float", colorTheme = "aurora", accentColor = "#397ae0", resolvedAppearance = "light" }: Pick<Props, "snapshot" | "onDrag" | "onHover"> & { language?: Language; compactLayout?: CompactLayout; colorTheme?: ColorTheme; accentColor?: string; resolvedAppearance?: ResolvedAppearance }) {
  const [idle, setIdle] = useState(false);
  const idleTimer = useRef<number | null>(null);
  const activeLanguage = normalizeLanguage(language);
  const t = copy[activeLanguage];
  const quotaWindows = trackedQuotaWindows(snapshot);
  const orbQuota = quotaWindows.find(({ period }) => period === "weekly") ?? quotaWindows[0] ?? null;
  const remaining = orbQuota ? clampPercent(orbQuota.window.remainingPercent) : null;
  const balance = snapshot.balanceRemaining ?? null;
  const unlimited = snapshot.balanceUnit === "unlimited";
  const compactBalance = unlimited
    ? "∞"
    : balance !== null
    ? new Intl.NumberFormat(activeLanguage === "en" ? "en-US" : "zh-CN", { notation: "compact", maximumFractionDigits: 1 }).format(balance)
    : null;
  const tier = quotaTier(remaining);
  const staleAge = Date.now() - new Date(snapshot.updatedAt).getTime();
  const staleUsable = snapshot.status === "stale" && Number.isFinite(staleAge) && staleAge <= 30 * 60_000;
  const available = (snapshot.status === "ok" || staleUsable) && (remaining !== null || balance !== null);
  const compactProgress = remaining ?? (available ? 100 : 0);
  const accessibleLabel = remaining !== null && orbQuota
    ? quotaAvailableLabel(orbQuota.period, remaining, activeLanguage)
    : unlimited
      ? (activeLanguage === "en" ? "Unlimited" : "不限量")
    : `${balance} ${snapshot.balanceUnit ?? ""}`.trim();

  const scheduleIdle = () => {
    if (idleTimer.current !== null) window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => setIdle(true), 2000);
  };

  useEffect(() => {
    scheduleIdle();
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
      className={`quota-orb quota-card--${snapshot.status} quota-card--${tier} quota-card--compact-${compactLayout} quota-card--style-${colorTheme} quota-card--theme-${resolvedAppearance}${idle ? " quota-orb--idle" : ""}`}
      style={{ "--accent-color": accentColor, "--quota-progress-angle": `${Math.round(compactProgress * 36) / 10}deg` } as CSSProperties}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => { onHover(false); scheduleIdle(); }}
      onMouseDown={(event) => { if (event.button === 0) void onDrag(); }}
      aria-label={available ? `${staleUsable ? `${t.dataStale} · ` : ""}${accessibleLabel}` : localizedBackendMessage(snapshot.message, activeLanguage, snapshot.displayName) ?? t.unavailableStatus}
    >
      <div className="aurora" aria-hidden="true" />
      {available ? (
        <section className="orb-metric">
          <span>{remaining ?? compactBalance}</span>
          <small>{remaining !== null ? "%" : !unlimited && snapshot.balanceUnit === "credits" ? "cr" : ""}</small>
        </section>
      ) : (
        <section className="orb-unavailable">
          <StatusIcon status={snapshot.status} />
        </section>
      )}
    </main>
  );
});

function compactResetTime(value: string | null, now = new Date()): string {
  if (!value) return "—";
  const remaining = Math.max(0, new Date(value).getTime() - now.getTime());
  if (!Number.isFinite(remaining)) return "—";
  const minutes = Math.max(1, Math.ceil(remaining / 60_000));
  const hours = Math.floor(minutes / 60);
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

function compactFreshness(value: string, now = new Date()): string {
  const elapsed = Math.max(0, now.getTime() - new Date(value).getTime());
  if (!Number.isFinite(elapsed)) return "—";
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h`;
}

interface QuotaBarProps {
  snapshot: ProviderSnapshot;
  snapshots: ProviderSnapshot[];
  edge: BarEdge;
  language?: Language;
  colorTheme?: ColorTheme;
  accentColor?: string;
  resolvedAppearance?: ResolvedAppearance;
  onSelectProvider: (provider: ProviderId) => void;
  onDrag: () => void;
  onHover: (hovered: boolean) => void;
}

export const QuotaBar = memo(function QuotaBar({
  snapshot,
  snapshots,
  edge,
  language = "zh-CN",
  colorTheme = "aurora",
  accentColor = "#397ae0",
  resolvedAppearance = "dark",
  onSelectProvider,
  onDrag,
  onHover,
}: QuotaBarProps) {
  const hoverTimer = useRef<number | null>(null);
  const activeLanguage = normalizeLanguage(language);
  const quotaWindows = trackedQuotaWindows(snapshot);
  const quota = quotaWindows.find(({ period }) => period === "weekly") ?? quotaWindows[0] ?? null;
  const remaining = quota ? clampPercent(quota.window.remainingPercent) : null;
  const balance = snapshot.balanceRemaining ?? null;
  const unlimited = snapshot.balanceUnit === "unlimited";
  const compactBalance = balance === null
    ? null
    : new Intl.NumberFormat(activeLanguage === "en" ? "en-US" : "zh-CN", { notation: "compact", maximumFractionDigits: 1 }).format(balance);
  const value = remaining !== null ? `${remaining}%` : unlimited ? "∞" : compactBalance ?? "—";
  const suffix = remaining !== null
    ? (activeLanguage === "en" ? "left" : "剩余")
    : snapshot.balanceUnit === "credits"
      ? "cr"
      : "";
  const healthy = snapshot.status === "ok";
  const status = healthy
    ? (activeLanguage === "en" ? "On track" : "正常")
    : snapshot.status === "stale"
      ? (activeLanguage === "en" ? "Stale" : "过期")
      : activeLanguage === "en" ? "Attention" : "需处理";
  const providers = snapshots.map((item) => ({ id: item.provider, label: item.displayName }));
  const progress = remaining ?? (unlimited ? 100 : 0);

  const cancelHover = () => {
    if (hoverTimer.current !== null) {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  };

  const scheduleHover = () => {
    if (hoverTimer.current !== null) return;
    hoverTimer.current = window.setTimeout(() => onHover(true), 650);
  };

  useEffect(() => () => cancelHover(), []);

  return (
    <main
      className={`quota-bar quota-bar--${edge} quota-card--${snapshot.status} quota-card--${quotaTier(remaining)} quota-card--compact-bar quota-card--style-${colorTheme} quota-card--theme-${resolvedAppearance}`}
      style={{ "--accent-color": accentColor, "--bar-progress": `${progress}%` } as CSSProperties}
      onMouseOver={(event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest(".provider-logo-slider")) {
          cancelHover();
          return;
        }
        scheduleHover();
      }}
      onMouseLeave={() => {
        cancelHover();
        onHover(false);
      }}
      onMouseDown={(event) => { if (event.button === 0) void onDrag(); }}
      aria-label={`${snapshot.displayName} ${value} ${suffix} ${status}`.trim()}
    >
      <ProviderLogoSlider
        providers={providers}
        selected={snapshot.provider}
        onSelect={(provider) => {
          cancelHover();
          onSelectProvider(provider);
        }}
        ariaLabel={activeLanguage === "en" ? "Choose provider" : "选择平台"}
        compact
        orientation={edge === "top" ? "horizontal" : "vertical"}
      />
      <span className="bar-divider" aria-hidden="true" />
      <section className="bar-metric">
        <strong>{snapshot.displayName}</strong>
        <b>{value}</b>
        {suffix ? <small>{suffix}</small> : null}
      </section>
      <span className="bar-reset">{quota ? compactResetTime(quota.window.resetsAt) : snapshot.balanceUnit ?? "—"}</span>
      <span className={`bar-status bar-status--${healthy ? "ok" : "attention"}`}><i />{status}</span>
      <span className="bar-freshness">{compactFreshness(snapshot.updatedAt)}</span>
      <span className="bar-progress" aria-hidden="true"><i /></span>
    </main>
  );
});

function bottleneckMetric(snapshot: ProviderSnapshot, language: Language): { value: string; detail: string; progress: number } {
  const activeLanguage = normalizeLanguage(language);
  if (snapshot.status === "signed_out") return { value: "!", detail: activeLanguage === "en" ? "Sign-in required" : "需要登录", progress: 0 };
  if (snapshot.status === "unavailable") return { value: "!", detail: activeLanguage === "en" ? "Unavailable" : "不可用", progress: 0 };
  if (snapshot.status === "loading") return { value: "…", detail: activeLanguage === "en" ? "Loading" : "读取中", progress: 0 };
  const windows = trackedQuotaWindows(snapshot);
  const tightest = windows.reduce<NamedQuotaWindow | null>((current, candidate) => (
    current === null || candidate.window.remainingPercent < current.window.remainingPercent ? candidate : current
  ), null);
  if (tightest) {
    const remaining = clampPercent(tightest.window.remainingPercent);
    const period = tightest.period === "5h" ? (activeLanguage === "en" ? "5 hours" : "5 小时") : tightest.period === "weekly" ? (activeLanguage === "en" ? "Week" : "本周") : (activeLanguage === "en" ? "Month" : "本月");
    return { value: `${remaining}%`, detail: period, progress: remaining };
  }
  if (snapshot.balanceUnit === "unlimited") return { value: "∞", detail: activeLanguage === "en" ? "Unlimited" : "不限量", progress: 100 };
  if (snapshot.balanceRemaining !== null && snapshot.balanceRemaining !== undefined) {
    const value = new Intl.NumberFormat(activeLanguage === "en" ? "en-US" : "zh-CN", { notation: "compact", maximumFractionDigits: 1 }).format(snapshot.balanceRemaining);
    return { value, detail: snapshot.balanceUnit ?? (activeLanguage === "en" ? "Balance" : "余额"), progress: 100 };
  }
  return { value: "—", detail: activeLanguage === "en" ? "No window" : "暂无周期", progress: 0 };
}

export const QuotaBottleneckBar = memo(function QuotaBottleneckBar({
  snapshot,
  snapshots,
  edge,
  language = "zh-CN",
  colorTheme = "aurora",
  accentColor = "#397ae0",
  resolvedAppearance = "dark",
  onSelectProvider,
  onDrag,
  onHover,
}: QuotaBarProps) {
  const hoverTimer = useRef<number | null>(null);
  const activeLanguage = normalizeLanguage(language);
  const sortedIds = sortProviderIdsByRisk(snapshots.map((item) => item.provider), snapshots);
  const snapshotsByProvider = new Map(snapshots.map((item) => [item.provider, item]));
  const orderedSnapshots = sortedIds.map((provider) => snapshotsByProvider.get(provider)!).filter(Boolean);
  const lead = orderedSnapshots[0] ?? snapshot;
  const leadMetric = bottleneckMetric(lead, activeLanguage);
  const leadRemaining = snapshotRemainingPercent(lead);
  const expandLabel = activeLanguage === "en" ? "Expand bottleneck details" : "展开瓶颈详情";

  const cancelHover = () => {
    if (hoverTimer.current !== null) {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  };
  const scheduleHover = () => {
    if (hoverTimer.current !== null) return;
    hoverTimer.current = window.setTimeout(() => onHover(true), 650);
  };
  useEffect(() => () => cancelHover(), []);

  return (
    <main
      className={`quota-bar quota-bottleneck-bar quota-bar--${edge} quota-card--${lead.status} quota-card--${quotaTier(leadRemaining)} quota-card--compact-bottleneck quota-card--style-${colorTheme} quota-card--theme-${resolvedAppearance}`}
      style={{ "--accent-color": accentColor, "--bar-progress": `${leadMetric.progress}%`, "--bottleneck-count": orderedSnapshots.length } as CSSProperties}
      onMouseOver={(event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest(".bottleneck-provider-list")) {
          cancelHover();
          return;
        }
        scheduleHover();
      }}
      onMouseLeave={() => {
        cancelHover();
        onHover(false);
      }}
      onMouseDown={(event) => { if (event.button === 0) void onDrag(); }}
      aria-label={`${activeLanguage === "en" ? "Most constrained" : "最紧张额度"}: ${lead.displayName} ${leadMetric.value} ${leadMetric.detail}`}
    >
      <section className="bottleneck-provider-list" role="radiogroup" aria-label={activeLanguage === "en" ? "Providers by quota risk" : "按额度风险排列的平台"}>
        {orderedSnapshots.map((item, index) => {
          const metric = bottleneckMetric(item, activeLanguage);
          const selected = item.provider === snapshot.provider;
          return (
            <button
              type="button"
              role="radio"
              aria-checked={selected}
              className={`${selected ? "is-active" : ""}${index === 0 ? " is-bottleneck" : ""}`}
              key={item.provider}
              title={`${item.displayName} · ${metric.detail} · ${metric.value}`}
              aria-label={`${item.displayName} · ${metric.detail} · ${metric.value}`}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={() => {
                cancelHover();
                onSelectProvider(item.provider);
              }}
            >
              <ProviderMark provider={item.provider} label={item.displayName} />
              <span>{metric.value}</span>
            </button>
          );
        })}
      </section>
      <button
        type="button"
        className="bottleneck-summary"
        aria-label={expandLabel}
        title={expandLabel}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={() => onHover(true)}
      >
        <span><small>{activeLanguage === "en" ? "Most constrained" : "最紧张"}</small><strong>{lead.displayName}</strong></span>
        <b>{leadMetric.value}</b>
        <ArrowSquareOut />
      </button>
      <span className="bar-progress" aria-hidden="true"><i /></span>
    </main>
  );
});

import { ArrowClockwise, ArrowCounterClockwise, Bell, ChartLineUp, ClockCounterClockwise, DownloadSimple, Eye, EyeSlash, Heartbeat, Layout, ListStar, Monitor, Moon, Plus, Sun, Trash, UploadSimple, X } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { useModalDialog } from "../lib/modalDialog";
import { DEFAULT_PROVIDER_ORDER, PROVIDER_CATALOG } from "../lib/providers";
import type { AppDiagnostics, Language, ProviderId, ProviderSnapshot, RuntimeState, SavedLayout, SnapshotStatus, WidgetPreferences } from "../types";
import { ProviderMark } from "./ProviderMark";

type Tab = "display" | "health" | "alerts" | "activity" | "system";

interface Props {
  preferences: WidgetPreferences;
  runtimeState: RuntimeState;
  snapshots: ProviderSnapshot[];
  diagnostics: AppDiagnostics | null;
  language: Language;
  onClose: () => void;
  onRefresh: () => void;
  onPreferences: (value: WidgetPreferences) => void;
  onRuntimeState: (value: RuntimeState) => void;
  onExport: () => void;
  onImport: () => void;
  onRestore: () => void;
  onCopyDiagnostics: () => void;
  autostartEnabled: boolean;
  onAutostart: (enabled: boolean) => void;
}

function toggleProvider(values: ProviderId[], provider: ProviderId): ProviderId[] {
  return values.includes(provider) ? values.filter((item) => item !== provider) : [...values, provider];
}

function formatCheckedAt(value: string | undefined, language: Language, fallback: string): string {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat(language === "en" ? "en" : "zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function ControlCenter({ preferences, runtimeState, snapshots, diagnostics, language, onClose, onRefresh, onPreferences, onRuntimeState, onExport, onImport, onRestore, onCopyDiagnostics, autostartEnabled, onAutostart }: Props) {
  const dialogRef = useModalDialog<HTMLElement>(onClose);
  const [tab, setTab] = useState<Tab>("display");
  const [layoutName, setLayoutName] = useState("");
  const zh = language !== "en";
  const labels = zh ? {
    title: "控制中心", subtitle: "显示、提醒、历史与恢复", display: "显示", alerts: "提醒", activity: "历史", system: "系统",
    layout: "信息密度", compact: "紧凑", standard: "标准", detailed: "详细", accent: "强调色", rotate: "轮换间隔",
    providers: "平台显示", hidden: "已隐藏", collapsed: "精简行", resetOrder: "恢复默认排序", savedLayouts: "布局方案", saveLayout: "保存当前布局", noLayouts: "尚未保存布局方案",
    notifications: "桌面提醒", threshold: "低额度阈值", resetAlert: "额度重置提醒", recoveryAlert: "恢复可用提醒", quiet: "勿扰时段", cooldown: "重复提醒冷却", minutes: "分钟",
    events: "最近事件", noEvents: "还没有额度变化事件", history: "历史采样", samples: "条采样", memoryTitle: "本地用量记忆", memoryEmpty: "首次刷新后开始记录", memoryRetention: "90 天详细记录 · 365 天每日汇总", lifetimeSamples: "累计采样",
    update: "更新策略", channel: "更新通道", autoUpdate: "后台自动检查和下载", autostart: "登录系统后自动启动", stable: "稳定版", beta: "测试版（手动安装）",
    diagnostics: "应用诊断", copy: "复制诊断报告", backup: "备份与迁移", export: "导出设置与历史", import: "导入备份", restore: "恢复最近自动备份",
  } : {
    title: "Control center", subtitle: "Display, alerts, history, and recovery", display: "Display", alerts: "Alerts", activity: "Activity", system: "System",
    layout: "Information density", compact: "Compact", standard: "Standard", detailed: "Detailed", accent: "Accent color", rotate: "Rotation interval",
    providers: "Provider visibility", hidden: "Hidden", collapsed: "Condensed row", resetOrder: "Reset default order", savedLayouts: "Layout profiles", saveLayout: "Save current layout", noLayouts: "No layout profiles saved",
    notifications: "Desktop alerts", threshold: "Low-quota threshold", resetAlert: "Quota reset alerts", recoveryAlert: "Provider recovery alerts", quiet: "Quiet hours", cooldown: "Repeat-alert cooldown", minutes: "minutes",
    events: "Recent events", noEvents: "No quota change events yet", history: "History samples", samples: "samples", memoryTitle: "Local usage memory", memoryEmpty: "Starts after the first refresh", memoryRetention: "90-day detail · 365-day daily summaries", lifetimeSamples: "Lifetime samples",
    update: "Update policy", channel: "Update channel", autoUpdate: "Check and download in background", autostart: "Launch after system sign-in", stable: "Stable", beta: "Beta (manual install)",
    diagnostics: "App diagnostics", copy: "Copy diagnostic report", backup: "Backup and migration", export: "Export settings and history", import: "Import backup", restore: "Restore latest automatic backup",
  };
  const healthLabels = zh ? {
    tab: "状态",
    title: "平台状态",
    summary: "个平台连接正常",
    attention: "需要处理",
    allHealthy: "所有已检测平台均已正常刷新。",
    refresh: "立即刷新",
    checked: "最近检查",
    neverChecked: "尚未检查",
    samples: "条采样",
    statuses: {
      ok: "正常",
      stale: "数据过期",
      loading: "检查中",
      unavailable: "不可用",
      signed_out: "需要登录",
    } satisfies Record<SnapshotStatus, string>,
    defaults: {
      ok: "最近一次额度刷新已完成。",
      stale: "正在显示最近一次有效数据。",
      loading: "正在等待平台响应。",
      unavailable: "未检测到平台，或平台暂时不可用。",
      signed_out: "请在对应应用或 CLI 中重新登录。",
    } satisfies Record<SnapshotStatus, string>,
  } : {
    tab: "Health",
    title: "Provider health",
    summary: "providers connected",
    attention: "need attention",
    allHealthy: "Every detected provider refreshed successfully.",
    refresh: "Refresh now",
    checked: "Last checked",
    neverChecked: "Not checked yet",
    samples: "samples",
    statuses: {
      ok: "Healthy",
      stale: "Stale",
      loading: "Checking",
      unavailable: "Unavailable",
      signed_out: "Sign-in required",
    } satisfies Record<SnapshotStatus, string>,
    defaults: {
      ok: "Latest quota refresh completed.",
      stale: "Showing the last known good data.",
      loading: "Waiting for the provider response.",
      unavailable: "Provider is not detected or temporarily unavailable.",
      signed_out: "Sign in again through the provider app or CLI.",
    } satisfies Record<SnapshotStatus, string>,
  };
  const appearanceLabels = zh ? {
    appearance: "全局外观",
    appearanceHint: "适用于所有悬浮窗风格，切换风格后保持当前选择",
    system: "跟随系统",
    light: "浅色",
    dark: "深色",
    style: "视觉风格",
    float: "Float",
    floatHint: "紧凑方块与即时状态",
    aurora: "极光",
    auroraHint: "柔和玻璃与动态色彩",
    graphite: "石墨",
    graphiteHint: "深色高对比工作台",
    paper: "纸面",
    paperHint: "温暖、克制、低干扰",
    riskFirst: "优先显示需要关注的平台",
    riskFirstHint: "按状态与最低剩余额度排序；关闭后恢复自定义顺序",
    history: "显示最近额度轨迹",
    historyHint: "在平台行中显示本地历史微型图",
  } : {
    appearance: "Global appearance",
    appearanceHint: "Applies to every widget style and stays selected when styles change",
    system: "System",
    light: "Light",
    dark: "Dark",
    style: "Visual style",
    float: "Float",
    floatHint: "Compact tile with instant status",
    aurora: "Aurora",
    auroraHint: "Soft glass with ambient color",
    graphite: "Graphite",
    graphiteHint: "Dark, high-contrast workstation",
    paper: "Paper",
    paperHint: "Warm, restrained, low-distraction",
    riskFirst: "Put attention-needed providers first",
    riskFirstHint: "Sort by status and lowest quota; disable to restore custom order",
    history: "Show recent quota trails",
    historyHint: "Draw local-history sparklines inside provider rows",
  };
  const customizationLabels = zh ? {
    layoutSection: "布局",
    layoutHint: "小组件与展开面板可分别选择布局",
    compactLayout: "小组件",
    expandedLayout: "展开面板",
    float: "浮窗",
    floatHint: "紧凑方形指标",
    ring: "圆环",
    ringHint: "环形进度指标",
    bar: "横条",
    barHint: "可磁吸顶部或左右边缘",
    barEdge: "横条吸附边缘",
    barEdgeHint: "拖动横条靠近另一边缘也会更新此选项",
    top: "顶部",
    left: "左侧",
    right: "右侧",
    dashboard: "仪表板",
    dashboardHint: "指标与平台列表",
    providerBar: "平台栏",
    providerBarHint: "强化完整平台列表",
    stacked: "纵向堆叠",
    stackedHint: "主指标位于平台列表上方",
    colorSection: "颜色",
    colorHint: "颜色主题适用于所有布局",
    colorTheme: "颜色主题",
    accent: "强调色",
    aurora: "极光",
    auroraHint: "柔和玻璃与环境色",
    graphite: "石墨",
    graphiteHint: "高对比工作台",
    paper: "纸面",
    paperHint: "温暖克制的纸张质感",
  } : {
    layoutSection: "Layout",
    layoutHint: "Choose compact and expanded layouts independently",
    compactLayout: "Small widget",
    expandedLayout: "Expanded widget",
    float: "Float",
    floatHint: "Compact square metric",
    ring: "Ring",
    ringHint: "Circular progress metric",
    bar: "Bar",
    barHint: "Magnetic top or side rail",
    barEdge: "Bar attachment edge",
    barEdgeHint: "Dragging the Bar near another edge updates this choice",
    top: "Top",
    left: "Left",
    right: "Right",
    dashboard: "Dashboard",
    dashboardHint: "Metric and provider ledger",
    providerBar: "Provider bar",
    providerBarHint: "Emphasizes the full provider ledger",
    stacked: "Stacked",
    stackedHint: "Metric above the provider ledger",
    colorSection: "Color",
    colorHint: "Color themes apply to every layout",
    colorTheme: "Color theme",
    accent: "Accent color",
    aurora: "Aurora",
    auroraHint: "Soft glass with ambient color",
    graphite: "Graphite",
    graphiteHint: "High-contrast workstation",
    paper: "Paper",
    paperHint: "Warm, restrained paper texture",
  };

  const historyCounts = useMemo(() => new Map(PROVIDER_CATALOG.map((provider) => [provider.id, runtimeState.history.filter((point) => point.provider === provider.id).length])), [runtimeState.history]);
  const snapshotsByProvider = useMemo(() => new Map(snapshots.map((snapshot) => [snapshot.provider, snapshot])), [snapshots]);
  const healthyProviderCount = useMemo(() => snapshots.filter((snapshot) => snapshot.status === "ok").length, [snapshots]);
  const attentionProviderCount = Math.max(0, PROVIDER_CATALOG.length - healthyProviderCount);
  const memoryRange = runtimeState.usageMemory.firstCapturedAt && runtimeState.usageMemory.lastCapturedAt
    ? `${formatCheckedAt(runtimeState.usageMemory.firstCapturedAt, language, labels.memoryEmpty)} — ${formatCheckedAt(runtimeState.usageMemory.lastCapturedAt, language, labels.memoryEmpty)}`
    : labels.memoryEmpty;

  const saveLayout = () => {
    const name = layoutName.trim() || `${zh ? "布局" : "Layout"} ${runtimeState.savedLayouts.length + 1}`;
    const saved: SavedLayout = {
      id: crypto.randomUUID(), name, createdAt: new Date().toISOString(), providerOrder: preferences.providerOrder ?? DEFAULT_PROVIDER_ORDER,
      hiddenProviders: preferences.hiddenProviders, collapsedProviders: preferences.collapsedProviders, layoutMode: preferences.layoutMode, accentColor: preferences.accentColor,
      compactLayout: preferences.compactLayout, barEdge: preferences.barEdge, barOffset: preferences.barOffset, expandedLayout: preferences.expandedLayout, colorTheme: preferences.colorTheme,
      appearanceMode: preferences.appearanceMode, riskFirst: preferences.riskFirst, showHistorySparklines: preferences.showHistorySparklines,
    };
    onRuntimeState({ ...runtimeState, savedLayouts: [...runtimeState.savedLayouts, saved].slice(-12) });
    setLayoutName("");
  };

  return (
    <section ref={dialogRef} className="control-center" role="dialog" aria-modal="true" aria-labelledby="control-center-title" tabIndex={-1} onMouseDown={(event) => event.stopPropagation()}>
      <header className="control-header">
        <div><p>QUOTA FLOAT · LOCAL FIRST</p><h2 id="control-center-title">{labels.title}</h2><small>{labels.subtitle}</small></div>
        <button type="button" onClick={onClose} aria-label="Close" data-dialog-initial-focus><X /></button>
      </header>
      <nav className="control-tabs" aria-label={labels.title}>
        {([['display', Layout, labels.display], ['health', Heartbeat, healthLabels.tab], ['alerts', Bell, labels.alerts], ['activity', ClockCounterClockwise, labels.activity], ['system', Heartbeat, labels.system]] as const).map(([id, Icon, label]) => (
          <button key={id} type="button" className={tab === id ? "is-active" : ""} onClick={() => setTab(id)}><Icon /><span>{label}</span></button>
        ))}
      </nav>

      <div className="control-body">
        <div className="control-view" key={tab}>
          {tab === "display" ? <>
          <div className="control-grid">
            <label className="control-field"><span>{labels.layout}</span><select value={preferences.layoutMode} onChange={(event) => onPreferences({ ...preferences, layoutMode: event.target.value as WidgetPreferences['layoutMode'] })}><option value="compact">{labels.compact}</option><option value="standard">{labels.standard}</option><option value="detailed">{labels.detailed}</option></select></label>
            <label className="control-field"><span>{labels.rotate} · {preferences.autoRotateSeconds}s</span><input type="range" min="5" max="60" step="1" value={preferences.autoRotateSeconds} onChange={(event) => onPreferences({ ...preferences, autoRotateSeconds: Number(event.target.value) })} /></label>
          </div>
          <div className="control-section-title control-section-title--appearance"><span>{customizationLabels.layoutSection}</span><small>{customizationLabels.layoutHint}</small></div>
          <div className="layout-choice-groups">
            <fieldset className="layout-choice-group">
              <legend>{customizationLabels.compactLayout}</legend>
              <div className="layout-options" role="radiogroup" aria-label={customizationLabels.compactLayout}>
                {([
                  ["float", customizationLabels.float, customizationLabels.floatHint],
                  ["ring", customizationLabels.ring, customizationLabels.ringHint],
                  ["bar", customizationLabels.bar, customizationLabels.barHint],
                ] as const).map(([id, label, hint]) => (
                  <button key={id} type="button" role="radio" aria-checked={preferences.compactLayout === id} className={`layout-option layout-option--${id}${preferences.compactLayout === id ? " is-active" : ""}`} onClick={() => onPreferences({ ...preferences, compactLayout: id })}>
                    <i aria-hidden="true">{id === "float" ? <span className="layout-float-value">67<small>%</small></span> : id === "ring" ? <span className="layout-ring-value">67<small>%</small></span> : <><ProviderMark provider="codex" label="Codex" /><span className="layout-bar-value">74%</span></>}</i>
                    <span><strong>{label}</strong><small>{hint}</small></span>
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset className="layout-choice-group">
              <legend>{customizationLabels.expandedLayout}</legend>
              <div className="layout-options" role="radiogroup" aria-label={customizationLabels.expandedLayout}>
                {([
                  ["dashboard", customizationLabels.dashboard, customizationLabels.dashboardHint],
                  ["provider-bar", customizationLabels.providerBar, customizationLabels.providerBarHint],
                  ["stacked", customizationLabels.stacked, customizationLabels.stackedHint],
                ] as const).map(([id, label, hint]) => (
                  <button key={id} type="button" role="radio" aria-checked={preferences.expandedLayout === id} className={`layout-option layout-option--${id}${preferences.expandedLayout === id ? " is-active" : ""}`} onClick={() => onPreferences({ ...preferences, expandedLayout: id })}>
                    <i aria-hidden="true"><b /><span /><span /><span /></i>
                    <span><strong>{label}</strong><small>{hint}</small></span>
                  </button>
                ))}
              </div>
            </fieldset>
          </div>
          {preferences.compactLayout === "bar" ? (
            <fieldset className="bar-edge-choice">
              <legend><span>{customizationLabels.barEdge}</span><small>{customizationLabels.barEdgeHint}</small></legend>
              <div className="bar-edge-options" role="radiogroup" aria-label={customizationLabels.barEdge}>
                {(["top", "left", "right"] as const).map((edge) => (
                  <button key={edge} type="button" role="radio" aria-checked={preferences.barEdge === edge} className={`bar-edge-option bar-edge-option--${edge}${preferences.barEdge === edge ? " is-active" : ""}`} onClick={() => onPreferences({ ...preferences, barEdge: edge })}>
                    <i aria-hidden="true"><span /><b /></i><strong>{customizationLabels[edge]}</strong>
                  </button>
                ))}
              </div>
            </fieldset>
          ) : null}
          <div className="control-section-title control-section-title--appearance"><span>{customizationLabels.colorSection}</span><small>{customizationLabels.colorHint}</small></div>
          <div className="appearance-options" role="radiogroup" aria-label={appearanceLabels.appearance}>
            {([
              ["system", Monitor, appearanceLabels.system],
              ["light", Sun, appearanceLabels.light],
              ["dark", Moon, appearanceLabels.dark],
            ] as const).map(([id, Icon, label]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={preferences.appearanceMode === id}
                className={preferences.appearanceMode === id ? "is-active" : ""}
                onClick={() => onPreferences({ ...preferences, appearanceMode: id })}
              >
                <Icon />
                <span>{label}</span>
              </button>
            ))}
          </div>
          <div className="color-theme-options" role="radiogroup" aria-label={customizationLabels.colorTheme}>
            {([
              ["aurora", customizationLabels.aurora, customizationLabels.auroraHint],
              ["graphite", customizationLabels.graphite, customizationLabels.graphiteHint],
              ["paper", customizationLabels.paper, customizationLabels.paperHint],
            ] as const).map(([id, label, hint]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={preferences.colorTheme === id}
                className={`color-theme-option color-theme-option--${id}${preferences.colorTheme === id ? " is-active" : ""}`}
                onClick={() => onPreferences({ ...preferences, colorTheme: id })}
              >
                <i aria-hidden="true"><span /><span /><span /></i>
                <span><strong>{label}</strong><small>{hint}</small></span>
              </button>
            ))}
          </div>
          <label className="control-field color-accent-field"><span>{customizationLabels.accent}</span><input type="color" value={preferences.accentColor} onChange={(event) => onPreferences({ ...preferences, accentColor: event.target.value })} /></label>
          <div className="display-feature-options">
            <label className="display-feature-option"><ListStar /><span><strong>{appearanceLabels.riskFirst}</strong><small>{appearanceLabels.riskFirstHint}</small></span><span className="switch"><input type="checkbox" checked={preferences.riskFirst} onChange={(event) => onPreferences({ ...preferences, riskFirst: event.target.checked })} /><i /></span></label>
            <label className="display-feature-option"><ChartLineUp /><span><strong>{appearanceLabels.history}</strong><small>{appearanceLabels.historyHint}</small></span><span className="switch"><input type="checkbox" checked={preferences.showHistorySparklines} onChange={(event) => onPreferences({ ...preferences, showHistorySparklines: event.target.checked })} /><i /></span></label>
          </div>
          <div className="control-section-title"><span>{labels.providers}</span><button type="button" onClick={() => onPreferences({ ...preferences, providerOrder: DEFAULT_PROVIDER_ORDER, hiddenProviders: [], collapsedProviders: [] })}><ArrowCounterClockwise />{labels.resetOrder}</button></div>
          <div className="provider-settings">
            {PROVIDER_CATALOG.map((provider) => {
              const hidden = preferences.hiddenProviders.includes(provider.id);
              const collapsed = preferences.collapsedProviders.includes(provider.id);
              return <div key={provider.id}><strong>{provider.label}</strong><span>{historyCounts.get(provider.id)} {labels.samples}</span><button type="button" className={hidden ? "is-active" : ""} onClick={() => onPreferences({ ...preferences, hiddenProviders: toggleProvider(preferences.hiddenProviders, provider.id) })}>{hidden ? <EyeSlash /> : <Eye />}{hidden ? labels.hidden : zh ? "显示" : "Visible"}</button><button type="button" className={collapsed ? "is-active" : ""} onClick={() => onPreferences({ ...preferences, collapsedProviders: toggleProvider(preferences.collapsedProviders, provider.id) })}><Layout />{labels.collapsed}</button></div>;
            })}
          </div>
          <div className="control-section-title"><span>{labels.savedLayouts}</span></div>
          <div className="layout-save"><input value={layoutName} onChange={(event) => setLayoutName(event.target.value)} placeholder={zh ? "方案名称" : "Profile name"} /><button type="button" onClick={saveLayout}><Plus />{labels.saveLayout}</button></div>
          <div className="saved-layouts">{runtimeState.savedLayouts.length === 0 ? <p>{labels.noLayouts}</p> : runtimeState.savedLayouts.map((layout) => <div key={layout.id}><button type="button" onClick={() => onPreferences({ ...preferences, providerOrder: layout.providerOrder, hiddenProviders: layout.hiddenProviders, collapsedProviders: layout.collapsedProviders, layoutMode: layout.layoutMode, compactLayout: layout.compactLayout, barEdge: layout.barEdge, barOffset: layout.barOffset, expandedLayout: layout.expandedLayout, colorTheme: layout.colorTheme, appearanceMode: layout.appearanceMode, riskFirst: layout.riskFirst, showHistorySparklines: layout.showHistorySparklines, accentColor: layout.accentColor })}><strong>{layout.name}</strong><small>{layout.compactLayout}{layout.compactLayout === "bar" ? `/${layout.barEdge}` : ""} · {layout.expandedLayout} · {layout.colorTheme} · {layout.layoutMode}</small></button><button type="button" aria-label="Delete" onClick={() => onRuntimeState({ ...runtimeState, savedLayouts: runtimeState.savedLayouts.filter((item) => item.id !== layout.id) })}><Trash /></button></div>)}</div>
        </> : null}

          {tab === "health" ? <>
          <div className="provider-health-summary" role="status">
            <Heartbeat weight="duotone" />
            <div>
              <strong>{healthyProviderCount}/{PROVIDER_CATALOG.length} {healthLabels.summary}</strong>
              <p>{attentionProviderCount === 0 ? healthLabels.allHealthy : `${attentionProviderCount} ${healthLabels.attention}`}</p>
            </div>
            <button type="button" onClick={onRefresh}><ArrowClockwise />{healthLabels.refresh}</button>
          </div>
          <div className="control-section-title"><span>{healthLabels.title}</span></div>
          <div className="provider-health-list">
            {PROVIDER_CATALOG.map((provider) => {
              const snapshot = snapshotsByProvider.get(provider.id);
              const status = snapshot?.status ?? "unavailable";
              return (
                <article key={provider.id} className={`provider-health-item provider-health-item--${status}`}>
                  <i aria-hidden="true" />
                  <div className="provider-health-copy">
                    <header><strong>{provider.label}</strong><span>{healthLabels.statuses[status]}</span></header>
                    <p>{snapshot?.message || healthLabels.defaults[status]}</p>
                    <footer>
                      <span>{provider.sourceLabel[language]}</span>
                      <span>{healthLabels.checked}: {formatCheckedAt(snapshot?.updatedAt, language, healthLabels.neverChecked)}</span>
                      <span>{historyCounts.get(provider.id) ?? 0} {healthLabels.samples}</span>
                    </footer>
                  </div>
                </article>
              );
            })}
          </div>
        </> : null}

          {tab === "alerts" ? <>
          <div className="control-section-title"><span>{labels.notifications}</span><label className="switch"><input type="checkbox" checked={preferences.notificationsEnabled} onChange={(event) => onPreferences({ ...preferences, notificationsEnabled: event.target.checked })} /><i /></label></div>
          <div className="control-grid">
            <label className="control-field control-field--wide"><span>{labels.threshold} · {preferences.alertThreshold}%</span><input type="range" min="1" max="50" value={preferences.alertThreshold} onChange={(event) => onPreferences({ ...preferences, alertThreshold: Number(event.target.value) })} /></label>
            <label className="control-check"><input type="checkbox" checked={preferences.notifyOnReset} onChange={(event) => onPreferences({ ...preferences, notifyOnReset: event.target.checked })} /><span>{labels.resetAlert}</span></label>
            <label className="control-check"><input type="checkbox" checked={preferences.notifyOnRecovery} onChange={(event) => onPreferences({ ...preferences, notifyOnRecovery: event.target.checked })} /><span>{labels.recoveryAlert}</span></label>
            <label className="control-field"><span>{labels.quiet}</span><div className="hour-pair"><input type="number" min="0" max="23" value={preferences.quietHoursStart} onChange={(event) => onPreferences({ ...preferences, quietHoursStart: Number(event.target.value) })} /><b>→</b><input type="number" min="0" max="23" value={preferences.quietHoursEnd} onChange={(event) => onPreferences({ ...preferences, quietHoursEnd: Number(event.target.value) })} /></div></label>
            <label className="control-field"><span>{labels.cooldown}</span><select value={preferences.notificationCooldownMinutes} onChange={(event) => onPreferences({ ...preferences, notificationCooldownMinutes: Number(event.target.value) })}><option value="30">30 {labels.minutes}</option><option value="120">120 {labels.minutes}</option><option value="360">360 {labels.minutes}</option><option value="1440">24h</option></select></label>
          </div>
        </> : null}

          {tab === "activity" ? <>
          <div className="history-memory-summary" role="status">
            <ClockCounterClockwise weight="duotone" />
            <div><strong>{labels.memoryTitle}</strong><p>{memoryRange}</p><small>{labels.memoryRetention}</small></div>
            <span><b>{runtimeState.usageMemory.totalSamples.toLocaleString(language === "en" ? "en" : "zh-CN")}</b>{labels.lifetimeSamples}</span>
          </div>
          <div className="control-section-title"><span>{labels.events}</span><small>{runtimeState.history.length} {labels.samples}</small></div>
          <div className="activity-list">{runtimeState.events.length === 0 ? <p>{labels.noEvents}</p> : runtimeState.events.map((item) => <article key={item.id} className={`activity-item activity-item--${item.kind}`}><i /><div><strong>{item.title}</strong><p>{item.detail}</p></div><time>{new Intl.DateTimeFormat(language === "en" ? "en" : "zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(item.occurredAt))}</time></article>)}</div>
        </> : null}

          {tab === "system" ? <>
          <div className="control-section-title"><span>{labels.update}</span></div>
          <div className="control-grid">
            <label className="control-field"><span>{labels.channel}</span><select value={preferences.updateChannel} onChange={(event) => onPreferences({ ...preferences, updateChannel: event.target.value as WidgetPreferences['updateChannel'] })}><option value="stable">{labels.stable}</option><option value="beta">{labels.beta}</option></select></label>
            <label className="control-check"><input type="checkbox" checked={preferences.automaticUpdates} onChange={(event) => onPreferences({ ...preferences, automaticUpdates: event.target.checked })} /><span>{labels.autoUpdate}</span></label>
            <label className="control-check"><input type="checkbox" checked={autostartEnabled} onChange={(event) => onAutostart(event.target.checked)} /><span>{labels.autostart}</span></label>
          </div>
          <div className="control-section-title"><span>{labels.diagnostics}</span></div>
          <div className="diagnostic-summary"><Heartbeat /><div><strong>Quota Float {diagnostics?.appVersion ?? "…"}</strong><p>{diagnostics?.platform ?? "…"} · {diagnostics?.preferencesBackupAvailable || diagnostics?.runtimeBackupAvailable ? (zh ? "恢复点可用" : "Recovery point available") : (zh ? "等待首次备份" : "Awaiting first backup")}</p></div><button type="button" onClick={onCopyDiagnostics}>{labels.copy}</button></div>
          <div className="control-section-title"><span>{labels.backup}</span></div>
          <div className="backup-actions"><button type="button" onClick={onExport}><DownloadSimple />{labels.export}</button><button type="button" onClick={onImport}><UploadSimple />{labels.import}</button><button type="button" onClick={onRestore}><ArrowCounterClockwise />{labels.restore}</button></div>
          </> : null}
        </div>
      </div>
    </section>
  );
}

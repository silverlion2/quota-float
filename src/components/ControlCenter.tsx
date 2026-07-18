import { ArrowCounterClockwise, Bell, ClockCounterClockwise, DownloadSimple, Eye, EyeSlash, Heartbeat, Layout, Plus, Trash, UploadSimple, X } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { DEFAULT_PROVIDER_ORDER, PROVIDER_CATALOG } from "../lib/providers";
import type { AppDiagnostics, Language, ProviderId, RuntimeState, SavedLayout, WidgetPreferences } from "../types";

type Tab = "display" | "alerts" | "activity" | "system";

interface Props {
  preferences: WidgetPreferences;
  runtimeState: RuntimeState;
  diagnostics: AppDiagnostics | null;
  language: Language;
  onClose: () => void;
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

export function ControlCenter({ preferences, runtimeState, diagnostics, language, onClose, onPreferences, onRuntimeState, onExport, onImport, onRestore, onCopyDiagnostics, autostartEnabled, onAutostart }: Props) {
  const [tab, setTab] = useState<Tab>("display");
  const [layoutName, setLayoutName] = useState("");
  const zh = language !== "en";
  const labels = zh ? {
    title: "控制中心", subtitle: "显示、提醒、历史与恢复", display: "显示", alerts: "提醒", activity: "历史", system: "系统",
    layout: "信息密度", compact: "紧凑", standard: "标准", detailed: "详细", accent: "强调色", rotate: "轮换间隔",
    providers: "平台显示", hidden: "已隐藏", collapsed: "精简行", resetOrder: "恢复默认排序", savedLayouts: "布局方案", saveLayout: "保存当前布局", noLayouts: "尚未保存布局方案",
    notifications: "桌面提醒", threshold: "低额度阈值", resetAlert: "额度重置提醒", recoveryAlert: "恢复可用提醒", quiet: "勿扰时段", cooldown: "重复提醒冷却", minutes: "分钟",
    events: "最近事件", noEvents: "还没有额度变化事件", history: "历史采样", samples: "条采样",
    update: "更新策略", channel: "更新通道", autoUpdate: "后台自动检查和下载", autostart: "登录系统后自动启动", stable: "稳定版", beta: "测试版（手动安装）",
    diagnostics: "应用诊断", copy: "复制诊断报告", backup: "备份与迁移", export: "导出设置与历史", import: "导入备份", restore: "恢复最近自动备份",
  } : {
    title: "Control center", subtitle: "Display, alerts, history, and recovery", display: "Display", alerts: "Alerts", activity: "Activity", system: "System",
    layout: "Information density", compact: "Compact", standard: "Standard", detailed: "Detailed", accent: "Accent color", rotate: "Rotation interval",
    providers: "Provider visibility", hidden: "Hidden", collapsed: "Condensed row", resetOrder: "Reset default order", savedLayouts: "Layout profiles", saveLayout: "Save current layout", noLayouts: "No layout profiles saved",
    notifications: "Desktop alerts", threshold: "Low-quota threshold", resetAlert: "Quota reset alerts", recoveryAlert: "Provider recovery alerts", quiet: "Quiet hours", cooldown: "Repeat-alert cooldown", minutes: "minutes",
    events: "Recent events", noEvents: "No quota change events yet", history: "History samples", samples: "samples",
    update: "Update policy", channel: "Update channel", autoUpdate: "Check and download in background", autostart: "Launch after system sign-in", stable: "Stable", beta: "Beta (manual install)",
    diagnostics: "App diagnostics", copy: "Copy diagnostic report", backup: "Backup and migration", export: "Export settings and history", import: "Import backup", restore: "Restore latest automatic backup",
  };

  const historyCounts = useMemo(() => new Map(PROVIDER_CATALOG.map((provider) => [provider.id, runtimeState.history.filter((point) => point.provider === provider.id).length])), [runtimeState.history]);

  const saveLayout = () => {
    const name = layoutName.trim() || `${zh ? "布局" : "Layout"} ${runtimeState.savedLayouts.length + 1}`;
    const saved: SavedLayout = {
      id: crypto.randomUUID(), name, createdAt: new Date().toISOString(), providerOrder: preferences.providerOrder ?? DEFAULT_PROVIDER_ORDER,
      hiddenProviders: preferences.hiddenProviders, collapsedProviders: preferences.collapsedProviders, layoutMode: preferences.layoutMode, accentColor: preferences.accentColor,
    };
    onRuntimeState({ ...runtimeState, savedLayouts: [...runtimeState.savedLayouts, saved].slice(-12) });
    setLayoutName("");
  };

  return (
    <section className="control-center" role="dialog" aria-modal="true" aria-labelledby="control-center-title" onMouseDown={(event) => event.stopPropagation()}>
      <header className="control-header">
        <div><p>QUOTA FLOAT · LOCAL FIRST</p><h2 id="control-center-title">{labels.title}</h2><small>{labels.subtitle}</small></div>
        <button type="button" onClick={onClose} aria-label="Close"><X /></button>
      </header>
      <nav className="control-tabs" aria-label={labels.title}>
        {([['display', Layout, labels.display], ['alerts', Bell, labels.alerts], ['activity', ClockCounterClockwise, labels.activity], ['system', Heartbeat, labels.system]] as const).map(([id, Icon, label]) => (
          <button key={id} type="button" className={tab === id ? "is-active" : ""} onClick={() => setTab(id)}><Icon /><span>{label}</span></button>
        ))}
      </nav>

      <div className="control-body">
        {tab === "display" ? <>
          <div className="control-grid">
            <label className="control-field"><span>{labels.layout}</span><select value={preferences.layoutMode} onChange={(event) => onPreferences({ ...preferences, layoutMode: event.target.value as WidgetPreferences['layoutMode'] })}><option value="compact">{labels.compact}</option><option value="standard">{labels.standard}</option><option value="detailed">{labels.detailed}</option></select></label>
            <label className="control-field"><span>{labels.accent}</span><input type="color" value={preferences.accentColor} onChange={(event) => onPreferences({ ...preferences, accentColor: event.target.value })} /></label>
            <label className="control-field"><span>{labels.rotate} · {preferences.autoRotateSeconds}s</span><input type="range" min="5" max="60" step="1" value={preferences.autoRotateSeconds} onChange={(event) => onPreferences({ ...preferences, autoRotateSeconds: Number(event.target.value) })} /></label>
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
          <div className="saved-layouts">{runtimeState.savedLayouts.length === 0 ? <p>{labels.noLayouts}</p> : runtimeState.savedLayouts.map((layout) => <div key={layout.id}><button type="button" onClick={() => onPreferences({ ...preferences, providerOrder: layout.providerOrder, hiddenProviders: layout.hiddenProviders, collapsedProviders: layout.collapsedProviders, layoutMode: layout.layoutMode, accentColor: layout.accentColor })}><strong>{layout.name}</strong><small>{layout.layoutMode}</small></button><button type="button" aria-label="Delete" onClick={() => onRuntimeState({ ...runtimeState, savedLayouts: runtimeState.savedLayouts.filter((item) => item.id !== layout.id) })}><Trash /></button></div>)}</div>
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
    </section>
  );
}

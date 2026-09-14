import { ArrowClockwise, ArrowSquareOut } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { fetchCodexExtensions, openExternalUrl, usesSyntheticData } from "../lib/bridge";
import { CODEX_COMPANIONS, COMPANIONS_CHECKED_AT, type CodexExtensionsReport, type ExtensionKind } from "../lib/codexExtensions";
import type { Language } from "../types";

export function CodexExtensionsPanel({ language }: { language: Language }) {
  const zh = language !== "en";
  const [report, setReport] = useState<CodexExtensionsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [linkError, setLinkError] = useState(false);
  const [revision, setRevision] = useState(0);
  const [kind, setKind] = useState<ExtensionKind | "all">("all");
  const [query, setQuery] = useState("");
  const pending = useRef(false);
  useEffect(() => {
    let active = true;
    pending.current = true;
    setLoading(true);
    setError(false);
    void fetchCodexExtensions().then((value) => {
      if (active) setReport(value);
    }).catch(() => {
      if (active) setError(true);
    }).finally(() => {
      if (active) { pending.current = false; setLoading(false); }
    });
    return () => { active = false; };
  }, [revision]);

  const labels = zh ? {
    title: "Codex 扩展", refresh: "重新扫描", scanning: "正在扫描本地扩展…", all: "全部", search: "搜索扩展名称",
    hint: "只读清单：配置启用不代表运行正常；目录中发现的技能不代表已被 Codex 加载。仅扫描用户级配置和技能目录。",
    failed: "扫描失败，已有清单保留，可重试。", partial: "部分来源无法读取或已达到扫描上限，清单可能不完整。",
    missing: "未发现支持的本地扩展来源。", empty: "当前范围没有扩展。", preview: "合成预览数据",
    enabled: "配置启用", disabled: "配置停用", detected: "已发现", companions: "开源伴侣", checked: "星数快照",
    linkFailed: "无法打开仓库，请稍后重试。", external: "打开 GitHub 仓库", offline: "按需打开项目；不会自动安装或启动第三方代码。",
  } : {
    title: "Codex extensions", refresh: "Rescan", scanning: "Scanning local extensions…", all: "All", search: "Search extension names",
    hint: "Read-only inventory: configured does not mean running; discovered skills may not be loaded by Codex. User-level config and skill directories only.",
    failed: "Scan failed. Previous inventory is retained; retry is available.", partial: "Some sources could not be read or scan limits were reached. Inventory may be incomplete.",
    missing: "No supported local extension sources found.", empty: "No extensions in this view.", preview: "Synthetic preview data",
    enabled: "Configured on", disabled: "Configured off", detected: "Discovered", companions: "Open-source companions", checked: "Star snapshot",
    linkFailed: "Could not open the repository. Please retry.", external: "Open GitHub repository", offline: "Open projects on demand; third-party code is never installed or launched automatically.",
  };
  const kinds = { mcp: "MCP", skill: "Skills", plugin: "Plugins" };
  const sources = zh
    ? { codex_config: "Codex 配置", codex_skills: "Codex 技能目录", agent_skills: "Agent 技能目录", plugin_cache: "插件缓存" }
    : { codex_config: "Codex config", codex_skills: "Codex skills", agent_skills: "Agent skills", plugin_cache: "Plugin cache" };
  const entries = (report?.entries ?? []).filter((entry) => (kind === "all" || kind === entry.kind) && entry.name.toLowerCase().includes(query.trim().toLowerCase()));

  return <section className="codex-extensions" aria-label={labels.title}>
    <div className="control-section-title"><span>{labels.title}</span><button type="button" disabled={loading} onClick={() => {
      if (pending.current) return;
      pending.current = true;
      setRevision((value) => value + 1);
    }}><ArrowClockwise />{labels.refresh}</button></div>
    <p className="extensions-note">{labels.hint}</p>
    {usesSyntheticData() ? <p className="extensions-note">{labels.preview}</p> : null}
    <div className="appearance-options" aria-label={zh ? "扩展类型" : "Extension type"}>
      {(["all", "mcp", "skill", "plugin"] as const).map((value) => <button key={value} type="button" aria-pressed={kind === value} className={kind === value ? "is-active" : ""} onClick={() => setKind(value)}>
        {value === "all" ? labels.all : kinds[value]} {report ? report.entries.filter((entry) => value === "all" || entry.kind === value).length : "—"}
      </button>)}
    </div>
    <label className="control-field extensions-search"><span>{labels.search}</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
    <div role="status" aria-live="polite" className="extensions-note">
      {loading ? labels.scanning : error ? labels.failed : report?.status === "not_found" ? labels.missing : report?.status === "partial" || report?.truncated ? labels.partial : null}
    </div>
    <div className="provider-health-list" aria-busy={loading}>
      {entries.map((entry, index) => <article className="provider-health-item" key={`${entry.kind}-${entry.source}-${entry.name}-${index}`}>
        <i aria-hidden="true" /><div className="provider-health-copy">
          <header><strong title={entry.name}>{entry.name}</strong><span>{kinds[entry.kind]}</span></header>
          <footer><span>{sources[entry.source]}</span><span>{entry.enabled === true ? labels.enabled : entry.enabled === false ? labels.disabled : labels.detected}</span></footer>
        </div>
      </article>)}
      {!loading && !error && report?.status !== "not_found" && entries.length === 0 ? <p className="extensions-note">{labels.empty}</p> : null}
    </div>
    <div className="control-section-title"><span>{labels.companions}</span></div>
    <p className="extensions-note">{labels.checked}: {COMPANIONS_CHECKED_AT} · {labels.offline}</p>
    <div className="provider-health-list">
      {CODEX_COMPANIONS.map((companion) => <article key={companion.repository} className="provider-health-item">
        <i aria-hidden="true" /><div className="provider-health-copy">
          <header><strong>{companion.name}</strong><span>★ {companion.stars.toLocaleString(language === "en" ? "en" : "zh-CN")}</span></header>
          <p className="extensions-description">{zh ? companion.description.zh : companion.description.en}</p>
          <div className="control-section-title"><button type="button" aria-label={`${labels.external}: ${companion.name}`} onClick={() => {
            setLinkError(false);
            void openExternalUrl(`https://github.com/${companion.repository}`).catch(() => setLinkError(true));
          }}><ArrowSquareOut />{companion.repository}</button></div>
        </div>
      </article>)}
    </div>
    {linkError ? <p role="alert" className="extensions-note">{labels.linkFailed}</p> : null}
  </section>;
}

import type { Language } from "../types";
import type { SavedLayoutDiagnosticField, SavedLayoutImportDiagnostics } from "./activity";

const FIELD_LABELS: Record<Language, Record<SavedLayoutDiagnosticField, string>> = {
  "zh-CN": {
    name: "配置名称",
    providerOrder: "服务顺序",
    hiddenProviders: "隐藏服务",
    collapsedProviders: "折叠服务",
    layoutMode: "信息密度",
    compactLayout: "折叠布局",
    barEdge: "悬浮条边缘",
    barOffset: "悬浮条位置",
    expandedLayout: "展开布局",
    colorTheme: "配色主题",
    appearanceMode: "明暗模式",
    riskFirst: "风险优先",
    showHistorySparklines: "历史趋势图",
    accentColor: "强调色",
  },
  en: {
    name: "profile name",
    providerOrder: "provider order",
    hiddenProviders: "hidden providers",
    collapsedProviders: "condensed providers",
    layoutMode: "information density",
    compactLayout: "compact layout",
    barEdge: "bar edge",
    barOffset: "bar position",
    expandedLayout: "expanded layout",
    colorTheme: "color theme",
    appearanceMode: "appearance mode",
    riskFirst: "risk-first view",
    showHistorySparklines: "history sparklines",
    accentColor: "accent color",
  },
};

function fieldSummary(fields: SavedLayoutDiagnosticField[], language: Language): string {
  const visible = fields.slice(0, 3).map((field) => FIELD_LABELS[language][field]);
  const hiddenCount = fields.length - visible.length;
  if (language === "zh-CN") return `${visible.join("、")}${hiddenCount > 0 ? `等 ${fields.length} 项` : ""}`;
  return `${visible.join(", ")}${hiddenCount > 0 ? ` +${hiddenCount} more` : ""}`;
}

export function formatBackupRestoreNotice(diagnostics: SavedLayoutImportDiagnostics, language: Language): string {
  const base = language === "zh-CN" ? "备份已恢复。" : "Backup restored.";
  const parts: string[] = [];
  if (diagnostics.importedLayouts > 0) {
    parts.push(language === "zh-CN"
      ? `导入 ${diagnostics.importedLayouts} 个布局`
      : `imported ${diagnostics.importedLayouts} layout profile${diagnostics.importedLayouts === 1 ? "" : "s"}`);
  }
  if (diagnostics.migratedFields.length > 0) {
    const fields = fieldSummary(diagnostics.migratedFields, language);
    parts.push(language === "zh-CN" ? `迁移默认项：${fields}` : `migrated defaults: ${fields}`);
  }
  if (diagnostics.clampedFields.length > 0) {
    const fields = fieldSummary(diagnostics.clampedFields, language);
    parts.push(language === "zh-CN" ? `范围修正：${fields}` : `clamped: ${fields}`);
  }
  if (diagnostics.repairedFields.length > 0) {
    const fields = fieldSummary(diagnostics.repairedFields, language);
    parts.push(language === "zh-CN" ? `安全修复：${fields}` : `repaired: ${fields}`);
  }
  if (diagnostics.droppedLayouts > 0) {
    parts.push(language === "zh-CN"
      ? `丢弃 ${diagnostics.droppedLayouts} 个无效布局`
      : `dropped ${diagnostics.droppedLayouts} invalid layout profile${diagnostics.droppedLayouts === 1 ? "" : "s"}`);
  }
  if (diagnostics.truncatedLayouts > 0) {
    parts.push(language === "zh-CN"
      ? `因 12 个上限忽略 ${diagnostics.truncatedLayouts} 个布局`
      : `ignored ${diagnostics.truncatedLayouts} layout profile${diagnostics.truncatedLayouts === 1 ? "" : "s"} above the 12-profile limit`);
  }
  if (diagnostics.ignoredFieldCount > 0) {
    parts.push(language === "zh-CN"
      ? `忽略 ${diagnostics.ignoredFieldCount} 个未知字段`
      : `ignored ${diagnostics.ignoredFieldCount} unknown field${diagnostics.ignoredFieldCount === 1 ? "" : "s"}`);
  }
  if (parts.length === 0) return base;
  return language === "zh-CN"
    ? `${base} 布局诊断：${parts.join("；")}。`
    : `${base} Layout diagnostics: ${parts.join("; ")}.`;
}

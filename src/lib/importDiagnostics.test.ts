import { describe, expect, it } from "vitest";
import type { SavedLayoutImportDiagnostics } from "./activity";
import { formatBackupRestoreNotice } from "./importDiagnostics";

const EMPTY_DIAGNOSTICS: SavedLayoutImportDiagnostics = {
  importedLayouts: 0,
  droppedLayouts: 0,
  truncatedLayouts: 0,
  migratedFields: [],
  clampedFields: [],
  repairedFields: [],
  ignoredFieldCount: 0,
};

describe("backup import diagnostics", () => {
  it("keeps a concise success notice when no layout profile was adjusted", () => {
    expect(formatBackupRestoreNotice(EMPTY_DIAGNOSTICS, "zh-CN")).toBe("备份已恢复。");
    expect(formatBackupRestoreNotice(EMPTY_DIAGNOSTICS, "en")).toBe("Backup restored.");
  });

  it("describes adjustments without including source values", () => {
    const diagnostics: SavedLayoutImportDiagnostics = {
      importedLayouts: 2,
      droppedLayouts: 1,
      truncatedLayouts: 1,
      migratedFields: ["compactLayout", "expandedLayout", "colorTheme", "appearanceMode"],
      clampedFields: ["barOffset"],
      repairedFields: ["providerOrder"],
      ignoredFieldCount: 1,
    };
    const message = formatBackupRestoreNotice(diagnostics, "zh-CN");

    expect(message).toContain("导入 2 个布局");
    expect(message).toContain("迁移默认项：折叠布局、展开布局、配色主题等 4 项");
    expect(message).toContain("范围修正：悬浮条位置");
    expect(message).toContain("安全修复：服务顺序");
    expect(message).toContain("丢弃 1 个无效布局");
    expect(message).toContain("因 12 个上限忽略 1 个布局");
    expect(message).toContain("忽略 1 个未知字段");
    expect(message).not.toContain("visualStyle");
    expect(formatBackupRestoreNotice(diagnostics, "en")).toContain("Layout diagnostics: imported 2 layout profiles");
  });
});

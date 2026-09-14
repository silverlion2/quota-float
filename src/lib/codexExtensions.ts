export type ExtensionKind = "mcp" | "skill" | "plugin";

export interface CodexExtension {
  kind: ExtensionKind;
  name: string;
  enabled: boolean | null;
  source: "codex_config" | "codex_skills" | "agent_skills" | "plugin_cache";
}

export interface CodexExtensionsReport {
  status: "ok" | "partial" | "not_found";
  entries: CodexExtension[];
  truncated: boolean;
  warnings: string[];
}

export interface CodexCompanion {
  name: string;
  repository: string;
  stars: number;
  description: { en: string; zh: string };
}

// A reviewed offline snapshot. Opening a repository is always a user action.
export const COMPANIONS_CHECKED_AT = "2026-09-15";
export const CODEX_COMPANIONS: CodexCompanion[] = [
  { name: "CC Switch", repository: "farion1231/cc-switch", stars: 132817, description: {
    zh: "跨平台 MCP / Skills 与供应商配置管理；配置切换会写入客户端设置。",
    en: "Cross-platform MCP, Skills and provider config manager; switching writes client settings.",
  } },
  { name: "CodexBar", repository: "steipete/CodexBar", stars: 21375, description: {
    zh: "macOS 多平台额度、费用与重置监控；提供 CLI 和桌面小组件。",
    en: "macOS quota, cost and reset monitor with a CLI and desktop widgets.",
  } },
  { name: "ccusage", repository: "ccusage/ccusage", stars: 18548, description: {
    zh: "本地 Token / 费用报告工具；历史估算不代表订阅实时额度。",
    en: "Local token and cost reports; historical estimates are separate from live subscription quota.",
  } },
  { name: "OpenAI Plugins", repository: "openai/plugins", stars: 6680, description: {
    zh: "官方 Codex 插件示例目录，涵盖 Skills、MCP 与应用连接；安装前逐项检查权限。",
    en: "Official Codex plugin examples with Skills, MCP and apps; review permissions before installing.",
  } },
  { name: "CodexMonitor", repository: "Dimillian/CodexMonitor", stars: 4301, description: {
    zh: "Codex 工作区、会话与 MCP / Skills 控制台；具备文件、终端和 Git 写操作。",
    en: "Codex workspace, thread and MCP / Skills console; includes file, terminal and Git write actions.",
  } },
  { name: "AiMaMi", repository: "borawong/AiMaMi", stars: 1505, description: {
    zh: "Codex 桌面伴侣，管理 MCP / Skills / 插件；账号切换和 relay 涉及额外数据访问。",
    en: "Codex companion with MCP, Skills and plugins; account switching and relay require additional data access.",
  } },
];

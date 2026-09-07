import type { Language, ProviderId, SnapshotStatus } from "../types";

const localApps: Record<ProviderId, string> = {
  codex: "Codex Desktop / Codex CLI",
  claude: "Claude Code",
  qoder: "Qoder",
  trae: "TRAE",
  workbuddy: "WorkBuddy",
  volcengine: "Ark CLI",
  antigravity: "Antigravity",
};

// Derive guidance from trusted identity/status only; never parse diagnostic text
// to infer a cause or include credentials, paths, or raw responses in instructions.
export function providerRecoveryAction(
  provider: ProviderId,
  status: SnapshotStatus | "paused",
  language: Language,
  platform?: string,
): string | null {
  const zh = language === "zh-CN";
  if (status === "ok") return null;
  if (status === "paused") return zh
    ? "在“平台”页恢复此平台的监控，再刷新。"
    : "Resume monitoring in Providers, then refresh.";
  if (status === "loading") return zh
    ? "等待当前检查完成；无需重复点击刷新。"
    : "Wait for the current check to finish before refreshing again.";
  const app = localApps[provider];
  if (["qoder", "trae", "workbuddy"].includes(provider) && platform === "macos") return zh
    ? `${app} 本地额度读取目前仅支持 Windows；可在“平台”页暂停此来源。`
    : `Local ${app} quota reading currently supports Windows only. You can pause this source in Providers.`;
  if (status === "signed_out") return zh
    ? `在 ${app} 中登录后返回这里刷新；无需向 Quota Float 粘贴凭据。`
    : `Sign in through ${app}, then refresh here. No credentials need to be pasted into Quota Float.`;
  if (status === "stale") return zh
    ? `保留的额度可能已变化。检查网络和 ${app} 的登录状态，再刷新；持续失败时可复制脱敏诊断报告。`
    : `The retained quota may have changed. Check your connection and ${app} sign-in, then refresh. If it keeps failing, copy the redacted diagnostic report.`;
  if (provider === "antigravity") return zh
    ? "确认 Antigravity 已启动并登录，保持其运行后再刷新；读取依赖本机语言服务器。"
    : "Open Antigravity, sign in, and keep it running before refreshing; reading requires its local language server.";
  return zh
    ? `确认本机已安装并登录 ${app}，再刷新；若客户端刚升级后仍失败，可复制脱敏诊断报告。`
    : `Check that ${app} is installed and signed in locally, then refresh. If a client update caused persistent failure, copy the redacted diagnostic report.`;
}

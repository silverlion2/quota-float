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
    ? "点击下方“恢复监控”继续检查。"
    : "Resume monitoring below to continue checking.";
  if (status === "loading") return zh
    ? "检查进行中，无需重复点击刷新。"
    : "Wait for this check to finish.";
  const app = localApps[provider];
  if (["qoder", "trae", "workbuddy"].includes(provider) && platform === "macos") return zh
    ? `${app} 仅支持 Windows，可在“平台”页暂停。`
    : `${app} supports Windows only. Pause it in Providers.`;
  if (status === "signed_out") return zh
    ? `在 ${app} 中登录后刷新，无需粘贴凭据。`
    : `Sign in through ${app}, then refresh. No credentials to paste.`;
  if (status === "stale") return zh
    ? `旧额度可能已变化。检查网络及 ${app} 登录，再刷新。持续失败可复制脱敏诊断。`
    : `The retained quota may have changed. Check your network and ${app} sign-in, then refresh. If needed, copy redacted diagnostics.`;
  if (provider === "antigravity") return zh
    ? "启动并登录 Antigravity，保持运行后刷新。"
    : "Open Antigravity, sign in and keep it running, then refresh.";
  return zh
    ? `确认已安装并登录 ${app} 后刷新。仍失败可复制脱敏诊断。`
    : `Check ${app} is installed and signed in, then refresh. If needed, copy redacted diagnostics.`;
}

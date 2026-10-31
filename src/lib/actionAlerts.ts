import type { ProviderId, ProviderSnapshot, WidgetPreferences } from "../types";

export interface ActionAlert {
  id: string;
  provider: ProviderId;
  kind: "reset-expiry" | "credit-expiry" | "stale-expiry" | "low-quota" | "signed-out";
  severity: "notice" | "warning" | "critical";
  title: string;
  detail: string;
  actionLabel: string;
  action: "codex-usage" | "provider";
  deadline: string | null;
  repeatMinutes: number;
}

const minute = 60_000;
const positive = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;
const timestamp = (value: string | null | undefined) => value ? Date.parse(value) : NaN;
function expiryStage(left: number) {
  if (left <= 15 * minute) return { key: "15m", repeat: 10, severity: "critical" as const };
  if (left <= 60 * minute) return { key: "1h", repeat: 30, severity: "critical" as const };
  if (left <= 6 * 60 * minute) return { key: "6h", repeat: 120, severity: "warning" as const };
  if (left <= 24 * 60 * minute) return { key: "24h", repeat: 360, severity: "warning" as const };
  return { key: "7d", repeat: 1440, severity: "notice" as const };
}

/** Reminder candidates only. Delivery preferences and quiet hours are applied by the caller. */
export function buildActionAlerts(snapshots: readonly ProviderSnapshot[], preferences: WidgetPreferences, now: Date): ActionAlert[] {
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) return [];
  const zh = preferences.language === "zh-CN";
  const countdown = (left: number) => {
    if (left < minute) return zh ? "不足 1 分钟" : "less than 1 minute";
    const [quantity, unit] = left < 60 * minute ? [Math.floor(left / minute), zh ? "分钟" : "minutes"]
      : left < 24 * 60 * minute ? [Math.floor(left / (60 * minute)), zh ? "小时" : "hours"]
      : [Math.floor(left / (24 * 60 * minute)), zh ? "天" : "days"];
    return `${quantity} ${unit}`;
  };
  const alerts: ActionAlert[] = [];
  const date = (value: string) => new Intl.DateTimeFormat(zh ? "zh-CN" : "en", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short",
  }).format(new Date(value));
  for (const snapshot of snapshots) {
    if (preferences.pausedProviders.includes(snapshot.provider)) continue;
    const provider = snapshot.provider;
    const name = snapshot.displayName;
    if (snapshot.status === "signed_out") {
      alerts.push({ id: `action:${provider}:signed-out`, provider, kind: "signed-out", severity: "warning",
        title: zh ? `${name} 需要重新登录` : `Sign in to ${name}`,
        detail: zh ? "打开平台重新登录，再刷新额度。" : "Open the provider, sign in again, then refresh quota.",
        actionLabel: zh ? "查看处理步骤" : "View next steps", action: "provider", deadline: null, repeatMinutes: 360 });
      continue;
    }
    const age = nowMs - timestamp(snapshot.updatedAt);
    if (snapshot.status !== "ok" && snapshot.status !== "stale") continue;
    const fresh = snapshot.status === "ok" && Number.isFinite(age) && age >= -minute && age <= 20 * minute;
    const resetAction = provider === "codex" && positive(snapshot.resetCredits);
    const resetInstructions = zh
      ? "进入用量设置，选择已有重置卡，核对适用额度与到期时间后确认；适用额度须低于 80%。CLI：/usage → Redeem reset。"
      : "Open usage settings, select an available reset, review the covered allowance and expiry, then confirm; a covered allowance must be below 80%. CLI: /usage → Redeem reset.";
    const expiry = (kind: "reset-expiry" | "credit-expiry", values: (string | null)[]) => {
      const nearest = [...new Set(values.map(timestamp).filter((at) => Number.isFinite(at) && at > nowMs && at - nowMs <= 7 * 86400_000))].sort((a, b) => a - b)[0];
      if (nearest === undefined) return;
      const deadline = new Date(nearest).toISOString();
      const stage = expiryStage(nearest - nowMs);
      const reset = kind === "reset-expiry";
      if (!fresh) {
        alerts.push({ id: `action:${provider}:stale-expiry:${kind}:${deadline}:${stage.key}`, provider, kind: "stale-expiry", severity: stage.severity,
          title: zh ? `${name} 到期信息待核对 · ${countdown(nearest - nowMs)}` : `${name} expiry needs checking · ${countdown(nearest - nowMs)}`,
          detail: zh ? `记录的到期时间：${date(deadline)}。数据已过期，先刷新；剩余额度与到期信息待核对。` : `Recorded expiry: ${date(deadline)}. Data is stale; refresh first to verify the remaining allowance and expiry.`,
          actionLabel: zh ? "立即刷新核对" : "Refresh and check now", action: "provider", deadline, repeatMinutes: stage.repeat });
        return;
      }
      const grantKnownPositive = reset || (snapshot.balanceGrants ?? []).some((grant) => timestamp(grant.expiresAt) === nearest && positive(grant.remaining));
      alerts.push({ id: `action:${provider}:${kind}:${deadline}:${stage.key}`, provider, kind, severity: stage.severity,
        title: !grantKnownPositive ? (zh ? `${name} 批次到期需核对 · ${countdown(nearest - nowMs)}` : `${name} grant expiry needs checking · ${countdown(nearest - nowMs)}`)
          : zh ? `${name} ${reset ? "重置卡" : "Credits 批次"}仅剩 ${countdown(nearest - nowMs)}` : `${name} ${reset ? "reset" : "credit grant"}: ${countdown(nearest - nowMs)} left`,
        detail: reset
          ? (zh ? `最近到期时间：${date(deadline)}。` : `Nearest expiry: ${date(deadline)}. `) + (resetAction ? resetInstructions : (zh ? "进入客户端用量页核对并使用可用重置。" : "Open the client's usage page to review and use available resets."))
          : !grantKnownPositive
            ? (zh ? `记录的批次到期时间：${date(deadline)}。该批次余额未知，请到平台核对；总余额不代表该批次剩余额度。可进入客户端用量页查看。` : `Recorded grant expiry: ${date(deadline)}. This grant's balance is unknown; check the client's usage page. The total balance does not establish this grant's remaining funds.`)
            : (zh ? `有余额批次于 ${date(deadline)} 到期；请进入客户端用量页核对该批次并安排使用，不能据此认定全部余额到期。` : `A balance grant expires ${date(deadline)}; review that grant in the client's usage page and plan usage. This does not mean the whole balance expires.`),
        actionLabel: zh ? (provider === "codex" ? "打开用量设置" : "查看处理步骤") : (provider === "codex" ? "Open usage settings" : "View next steps"),
        action: provider === "codex" ? "codex-usage" : "provider", deadline, repeatMinutes: stage.repeat });
    };
    if (positive(snapshot.resetCredits)) expiry("reset-expiry", snapshot.resetCreditExpiresAt ?? []);
    if (snapshot.balanceUnit === "credits" && positive(snapshot.balanceRemaining)) {
      expiry("credit-expiry", (snapshot.balanceGrants ?? []).filter((grant) => grant.remaining === null || positive(grant.remaining)).map((grant) => grant.expiresAt));
    }
    if (!fresh) continue;
    const windows = [snapshot.shortWindow, snapshot.weeklyWindow, snapshot.monthlyWindow].filter((window) => {
      if (!window || !Number.isFinite(window.remainingPercent) || window.remainingPercent < 0 || window.remainingPercent > 100) return false;
      return window.resetsAt === null || (Number.isFinite(timestamp(window.resetsAt)) && timestamp(window.resetsAt) > nowMs);
    }).sort((a, b) => a!.remainingPercent - b!.remainingPercent);
    const tightest = windows[0];
    if (tightest && tightest.remainingPercent <= preferences.alertThreshold) {
      const severity = tightest.remainingPercent <= 5 ? "critical" : "warning";
      const deadline = tightest.resetsAt ? new Date(tightest.resetsAt).toISOString() : null;
      const period = tightest === snapshot.monthlyWindow ? (zh ? "月额度" : "monthly")
        : tightest === snapshot.weeklyWindow ? (zh ? "周额度" : "weekly")
        : `${Number((tightest.windowSeconds / 3600).toFixed(1))}h`;
      const percent = Number(tightest.remainingPercent.toFixed(1));
      alerts.push({ id: `action:${provider}:low-quota:${tightest.windowSeconds}:${deadline ?? "unknown"}:${severity}`, provider, kind: "low-quota", severity,
        title: zh ? `${name} ${period}剩余 ${percent}%` : `${name} ${period} remaining: ${percent}%`,
        detail: resetAction ? resetInstructions : (zh ? "进入客户端用量页核对用量，安排剩余额度或等待套餐周期重置。" : "Review usage in the client's usage page, plan remaining quota or wait for the plan window to reset."),
        actionLabel: zh ? (provider === "codex" ? "打开用量设置" : "查看处理步骤") : (provider === "codex" ? "Open usage settings" : "View next steps"),
        action: provider === "codex" ? "codex-usage" : "provider", deadline, repeatMinutes: 60 });
    }
  }
  const rank = { critical: 0, warning: 1, notice: 2 };
  const kindRank = { "reset-expiry": 0, "credit-expiry": 1, "stale-expiry": 2, "low-quota": 3, "signed-out": 4 };
  return [...new Map(alerts.map((alert) => [alert.id, alert])).values()].sort((a, b) => rank[a.severity] - rank[b.severity]
    || (timestamp(a.deadline) || Infinity) - (timestamp(b.deadline) || Infinity) || kindRank[a.kind] - kindRank[b.kind] || a.id.localeCompare(b.id));
}

export function actionAlertSnoozed(alert: ActionAlert, snoozes: Record<string, string> | undefined, now: Date): boolean {
  return timestamp(snoozes?.[alert.id]) > now.getTime();
}

export function actionAlertDue(alert: ActionAlert, lastNotifications: Record<string, string>, now: Date): boolean {
  const last = timestamp(lastNotifications[alert.id]);
  const elapsed = now.getTime() - last;
  return Number.isFinite(now.getTime()) && (!Number.isFinite(last) || elapsed < 0 || elapsed >= alert.repeatMinutes * minute);
}

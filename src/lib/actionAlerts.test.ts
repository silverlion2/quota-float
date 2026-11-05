import { describe, expect, it } from "vitest";
import type { ProviderSnapshot } from "../types";
import { DEFAULT_WIDGET_PREFERENCES as defaults } from "./preferences";
import { actionAlertDue, actionAlertIdentity, actionAlertSnoozed, buildActionAlerts } from "./actionAlerts";

const now = new Date("2026-10-31T12:00:00Z");
const at = (minutes: number) => new Date(now.getTime() + minutes * 60_000).toISOString();
const base: ProviderSnapshot = { provider: "codex", displayName: "Codex", plan: "PRO", status: "ok", updatedAt: now.toISOString(),
  shortWindow: null, weeklyWindow: null, resetCredits: 2, message: null };
const build = (extra: Partial<ProviderSnapshot> = {}) => buildActionAlerts([{ ...base, ...extra }], defaults, now);

describe("actionable reminders", () => {
  it("uses all distinct future provider expiries and normalizes duplicate dates", () => {
    const result = build({ resetCreditExpiresAt: [at(90), "bad", at(-1), at(30), "2026-10-31T14:30:00+02:00", at(30)] });
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ kind: "reset-expiry", deadline: at(30), severity: "critical", repeatMinutes: 30, action: "codex-usage" });
    expect(result[0].id.length).toBeLessThanOrEqual(160);
    expect(result[0].id).toMatch(/^action:/);
    expect(result[0].title).toBe("Codex 重置卡仅剩 30 分钟");
    expect(result[0].actionLabel).toBe("打开用量设置");
    expect(result[0].detail).toContain("80%");
    expect(result[0].detail).toContain("Redeem reset");
    expect(result[0].detail).not.toContain("2 次");
  });
  it("escalates identity and cadence at each deadline stage", () => {
    const rows = [10080, 1440, 360, 60, 15].map((minutes) => build({ resetCreditExpiresAt: [at(minutes)] })[0]);
    expect(rows.map((row) => row.repeatMinutes)).toEqual([1440, 360, 120, 30, 10]);
    expect(new Set(rows.map((row) => row.id)).size).toBe(5);
    expect(build({ resetCreditExpiresAt: [at(10081)] })).toEqual([]);
  });
  it("shows meaningful countdown units without rounding seconds to zero minutes", () => {
    expect(build({ resetCreditExpiresAt: [at(0.1)] })[0].title).toContain("不足 1 分钟");
    expect(build({ resetCreditExpiresAt: [at(1)] })[0].title).toContain("仅剩 1 分钟");
    expect(build({ resetCreditExpiresAt: [at(180)] })[0].title).toContain("仅剩 3 小时");
    expect(build({ resetCreditExpiresAt: [at(2880)] })[0].title).toContain("仅剩 2 天");
  });
  it("does not fabricate expiry from plan resets, unknown dates or empty counters", () => {
    expect(build({ resetCredits: 0, resetCreditExpiresAt: [at(30)], balanceUnit: "unlimited", balanceRemaining: 10,
      balanceGrants: [{ remaining: 10, expiresAt: at(30) }], weeklyWindow: { remainingPercent: 50, resetsAt: at(30), windowSeconds: 604800 } })).toEqual([]);
    expect(build({ resetCredits: Infinity, balanceUnit: "credits", balanceRemaining: 10, balanceGrants: [{ remaining: 10, expiresAt: null }] })).toEqual([]);
  });
  it("reports a grant deadline without claiming the total or unknown grant quantity expires", () => {
    const row = build({ resetCredits: null, balanceUnit: "credits", balanceRemaining: 100,
      balanceGrants: [{ remaining: 0, expiresAt: at(1) }, { remaining: null, expiresAt: at(30) }, { remaining: 50, expiresAt: at(60) }] })[0];
    expect(row).toMatchObject({ kind: "credit-expiry", deadline: at(30), action: "codex-usage" });
    expect(row.title).toContain("批次到期需核对");
    expect(row.detail).toContain("该批次余额未知");
    expect(row.detail).toContain("总余额不代表该批次剩余额度");
    expect(row.detail).not.toContain("100");
    expect(row.detail).not.toContain("50");
  });
  it("accepts fresh startup low quota, ignores stale/invalid/expired windows and escalates at 5%", () => {
    const window = { remainingPercent: 15, resetsAt: at(60), windowSeconds: 18000 };
    expect(build({ shortWindow: window })[0]).toMatchObject({ kind: "low-quota", severity: "warning" });
    expect(build({ shortWindow: { ...window, remainingPercent: 5 } })[0].severity).toBe("critical");
    expect(build({ shortWindow: { ...window, resetsAt: at(-1) } })).toEqual([]);
    expect(build({ shortWindow: { ...window, remainingPercent: -1 } })).toEqual([]);
    expect(build({ shortWindow: { ...window, remainingPercent: NaN } })).toEqual([]);
    for (const updatedAt of [at(-21), at(2), "bad"]) expect(build({ shortWindow: window, updatedAt })).toEqual([]);
    expect(build({ shortWindow: window, status: "stale" })).toEqual([]);
    expect(build({ shortWindow: window, updatedAt: at(-20) })).toHaveLength(1);
  });
  it("allows positive grant evidence at the same normalized unknown-grant deadline", () => {
    const row = build({ resetCredits: null, balanceUnit: "credits", balanceRemaining: 100,
      balanceGrants: [{ remaining: null, expiresAt: at(30) }, { remaining: 5, expiresAt: "2026-10-31T14:30:00+02:00" }] })[0];
    expect(row.title).toContain("Credits 批次仅剩");
    expect(row.amountLabel).toBe("5 credits + 未知余额");
    expect(row.evidenceLabel).toContain("余额未知");
  });
  it("retains stale known expiry as refresh-only uncertainty without quota or redeem claims", () => {
    for (const extra of [{ status: "stale" as const }, { updatedAt: at(-21) }]) {
      const row = build({ ...extra, resetCreditExpiresAt: [at(10)], shortWindow: { remainingPercent: 1, resetsAt: at(60), windowSeconds: 18000 } });
      expect(row).toHaveLength(1);
      expect(row[0]).toMatchObject({ kind: "stale-expiry", action: "provider", severity: "critical", actionLabel: "立即刷新核对" });
      expect(row[0].detail).toContain("数据已过期，先刷新");
      expect(row[0].detail).not.toContain("Redeem");
      expect(row[0].title).not.toContain("重置卡仅剩");
    }
    for (const status of ["loading", "unavailable"] as const) expect(build({ status, resetCreditExpiresAt: [at(10)] })).toEqual([]);
    expect(build({ status: "stale", resetCredits: 0, resetCreditExpiresAt: [at(10)] })).toEqual([]);
    expect(build({ status: "stale", resetCreditExpiresAt: [at(-1)] })).toEqual([]);
  });
  it("chooses the tightest live window and gives a new cycle a fresh identity", () => {
    const extra = { shortWindow: { remainingPercent: 10, resetsAt: at(60), windowSeconds: 18000 },
      weeklyWindow: { remainingPercent: 2, resetsAt: at(120), windowSeconds: 604800 } };
    const row = build(extra)[0];
    expect(row.title).toContain("2%");
    expect(row.title).toContain("周额度");
    expect(build({ shortWindow: { ...extra.shortWindow, remainingPercent: 10.12345 } })[0].title).toContain("5h剩余 10.1%");
    expect(row.id).not.toBe(build({ ...extra, weeklyWindow: { ...extra.weeklyWindow, resetsAt: at(240) } })[0].id);
    expect(build({ ...extra, resetCredits: 0 })[0].action).toBe("codex-usage");
  });
  it("keeps hidden providers monitored, skips paused providers and isolates sign-out", () => {
    const snapshot = { ...base, resetCreditExpiresAt: [at(10)] };
    expect(buildActionAlerts([snapshot], { ...defaults, hiddenProviders: ["codex"] }, now)).toHaveLength(1);
    expect(buildActionAlerts([snapshot], { ...defaults, pausedProviders: ["codex"] }, now)).toEqual([]);
    expect(build({ ...snapshot, status: "signed_out", updatedAt: "bad" })).toMatchObject([{ kind: "signed-out", repeatMinutes: 360 }]);
    expect(build({ ...snapshot, status: "signed_out" })[0].actionLabel).toBe("查看处理步骤");
  });
  it("orders critical alerts before notices and deduplicates repeated snapshots", () => {
    const snapshots = [{ ...base, resetCreditExpiresAt: [at(2000)] }, { ...base, provider: "claude" as const, resetCreditExpiresAt: [at(10)] }];
    const result = buildActionAlerts([...snapshots, ...snapshots], defaults, now);
    expect(result.map((row) => row.provider)).toEqual(["claude", "codex"]);
  });
  it("repeats by identity, retries clock rollback, and expires snoozes", () => {
    const row = build({ resetCreditExpiresAt: [at(10)] })[0];
    expect(actionAlertDue(row, {}, now)).toBe(true);
    expect(actionAlertDue(row, { [row.id]: at(-9) }, now)).toBe(false);
    expect(actionAlertDue(row, { [row.id]: at(-10) }, now)).toBe(true);
    expect(actionAlertDue(row, { [row.id]: at(1) }, now)).toBe(true);
    expect(actionAlertSnoozed(row, { [row.id]: at(1) }, now)).toBe(true);
    expect(actionAlertSnoozed(row, { [row.id]: at(0) }, now)).toBe(false);
    expect(actionAlertSnoozed(row, { [row.id]: "bad" }, now)).toBe(false);
  });
});

describe("expiry batch evidence and unused reset windows", () => {
  it("sums positive grants at each normalized deadline without using the total", () => {
    const rows = build({ resetCredits: 0, balanceUnit: "credits", balanceRemaining: 999,
      balanceGrants: [{remaining: 2, expiresAt: at(30)}, {remaining: 3, expiresAt: "2026-10-31T14:30:00+02:00"},
        {remaining: null, expiresAt: at(30)}, {remaining: 9, expiresAt: at(60)}, {remaining: -1, expiresAt: at(30)}] });
    expect(rows.map(row => row.deadline)).toEqual([at(30), at(60)]);
    expect(rows.map(row => row.amountLabel)).toEqual(["5 credits + 未知余额", "9 credits"]);
    expect(JSON.stringify(rows)).not.toContain("999");
  });
  it("never renders an overflowing sum as infinite credits", () => {
    for (const unknown of [false, true]) {
      const grants = [{remaining: Number.MAX_VALUE, expiresAt: at(30)}, {remaining: Number.MAX_VALUE, expiresAt: at(30)}];
      const row = build({resetCredits: 0, balanceUnit: "credits", balanceGrants: unknown
        ? [...grants, {remaining: null, expiresAt: at(30)}] : grants})[0];
      expect(row.amountLabel).toContain("超出显示范围");
      expect(row.evidenceLabel).toContain("未知余额仍未计入");
      expect(JSON.stringify(row)).not.toContain("Infinity");
      expect(row.kind).toBe("credit-expiry");
    }
  });
  it("retains grant evidence when aggregate balance is absent", () => {
    expect(build({resetCredits: 0, balanceUnit: "credits", balanceRemaining: null,
      balanceGrants: [{remaining: 4, expiresAt: at(30)}]})[0].amountLabel).toBe("4 credits");
  });
  it("keeps a stable batch identity across stages and stale transitions", () => {
    const fresh = build({resetCreditExpiresAt: [at(30)]})[0];
    const stale = build({resetCreditExpiresAt: [at(30)], status: "stale"})[0];
    const later = buildActionAlerts([{...base, updatedAt: at(20), resetCreditExpiresAt: [at(30)]}], defaults, new Date(at(20)))[0];
    expect(actionAlertIdentity(fresh)).toBe(actionAlertIdentity(stale));
    expect(actionAlertIdentity(fresh)).toBe(actionAlertIdentity(later));
    expect(fresh.amountLabel).toBeUndefined();
  });
  const weekly = {remainingPercent: 60, resetsAt: at(1440), windowSeconds: 604800};
  it("offers independent weekly/monthly plans once per actual cycle", () => {
    const rows = build({weeklyWindow: weekly, monthlyWindow: {...weekly, windowSeconds: 2592000}});
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map(row => row.id)).size).toBe(2);
    for (const row of rows) {
      expect(row).toMatchObject({kind: "quota-reset-unused", action: "plan", repeatMinutes: Infinity});
      expect(row.detail).toContain("无需为消耗而制造任务");
      expect(actionAlertDue(row, {[row.id]: at(-10000)}, now)).toBe(false);
    }
    expect(build({weeklyWindow: {...weekly, remainingPercent: 80}})[0].id).toBe(rows.find(row => row.id.includes(":weekly:"))!.id);
    expect(build({weeklyWindow: {...weekly, resetsAt: at(1200)}})[0].id).not.toBe(rows.find(row => row.id.includes(":weekly:"))!.id);
  });
  it("rejects short, stale, invalid, elapsed and out-of-range windows", () => {
    expect(build({shortWindow: weekly})).toEqual([]);
    for (const window of [{...weekly, windowSeconds: 86400}, {...weekly, windowSeconds: Infinity},
      {...weekly, remainingPercent: 50}, {...weekly, remainingPercent: 101}, {...weekly, remainingPercent: NaN},
      {...weekly, resetsAt: at(1440.01)}, {...weekly, resetsAt: at(0)}, {...weekly, resetsAt: "bad"},
      {...weekly, windowSeconds: 18000}]) expect(build({weeklyWindow: window})).toEqual([]);
    expect(build({weeklyWindow: weekly, status: "stale"})).toEqual([]);
    expect(build({weeklyWindow: weekly, updatedAt: at(-21)})).toEqual([]);
    expect(buildActionAlerts([{...base, weeklyWindow: weekly}], {...defaults, pausedProviders: ["codex"]}, now)).toEqual([]);
  });
});

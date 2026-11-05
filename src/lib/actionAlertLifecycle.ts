import type { ProviderId, ProviderSnapshot } from "../types";
import { DEFAULT_PROVIDER_ORDER } from "./providers";
import { actionAlertIdentity, type ActionAlert } from "./actionAlerts";

export interface ActionAlertRecord {
  key: string;
  provider: ProviderId;
  kind: ActionAlert["kind"];
  title: string;
  detail: string;
  deadline: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  status: "active" | "no-longer-observed" | "deadline-passed";
  closedAt?: string;
}

const kinds = new Set(["reset-expiry", "credit-expiry", "stale-expiry", "low-quota", "signed-out", "quota-reset-unused"]);
const statuses = new Set(["active", "no-longer-observed", "deadline-passed"]);
const validDate = (v: unknown): v is string => typeof v === "string" && Number.isFinite(Date.parse(v));
export function normalizeActionAlertHistory(value: unknown): ActionAlertRecord[] {
  if (!Array.isArray(value)) return [];
  const records: ActionAlertRecord[] = [];
  const keys = new Set<string>();
  for (const v of value.slice(0, 512)) {
    if (!v || typeof v !== "object" || typeof v.key !== "string" || !v.key.startsWith("action:") || v.key.length > 160
      || keys.has(v.key) || !DEFAULT_PROVIDER_ORDER.includes(v.provider) || !kinds.has(v.kind) || !statuses.has(v.status)
      || typeof v.title !== "string" || typeof v.detail !== "string" || !validDate(v.firstSeenAt) || !validDate(v.lastSeenAt)
      || (v.deadline !== null && !validDate(v.deadline)) || (v.status !== "active" && !validDate(v.closedAt))) continue;
    keys.add(v.key);
    records.push({ key: v.key, provider: v.provider, kind: v.kind, title: v.title.slice(0, 200), detail: v.detail.slice(0, 600),
      deadline: v.deadline, firstSeenAt: v.firstSeenAt, lastSeenAt: v.lastSeenAt, status: v.status,
      ...(v.status !== "active" ? { closedAt: v.closedAt } : {}) });
  }
  return records.slice(0, 128);
}

/** Observation history is independent of OS notification permissions and receipts. */
export function reconcileActionAlertHistory(previous: ActionAlertRecord[], alerts: ActionAlert[], snapshots: ProviderSnapshot[], paused: ProviderId[], now: Date): ActionAlertRecord[] {
  if (!Number.isFinite(now.getTime())) return previous;
  const at = now.toISOString();
  const records = new Map(previous.map(item => [item.key, item]));
  const observed = new Set<string>();
  for (const alert of alerts) {
    const key = actionAlertIdentity(alert);
    observed.add(key);
    const old = records.get(key);
    const snapshotAt = snapshots.find(item => item.provider === alert.provider)?.updatedAt;
    const lastSeenAt = validDate(snapshotAt) ? snapshotAt : at;
    // Do not rewrite countdown text or persist a heartbeat every 30 seconds.
    if (old?.status === "active" && old.lastSeenAt === lastSeenAt && old.kind === alert.kind) continue;
    records.set(key, { key, provider: alert.provider, kind: alert.kind, title: alert.title, detail: alert.detail,
      deadline: alert.deadline, firstSeenAt: old?.firstSeenAt ?? at, lastSeenAt, status: "active" });
  }
  for (const [key, item] of records) {
    if (item.status !== "active" || observed.has(key)) continue;
    if (item.deadline && Date.parse(item.deadline) <= now.getTime()) {
      records.set(key, { ...item, status: "deadline-passed", closedAt: at });
      continue;
    }
    const snapshot = snapshots.find(s => s.provider === item.provider);
    const updated = Date.parse(snapshot?.updatedAt ?? "");
    // A missing provider, stale read, disabled monitor or old response cannot prove resolution.
    if (paused.includes(item.provider) || snapshot?.status !== "ok" || updated <= Date.parse(item.lastSeenAt)
      || now.getTime() - updated > 20 * 60_000 || updated - now.getTime() > 60_000 || !Number.isFinite(updated)) continue;
    records.set(key, { ...item, status: "no-longer-observed", closedAt: at });
  }
  return [...records.values()].sort((a, b) => Number(b.status === "active") - Number(a.status === "active")
    || Date.parse(b.closedAt ?? b.lastSeenAt) - Date.parse(a.closedAt ?? a.lastSeenAt)).slice(0, 128);
}

import type { Language, ProviderId, WidgetPreferences } from "../types";
import type { ActionAlert } from "./actionAlerts";
import { AIHOT_PROVIDERS, type AiHotEvent, type AiHotProvider, type AiHotReport } from "./aihot";
import { DEFAULT_PROVIDER_ORDER } from "./providers";

export const AIHOT_SOURCE_MAX_AGE_MS = 6 * 60 * 60_000;
export const AIHOT_EVENT_MAX_AGE_MS = 7 * 86400_000;
export const AIHOT_READ_KEY_LIMIT = 256;
const skew = 60_000;

export interface AiHotSignalOptions {
  enabled: boolean;
  enabledProviders: readonly ProviderId[];
  excludedEventKeys?: readonly string[];
  readEventKeys?: readonly string[];
}

export interface AiHotSignal {
  key: string;
  eventId: string;
  provider: ProviderId;
  event: AiHotEvent;
  status: "pending" | "confirmed";
  unread: boolean;
  sourceVerifiedAt: string;
  /** End of public-information freshness; never a personal quota deadline. */
  expiresAt: string;
}

export function aiHotLocalProvider(provider: AiHotProvider): ProviderId | null {
  return provider === "codex" || provider === "claude" || provider === "antigravity" ? provider : null;
}

export function enabledAiHotProviders(preferences: Pick<WidgetPreferences, "hiddenProviders" | "pausedProviders">): ProviderId[] {
  return DEFAULT_PROVIDER_ORDER.filter(provider => !preferences.hiddenProviders.includes(provider) && !preferences.pausedProviders.includes(provider));
}

/** Brand relevance for catalogue filtering only, never plan or account eligibility. */
export function matchesAiHotCreditProvider(label: string, enabled: readonly ProviderId[]): boolean {
  const aliases: Record<string, ProviderId> = { codex: "codex", openai: "codex", claude: "claude", anthropic: "claude",
    antigravity: "antigravity", "google antigravity": "antigravity", qoder: "qoder", trae: "trae", workbuddy: "workbuddy",
    volcengine: "volcengine", "volcengine ark": "volcengine", "火山引擎": "volcengine", "火山方舟": "volcengine" };
  const provider = aliases[label.trim().toLowerCase()];
  return !!provider && enabled.includes(provider);
}

// Two independent 32-bit accumulators keep opaque upstream IDs bounded in persistence.
function identifier(value: string): string {
  let a = 0x811c9dc5; let b = 0x9e3779b9;
  for (const char of value) { const n = char.codePointAt(0)!; a = Math.imul(a ^ n, 16777619); b = Math.imul(b ^ n, 2246822519); }
  return `${(a >>> 0).toString(16).padStart(8, "0")}${(b >>> 0).toString(16).padStart(8, "0")}`;
}

/** A confirmation becomes unread once; polling, translation edits and pending progress do not. */
export function aiHotEventKey(provider: AiHotProvider, event: Pick<AiHotEvent, "id" | "status">): string {
  return `aihot:${provider}:${identifier(event.id)}:${event.status === "confirmed" ? "confirmed" : "pending"}`;
}

function timestamp(value: string | null | undefined): number {
  const m = value?.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/);
  if (!m || +m[2] < 1 || +m[2] > 12 || +m[3] < 1 || +m[3] > new Date(Date.UTC(+m[1], +m[2], 0)).getUTCDate()
    || +m[4] > 23 || +m[5] > 59 || +m[6] > 59 || +(m[7] ?? 0) > 23 || +(m[8] ?? 0) > 59) return NaN;
  return Date.parse(value!);
}

export function buildAiHotSignals(report: AiHotReport | null | undefined, options: AiHotSignalOptions, now: Date): AiHotSignal[] {
  const wall = now.getTime();
  if (!options.enabled || !report || !Number.isFinite(wall)) return [];
  const read = new Set(options.readEventKeys ?? []);
  const excluded = new Set(options.excludedEventKeys ?? []);
  const signals = new Map<string, AiHotSignal>();
  for (const source of report.sources) {
    const provider = aiHotLocalProvider(source.provider);
    const verified = timestamp(source.updatedAt);
    if (!provider || !options.enabledProviders.includes(provider) || source.status !== "healthy"
      || !Number.isFinite(verified) || verified > wall + skew || wall - verified >= AIHOT_SOURCE_MAX_AGE_MS) continue;
    for (const event of source.events) {
      if (!event.id || event.id.length > 256 || !["announced", "in_progress", "confirmed"].includes(event.status)) continue;
      const updated = timestamp(event.updatedAt);
      // A recent edit of an old confirmation must not revive an expired public alert.
      const confirmation = event.status === "confirmed" && event.reportedAt !== null ? timestamp(event.reportedAt) : updated;
      if (![updated, confirmation].every(at => Number.isFinite(at) && at <= wall + skew && wall - at < AIHOT_EVENT_MAX_AGE_MS)) continue;
      const key = aiHotEventKey(source.provider, event);
      if (excluded.has(key)) continue;
      const candidate: AiHotSignal = { key, eventId: event.id, provider, event,
        status: event.status === "confirmed" ? "confirmed" : "pending", unread: !read.has(key), sourceVerifiedAt: source.updatedAt!,
        expiresAt: new Date(Math.min(verified + AIHOT_SOURCE_MAX_AGE_MS, updated + AIHOT_EVENT_MAX_AGE_MS, confirmation + AIHOT_EVENT_MAX_AGE_MS)).toISOString() };
      const previous = signals.get(key);
      if (!previous || updated > timestamp(previous.event.updatedAt)) signals.set(key, candidate);
    }
  }
  // A duplicated pending record must not compete with the same event's confirmation.
  const confirmed = new Set([...signals.values()].filter(signal => signal.status === "confirmed").map(signal => `${signal.provider}:${signal.eventId}`));
  return [...signals.values()].filter(signal => signal.status === "confirmed" || !confirmed.has(`${signal.provider}:${signal.eventId}`))
    .sort((a, b) => timestamp(b.event.updatedAt) - timestamp(a.event.updatedAt) || a.key.localeCompare(b.key));
}

export function markAiHotSignalsRead(existing: readonly string[], signals: readonly AiHotSignal[]): string[] {
  const marked = new Set(signals.map(signal => signal.key));
  return [...new Set([...existing.filter(key => !marked.has(key) && /^aihot:(codex|claude|antigravity):[a-f0-9]{16}:(pending|confirmed)$/.test(key)), ...marked])].slice(-AIHOT_READ_KEY_LIMIT);
}

export function buildAiHotActionAlerts(signals: readonly AiHotSignal[], language: Language): ActionAlert[] {
  const en = language === "en";
  return signals.filter(signal => signal.unread).map(signal => ({
    id: `action:${signal.key}`, provider: signal.provider, kind: "public-reset", severity: "notice",
    title: en ? `${AIHOT_PROVIDERS[signal.provider as AiHotProvider]} · public ${signal.status === "confirmed" ? "reset report" : "reset announcement"}`
      : `${AIHOT_PROVIDERS[signal.provider as AiHotProvider]} · 公开${signal.status === "confirmed" ? "重置报道" : "重置预告"}`,
    detail: en ? `${signal.event.title}. ${signal.event.scope ? `Reported scope: ${signal.event.scope}.` : "Eligibility was not specified."} This is public information, not confirmation of your account's balance or reset.`
      : `${signal.event.title}。${signal.event.scope ? `报道范围：${signal.event.scope}。` : "适用范围未明确。"}这是公开消息，不代表你的账户余额或重置已到账。`,
    actionLabel: en ? "Review public source" : "查看公开来源", action: "aihot", deadline: null, repeatMinutes: Infinity,
    publicStatus: signal.status, publicReadKey: signal.key, observedAt: signal.sourceVerifiedAt, validUntil: signal.expiresAt,
  }));
}

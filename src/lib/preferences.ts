import { DEFAULT_PROVIDER_ORDER, normalizeProviderOrder } from "./providers";
import type { ProviderId, WidgetPreferences } from "../types";

export const DEFAULT_WIDGET_PREFERENCES: WidgetPreferences = {
  locked: false,
  alwaysOnTop: true,
  stayExpanded: false,
  pinnedProvider: null,
  providerOrder: DEFAULT_PROVIDER_ORDER,
  autoRotateSeconds: 12,
  language: "zh-CN",
  skippedUpdateVersion: null,
  hiddenProviders: [],
  collapsedProviders: [],
  layoutMode: "standard",
  accentColor: "#397ae0",
  alertThreshold: 15,
  notificationsEnabled: true,
  notifyOnReset: true,
  notifyOnRecovery: true,
  quietHoursStart: 22,
  quietHoursEnd: 8,
  notificationCooldownMinutes: 120,
  updateChannel: "stable",
  automaticUpdates: true,
};

const providerSet = new Set<ProviderId>(DEFAULT_PROVIDER_ORDER);

function providerList(value: unknown): ProviderId[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is ProviderId => providerSet.has(item as ProviderId)))];
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(min, Math.min(max, Math.round(value)))
    : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function safeSkippedVersion(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= 64 ? normalized : null;
}

export function normalizeWidgetPreferences(value: Partial<WidgetPreferences> | null | undefined): WidgetPreferences {
  const candidate = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const hiddenProviders = providerList(candidate.hiddenProviders);
  const pinnedProvider = providerSet.has(candidate.pinnedProvider as ProviderId) ? candidate.pinnedProvider as ProviderId : null;
  const layoutMode = candidate.layoutMode === "compact" || candidate.layoutMode === "detailed" ? candidate.layoutMode : "standard";
  const accentColor = typeof candidate.accentColor === "string" && /^#[0-9a-f]{6}$/i.test(candidate.accentColor)
    ? candidate.accentColor
    : DEFAULT_WIDGET_PREFERENCES.accentColor;
  return {
    locked: booleanValue(candidate.locked, DEFAULT_WIDGET_PREFERENCES.locked),
    alwaysOnTop: booleanValue(candidate.alwaysOnTop, DEFAULT_WIDGET_PREFERENCES.alwaysOnTop),
    stayExpanded: booleanValue(candidate.stayExpanded, DEFAULT_WIDGET_PREFERENCES.stayExpanded),
    pinnedProvider,
    providerOrder: normalizeProviderOrder(Array.isArray(candidate.providerOrder) ? candidate.providerOrder as ProviderId[] : DEFAULT_PROVIDER_ORDER),
    autoRotateSeconds: boundedInteger(candidate.autoRotateSeconds, DEFAULT_WIDGET_PREFERENCES.autoRotateSeconds, 5, 300),
    language: candidate.language === "en" ? "en" : "zh-CN",
    skippedUpdateVersion: safeSkippedVersion(candidate.skippedUpdateVersion),
    hiddenProviders: hiddenProviders.length >= DEFAULT_PROVIDER_ORDER.length ? [] : hiddenProviders,
    collapsedProviders: providerList(candidate.collapsedProviders),
    layoutMode,
    accentColor,
    alertThreshold: boundedInteger(candidate.alertThreshold, DEFAULT_WIDGET_PREFERENCES.alertThreshold, 1, 99),
    notificationsEnabled: booleanValue(candidate.notificationsEnabled, DEFAULT_WIDGET_PREFERENCES.notificationsEnabled),
    notifyOnReset: booleanValue(candidate.notifyOnReset, DEFAULT_WIDGET_PREFERENCES.notifyOnReset),
    notifyOnRecovery: booleanValue(candidate.notifyOnRecovery, DEFAULT_WIDGET_PREFERENCES.notifyOnRecovery),
    quietHoursStart: boundedInteger(candidate.quietHoursStart, DEFAULT_WIDGET_PREFERENCES.quietHoursStart, 0, 23),
    quietHoursEnd: boundedInteger(candidate.quietHoursEnd, DEFAULT_WIDGET_PREFERENCES.quietHoursEnd, 0, 23),
    notificationCooldownMinutes: boundedInteger(candidate.notificationCooldownMinutes, DEFAULT_WIDGET_PREFERENCES.notificationCooldownMinutes, 5, 1440),
    updateChannel: candidate.updateChannel === "beta" ? "beta" : "stable",
    automaticUpdates: booleanValue(candidate.automaticUpdates, DEFAULT_WIDGET_PREFERENCES.automaticUpdates),
  };
}

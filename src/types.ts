export type ProviderId = "codex" | "qoder" | "trae" | "workbuddy" | "volcengine";
export type SnapshotStatus = "ok" | "stale" | "loading" | "unavailable" | "signed_out";
export type Language = "zh-CN" | "en";
export type LayoutMode = "compact" | "standard" | "detailed";
export type UpdateChannel = "stable" | "beta";

export interface UsageWindow {
  remainingPercent: number;
  resetsAt: string | null;
  windowSeconds: number;
}

export interface ProviderSnapshot {
  provider: ProviderId;
  displayName: string;
  plan: string | null;
  shortWindow: UsageWindow | null;
  weeklyWindow: UsageWindow | null;
  monthlyWindow?: UsageWindow | null;
  resetCredits: number | null;
  resetCreditExpiresAt?: string[];
  balanceRemaining?: number | null;
  balanceUnit?: string | null;
  updatedAt: string;
  status: SnapshotStatus;
  message: string | null;
}

export interface ResetForecast {
  score: number;
  windowHours: number;
  fetchedAt: string;
  resetAnnounced: boolean;
  resetAt?: string | null;
  sourceUrl: string;
}

export interface WidgetPreferences {
  locked: boolean;
  alwaysOnTop: boolean;
  stayExpanded: boolean;
  pinnedProvider: ProviderId | null;
  providerOrder?: ProviderId[];
  autoRotateSeconds: number;
  language: Language;
  skippedUpdateVersion?: string | null;
  hiddenProviders: ProviderId[];
  collapsedProviders: ProviderId[];
  layoutMode: LayoutMode;
  accentColor: string;
  alertThreshold: number;
  notificationsEnabled: boolean;
  notifyOnReset: boolean;
  notifyOnRecovery: boolean;
  quietHoursStart: number;
  quietHoursEnd: number;
  notificationCooldownMinutes: number;
  updateChannel: UpdateChannel;
  automaticUpdates: boolean;
}

export type ActivityKind = "quota" | "reset" | "warning" | "recovered" | "update";

export interface ActivityEvent {
  id: string;
  provider: ProviderId | null;
  kind: ActivityKind;
  occurredAt: string;
  title: string;
  detail: string;
}

export interface QuotaHistoryPoint {
  provider: ProviderId;
  capturedAt: string;
  metric: number | null;
  metricKind: "percent" | "balance" | "unlimited" | "none";
  status: SnapshotStatus;
  resetsAt: string | null;
}

export interface SavedLayout {
  id: string;
  name: string;
  createdAt: string;
  providerOrder: ProviderId[];
  hiddenProviders: ProviderId[];
  collapsedProviders: ProviderId[];
  layoutMode: LayoutMode;
  accentColor: string;
}

export interface DailyPaceBaseline {
  provider: ProviderId;
  period: "5h" | "weekly" | "monthly";
  localDate: string;
  capturedAt: string;
  remainingPercent: number;
  resetsAt: string;
  planningResetsAt: string;
  resetForecastScore: number | null;
  resetForecastWindowHours: number | null;
}

export interface RuntimeState {
  schemaVersion: 1;
  history: QuotaHistoryPoint[];
  events: ActivityEvent[];
  savedLayouts: SavedLayout[];
  lastNotifications: Record<string, string>;
  dailyPaceBaselines: Record<string, DailyPaceBaseline>;
}

export interface AppDiagnostics {
  appVersion: string;
  platform: string;
  configDirectory: string;
  preferencesBackupAvailable: boolean;
  runtimeBackupAvailable: boolean;
}

export interface VolcengineDiagnostics {
  installed: boolean;
  executablePath: string | null;
  executableSource: string | null;
  stalePath: boolean;
  cliVersion: string | null;
  authenticated: boolean;
  authMethod: string | null;
  profileName: string | null;
  profileType: string | null;
  profileRegion: string | null;
  recommendedProfile: boolean;
  lastError: string | null;
}

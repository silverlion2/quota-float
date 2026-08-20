export type ProviderId = "codex" | "qoder" | "trae" | "workbuddy" | "volcengine" | "antigravity";
export type SnapshotStatus = "ok" | "stale" | "loading" | "unavailable" | "signed_out";
export type Language = "zh-CN" | "en";
export type LayoutMode = "compact" | "standard" | "detailed";
export type CompactLayout = "float" | "ring" | "bar";
export type BarEdge = "top" | "left" | "right";
export interface BarPlacement {
  edge: BarEdge;
  offset: number;
}
export type ExpandedLayout = "dashboard" | "provider-bar" | "stacked";
export type ColorTheme = "aurora" | "graphite" | "paper";
export type AppearanceMode = "system" | "light" | "dark";
export type ResolvedAppearance = Exclude<AppearanceMode, "system">;
export type UpdateChannel = "stable" | "beta";

export const MAX_DAILY_OBSERVED_PERCENT = 10_000;

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
  compactLayout: CompactLayout;
  barEdge: BarEdge;
  barOffset: number;
  expandedLayout: ExpandedLayout;
  colorTheme: ColorTheme;
  appearanceMode: AppearanceMode;
  riskFirst: boolean;
  showHistorySparklines: boolean;
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
  monthlyApiBudgetUsd: number;
  apiBudgetAlertsEnabled: boolean;
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

export interface DailyUsageSummary {
  provider: ProviderId;
  localDate: string;
  observedUsedPercent: number;
  sampleCount: number;
  updatedAt: string;
}

export interface UsageMemory {
  retentionDays: number;
  firstCapturedAt: string | null;
  lastCapturedAt: string | null;
  totalSamples: number;
}

export type TokenContextTier = "short" | "long";

export interface CodexTokenUsageBucket {
  bucketStart: string;
  model: string;
  contextTier: TokenContextTier;
  project: string;
  terminal: string;
  sessionKey: string;
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  totalTokens: number;
  requests: number;
}

export interface CodexTokenUsageReport {
  generatedAt: string;
  rangeDays: number;
  scannedFiles: number;
  indexedFiles: number;
  reusedFiles: number;
  incrementalFiles: number;
  skippedFiles: number;
  scannedBytes: number;
  matchedEvents: number;
  scanDurationMs: number;
  cacheStatus: "rebuilt" | "incremental" | "reused" | "volatile";
  truncated: boolean;
  buckets: CodexTokenUsageBucket[];
}

export interface SavedLayout {
  id: string;
  name: string;
  createdAt: string;
  providerOrder: ProviderId[];
  hiddenProviders: ProviderId[];
  collapsedProviders: ProviderId[];
  layoutMode: LayoutMode;
  compactLayout: CompactLayout;
  barEdge: BarEdge;
  barOffset: number;
  expandedLayout: ExpandedLayout;
  colorTheme: ColorTheme;
  appearanceMode: AppearanceMode;
  riskFirst: boolean;
  showHistorySparklines: boolean;
  accentColor: string;
}

export interface DailyPaceBaseline {
  provider: ProviderId;
  period: "5h" | "weekly" | "monthly";
  localDate: string;
  capturedAt: string;
  remainingPercent: number;
  resetsAt: string;
  cycleStartedAt: string;
  cycleStartRemainingPercent: number;
  planningResetsAt: string;
  resetForecastScore: number | null;
  resetForecastWindowHours: number | null;
}

export interface RuntimeState {
  schemaVersion: 2;
  history: QuotaHistoryPoint[];
  dailyUsage: DailyUsageSummary[];
  usageMemory: UsageMemory;
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

export type ProviderId = "codex" | "qoder" | "trae" | "workbuddy" | "volcengine";
export type SnapshotStatus = "ok" | "stale" | "loading" | "unavailable" | "signed_out";
export type Language = "zh-CN" | "en";

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
  resetCredits: number | null;
  resetCreditExpiresAt?: string[];
  balanceRemaining?: number | null;
  balanceUnit?: string | null;
  updatedAt: string;
  status: SnapshotStatus;
  message: string | null;
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

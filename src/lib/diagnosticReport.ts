import type { AppDiagnostics, ProviderSnapshot, RuntimeState } from "../types";

export function buildDiagnosticReport(
  appDiagnostics: AppDiagnostics | null,
  snapshots: readonly ProviderSnapshot[],
  runtimeState: RuntimeState,
  now = new Date(),
) {
  return {
    generatedAt: now.toISOString(),
    app: appDiagnostics ? {
      appVersion: appDiagnostics.appVersion,
      platform: appDiagnostics.platform,
      preferencesBackupAvailable: appDiagnostics.preferencesBackupAvailable,
      runtimeBackupAvailable: appDiagnostics.runtimeBackupAvailable,
    } : null,
    providers: snapshots.map(({ provider, status, updatedAt }) => ({ provider, status, updatedAt })),
    historySamples: runtimeState.history.length,
    recentEvents: runtimeState.events.slice(0, 10).map(({ provider, kind, occurredAt }) => ({
      provider,
      kind,
      occurredAt,
    })),
  };
}

import { describe, expect, it } from "vitest";
import type { AppDiagnostics, ProviderSnapshot } from "../types";
import { EMPTY_RUNTIME_STATE } from "./activity";
import { buildDiagnosticReport } from "./diagnosticReport";

describe("diagnostic report privacy", () => {
  it("exports operational metadata without local paths or free-form event text", () => {
    const app: AppDiagnostics = {
      appVersion: "0.3.9",
      platform: "windows",
      configDirectory: String.raw`C:\Users\private-user\AppData\Roaming\quota-float`,
      preferencesBackupAvailable: true,
      runtimeBackupAvailable: false,
    };
    const snapshot: ProviderSnapshot = {
      provider: "codex",
      displayName: "CODEX",
      plan: null,
      shortWindow: null,
      weeklyWindow: null,
      resetCredits: null,
      updatedAt: "2026-09-09T00:00:00Z",
      status: "unavailable",
      message: "token=provider-secret",
    };
    const runtimeState = {
      ...EMPTY_RUNTIME_STATE,
      events: [{
        id: "private-event-id",
        provider: "codex" as const,
        kind: "warning" as const,
        occurredAt: "2026-09-09T00:00:00Z",
        title: "Account jane@example.com",
        detail: "Authorization: Bearer provider-secret",
      }],
    };

    const report = buildDiagnosticReport(app, [snapshot], runtimeState, new Date("2026-09-09T01:00:00Z"));
    const serialized = JSON.stringify(report);

    expect(report).toMatchObject({
      generatedAt: "2026-09-09T01:00:00.000Z",
      app: { appVersion: "0.3.9", platform: "windows" },
      providers: [{ provider: "codex", status: "unavailable", updatedAt: "2026-09-09T00:00:00Z" }],
      historySamples: 0,
      recentEvents: [{ provider: "codex", kind: "warning", occurredAt: "2026-09-09T00:00:00Z" }],
    });
    expect(serialized).not.toContain("private-user");
    expect(serialized).not.toContain("configDirectory");
    expect(serialized).not.toContain("provider-secret");
    expect(serialized).not.toContain("jane@example.com");
    expect(serialized).not.toContain("private-event-id");
  });
});

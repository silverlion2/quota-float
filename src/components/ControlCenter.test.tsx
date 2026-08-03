// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_WIDGET_PREFERENCES } from "../lib/preferences";
import type { AppDiagnostics, ProviderSnapshot, RuntimeState } from "../types";
import { ControlCenter } from "./ControlCenter";

afterEach(cleanup);

const runtimeState: RuntimeState = {
  schemaVersion: 1,
  history: [
    { provider: "codex", capturedAt: "2026-07-26T00:00:00Z", metric: 72, metricKind: "percent", status: "ok", resetsAt: null },
  ],
  events: [],
  savedLayouts: [],
  lastNotifications: {},
  dailyPaceBaselines: {},
};

const diagnostics: AppDiagnostics = {
  appVersion: "0.2.8",
  platform: "windows",
  configDirectory: "redacted",
  preferencesBackupAvailable: true,
  runtimeBackupAvailable: true,
};

const snapshots: ProviderSnapshot[] = [
  {
    provider: "codex",
    displayName: "CODEX",
    plan: "PRO",
    shortWindow: null,
    weeklyWindow: null,
    resetCredits: null,
    updatedAt: "2026-07-26T00:00:00Z",
    status: "ok",
    message: null,
  },
  {
    provider: "volcengine",
    displayName: "VOLCENGINE",
    plan: null,
    shortWindow: null,
    weeklyWindow: null,
    resetCredits: null,
    updatedAt: "2026-07-26T00:01:00Z",
    status: "signed_out",
    message: "Volcengine login expired.",
  },
];

function renderControlCenter(onRefresh = vi.fn()) {
  render(
    <ControlCenter
      preferences={{ ...DEFAULT_WIDGET_PREFERENCES, language: "en" }}
      runtimeState={runtimeState}
      snapshots={snapshots}
      diagnostics={diagnostics}
      language="en"
      onClose={vi.fn()}
      onRefresh={onRefresh}
      onPreferences={vi.fn()}
      onRuntimeState={vi.fn()}
      onExport={vi.fn()}
      onImport={vi.fn()}
      onRestore={vi.fn()}
      onCopyDiagnostics={vi.fn()}
      autostartEnabled
      onAutostart={vi.fn()}
    />,
  );
}

describe("ControlCenter provider health", () => {
  it("shows provider source, status, history, and recovery context", () => {
    renderControlCenter();
    fireEvent.click(screen.getByRole("button", { name: "Health" }));

    expect(screen.getByText("1/6 providers connected")).toBeInTheDocument();
    expect(screen.getByText("Healthy")).toBeInTheDocument();
    expect(screen.getByText("Sign-in required")).toBeInTheDocument();
    expect(screen.getByText("Codex local session")).toBeInTheDocument();
    expect(screen.getByText("Volcengine login expired.")).toBeInTheDocument();
    expect(screen.getByText("1 samples")).toBeInTheDocument();
    expect(screen.getAllByText(/Not checked yet/)).toHaveLength(4);
  });

  it("requests an immediate refresh from the health summary", () => {
    const onRefresh = vi.fn();
    renderControlCenter(onRefresh);
    fireEvent.click(screen.getByRole("button", { name: "Health" }));
    fireEvent.click(screen.getByRole("button", { name: "Refresh now" }));

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});

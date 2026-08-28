// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_WIDGET_PREFERENCES } from "../lib/preferences";
import type { AppDiagnostics, ProviderSnapshot, RuntimeState, WidgetPreferences } from "../types";
import { ControlCenter } from "./ControlCenter";

afterEach(cleanup);

const runtimeState: RuntimeState = {
  schemaVersion: 2,
  history: [
    { provider: "codex", capturedAt: "2026-07-26T00:00:00Z", metric: 72, metricKind: "percent", status: "ok", resetsAt: null },
  ],
  dailyUsage: [],
  usageMemory: { retentionDays: 90, firstCapturedAt: "2026-07-26T00:00:00Z", lastCapturedAt: "2026-07-26T00:00:00Z", totalSamples: 1 },
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

function renderControlCenter(
  onRefresh = vi.fn(),
  onPreferences = vi.fn(),
  preferences: WidgetPreferences = { ...DEFAULT_WIDGET_PREFERENCES, language: "en" },
  onRuntimeState = vi.fn(),
  state = runtimeState,
) {
  render(
    <ControlCenter
      preferences={preferences}
      runtimeState={state}
      snapshots={snapshots}
      diagnostics={diagnostics}
      language={preferences.language}
      onClose={vi.fn()}
      onRefresh={onRefresh}
      onPreferences={onPreferences}
      onRuntimeState={onRuntimeState}
      onExport={vi.fn()}
      onImport={vi.fn()}
      onRestore={vi.fn()}
      onCopyDiagnostics={vi.fn()}
      autostartEnabled
      onAutostart={vi.fn()}
    />,
  );
  return { onPreferences, onRuntimeState };
}

describe("ControlCenter provider health", () => {
  it("shows provider source, status, history, and recovery context", () => {
    renderControlCenter();
    fireEvent.click(screen.getByRole("button", { name: "Health" }));

    expect(screen.getByText("1/7 providers connected")).toBeInTheDocument();
    expect(screen.getByText("Healthy")).toBeInTheDocument();
    expect(screen.getByText("Sign-in required")).toBeInTheDocument();
    expect(screen.getByText("Codex local session")).toBeInTheDocument();
    expect(screen.getByText("Volcengine login expired.")).toBeInTheDocument();
    expect(screen.getByText("1 samples")).toBeInTheDocument();
    expect(screen.getAllByText(/Not checked yet/)).toHaveLength(5);
  });

  it("requests an immediate refresh from the health summary", () => {
    const onRefresh = vi.fn();
    renderControlCenter(onRefresh);
    fireEvent.click(screen.getByRole("button", { name: "Health" }));
    fireEvent.click(screen.getByRole("button", { name: "Refresh now" }));

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("shows persisted usage-memory coverage and lifetime samples", () => {
    renderControlCenter();
    fireEvent.click(screen.getByRole("button", { name: "Activity" }));

    expect(screen.getByText("Local usage memory")).toBeInTheDocument();
    expect(screen.getByText("90-day detail · 365-day daily summaries")).toBeInTheDocument();
    expect(screen.getByText("Lifetime samples")).toBeInTheDocument();
  });

  it("applies layout and color choices as independent preferences", () => {
    const onPreferences = vi.fn();
    renderControlCenter(vi.fn(), onPreferences);

    fireEvent.click(screen.getByRole("radio", { name: /Graphite/i }));
    expect(onPreferences).toHaveBeenCalledWith(expect.objectContaining({ colorTheme: "graphite", compactLayout: "float" }));

    fireEvent.click(screen.getByRole("radio", { name: /^Dark$/i }));
    expect(onPreferences).toHaveBeenCalledWith(expect.objectContaining({ appearanceMode: "dark" }));

    fireEvent.click(screen.getByRole("radio", { name: /^Bar/i }));
    expect(onPreferences).toHaveBeenCalledWith(expect.objectContaining({ compactLayout: "bar", colorTheme: "aurora" }));

    fireEvent.click(screen.getByRole("radio", { name: /^Provider bar/i }));
    expect(onPreferences).toHaveBeenCalledWith(expect.objectContaining({ expandedLayout: "provider-bar", colorTheme: "aurora" }));

    fireEvent.click(screen.getByRole("radio", { name: /^Cockpit/i }));
    expect(onPreferences).toHaveBeenCalledWith(expect.objectContaining({ expandedLayout: "cockpit", colorTheme: "aurora" }));

    fireEvent.click(screen.getByRole("radio", { name: /^Ring/i }));
    expect(onPreferences).toHaveBeenCalledWith(expect.objectContaining({ compactLayout: "ring", colorTheme: "aurora" }));

    fireEvent.click(screen.getByRole("radio", { name: /^Stacked/i }));
    expect(onPreferences).toHaveBeenCalledWith(expect.objectContaining({ expandedLayout: "stacked", colorTheme: "aurora" }));

    fireEvent.click(screen.getByRole("checkbox", { name: /Put attention-needed providers first/i }));
    expect(onPreferences).toHaveBeenCalledWith(expect.objectContaining({ riskFirst: true }));

    fireEvent.click(screen.getByRole("checkbox", { name: /Project focus mode/i }));
    expect(onPreferences).toHaveBeenCalledWith(expect.objectContaining({ resourceMode: "focus" }));
  });

  it("keeps provider management in an independent Providers tab", () => {
    const onPreferences = vi.fn();
    renderControlCenter(vi.fn(), onPreferences);

    const displayTab = screen.getByRole("button", { name: "Display" });
    const providersTab = screen.getByRole("button", { name: "Providers" });
    expect(displayTab).toHaveAttribute("aria-current", "page");
    expect(providersTab).not.toHaveAttribute("aria-current");
    expect(screen.queryByText("Provider display and monitoring")).not.toBeInTheDocument();

    fireEvent.click(providersTab);
    expect(providersTab).toHaveAttribute("aria-current", "page");
    expect(displayTab).not.toHaveAttribute("aria-current");
    expect(screen.getByText("Provider display and monitoring")).toBeInTheDocument();
    expect(screen.getByText("Manage visibility, row density, and background monitoring in one place.")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Visible" })[0]);
    expect(onPreferences).toHaveBeenCalledWith(expect.objectContaining({ hiddenProviders: ["codex"] }));

    fireEvent.click(screen.getAllByRole("button", { name: "Condensed row" })[0]);
    expect(onPreferences).toHaveBeenCalledWith(expect.objectContaining({ collapsedProviders: ["codex"] }));

    fireEvent.click(screen.getAllByRole("button", { name: "Monitoring" })[0]);
    expect(onPreferences).toHaveBeenCalledWith(expect.objectContaining({ pausedProviders: ["codex"] }));

    fireEvent.click(screen.getByRole("button", { name: "Reset default order" }));
    expect(onPreferences).toHaveBeenCalledWith(expect.objectContaining({
      providerOrder: DEFAULT_WIDGET_PREFERENCES.providerOrder,
      hiddenProviders: [],
      collapsedProviders: [],
    }));
  });

  it("localizes the independent Providers tab in Chinese", () => {
    renderControlCenter(
      vi.fn(),
      vi.fn(),
      { ...DEFAULT_WIDGET_PREFERENCES, language: "zh-CN" },
    );

    const providersTab = screen.getByRole("button", { name: "平台" });
    fireEvent.click(providersTab);
    expect(providersTab).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("平台显示与监控")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "监控中" })).toHaveLength(7);
  });

  it("pauses provider monitoring independently from visibility", () => {
    const onPreferences = vi.fn();
    renderControlCenter(vi.fn(), onPreferences);
    fireEvent.click(screen.getByRole("button", { name: "Providers" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Monitoring" })[0]);
    expect(onPreferences).toHaveBeenCalledWith(expect.objectContaining({ pausedProviders: ["codex"], hiddenProviders: [] }));
  });

  it("excludes paused providers from the health denominator", () => {
    renderControlCenter(vi.fn(), vi.fn(), { ...DEFAULT_WIDGET_PREFERENCES, language: "en", pausedProviders: ["volcengine"] });
    fireEvent.click(screen.getByRole("button", { name: "Health" }));
    expect(screen.getByText("1/6 providers connected")).toBeInTheDocument();
    expect(screen.getByText("Paused")).toBeInTheDocument();
  });

  it("shows magnetic edge previews for Bar and applies an edge choice", () => {
    const onPreferences = vi.fn();
    renderControlCenter(
      vi.fn(),
      onPreferences,
      { ...DEFAULT_WIDGET_PREFERENCES, language: "en", compactLayout: "bar", barEdge: "top" },
    );

    expect(screen.getByRole("radiogroup", { name: "Bar attachment edge" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Top" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("radio", { name: "Left" }));
    expect(onPreferences).toHaveBeenCalledWith(expect.objectContaining({
      compactLayout: "bar",
      barEdge: "left",
      barOffset: 0.5,
    }));
  });

  it("round-trips Bar placement through a saved layout", () => {
    const onRuntimeState = vi.fn();
    const barPreferences = {
      ...DEFAULT_WIDGET_PREFERENCES,
      language: "en" as const,
      compactLayout: "bar" as const,
      barEdge: "right" as const,
      barOffset: 0.37,
    };
    renderControlCenter(vi.fn(), vi.fn(), barPreferences, onRuntimeState);
    fireEvent.change(screen.getByPlaceholderText("Profile name"), { target: { value: "Magnetic rail" } });
    fireEvent.click(screen.getByRole("button", { name: "Save current layout" }));

    const savedState = onRuntimeState.mock.calls[0][0] as RuntimeState;
    expect(savedState.savedLayouts[0]).toEqual(expect.objectContaining({
      name: "Magnetic rail",
      compactLayout: "bar",
      barEdge: "right",
      barOffset: 0.37,
    }));

    cleanup();
    const onPreferences = vi.fn();
    renderControlCenter(vi.fn(), onPreferences, { ...DEFAULT_WIDGET_PREFERENCES, language: "en" }, vi.fn(), savedState);
    fireEvent.click(screen.getByRole("button", { name: /Magnetic rail/i }));
    expect(onPreferences).toHaveBeenCalledWith(expect.objectContaining({
      compactLayout: "bar",
      barEdge: "right",
      barOffset: 0.37,
    }));
  });
});

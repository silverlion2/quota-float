// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProviderSnapshot, VolcengineDiagnostics, WidgetPreferences } from "../types";
import { DEFAULT_WIDGET_PREFERENCES } from "../lib/preferences";
import * as usageInsights from "../lib/usageInsights";
import { QuotaBar, QuotaBottleneckBar, QuotaCard, QuotaOrb } from "./QuotaCard";

const codex: ProviderSnapshot = {
  provider: "codex",
  displayName: "CODEX",
  plan: "PRO",
  shortWindow: null,
  weeklyWindow: { remainingPercent: 74, resetsAt: "2026-07-19T00:00:00Z", windowSeconds: 604_800 },
  resetCredits: 1,
  updatedAt: "2026-07-16T00:00:00Z",
  status: "ok",
  message: null,
};

const qoder: ProviderSnapshot = {
  provider: "qoder",
  displayName: "QODER",
  plan: "PRO",
  shortWindow: null,
  weeklyWindow: null,
  resetCredits: null,
  balanceRemaining: 1280,
  balanceUnit: "credits",
  updatedAt: "2026-07-16T00:00:00Z",
  status: "ok",
  message: null,
};

const trae: ProviderSnapshot = {
  provider: "trae",
  displayName: "TRAE",
  plan: "Pro",
  shortWindow: null,
  weeklyWindow: null,
  resetCredits: null,
  balanceRemaining: 350,
  balanceUnit: "credits",
  updatedAt: "2026-07-16T00:00:00Z",
  status: "ok",
  message: null,
};

const antigravity: ProviderSnapshot = {
  provider: "antigravity",
  displayName: "ANTIGRAVITY",
  plan: "Google AI Pro",
  shortWindow: { remainingPercent: 68, resetsAt: "2026-07-19T04:00:00Z", windowSeconds: 18_000 },
  weeklyWindow: null,
  resetCredits: null,
  updatedAt: "2026-07-16T00:00:00Z",
  status: "ok",
  message: null,
};

const signedOutVolcengine: ProviderSnapshot = {
  ...codex,
  provider: "volcengine",
  displayName: "VOLCENGINE",
  plan: null,
  weeklyWindow: null,
  resetCredits: null,
  status: "signed_out",
  message: "Volcengine login expired. Reconnect to continue.",
};

const volcengine: ProviderSnapshot = {
  ...codex,
  provider: "volcengine",
  displayName: "VOLCENGINE",
  plan: "Coding Plan Personal",
  shortWindow: { remainingPercent: 90, resetsAt: "2026-07-20T03:00:00Z", windowSeconds: 18_000 },
  weeklyWindow: { remainingPercent: 80, resetsAt: "2026-07-25T00:00:00Z", windowSeconds: 604_800 },
  monthlyWindow: { remainingPercent: 45, resetsAt: "2026-08-09T00:00:00Z", windowSeconds: 31 * 86_400 },
  resetCredits: null,
};

const diagnostics: VolcengineDiagnostics = {
  installed: true,
  executablePath: "~\\AppData\\Roaming\\npm\\arkcli.cmd",
  executableSource: "npm fallback",
  stalePath: true,
  cliVersion: "arkcli version 1.0.3",
  authenticated: false,
  authMethod: null,
  profileName: "coding-plan_personal",
  profileType: "coding-plan",
  profileRegion: "cn-beijing",
  recommendedProfile: true,
  lastError: "Volcengine login expired. Reconnect to continue.",
};

const preferences: WidgetPreferences = {
  ...DEFAULT_WIDGET_PREFERENCES,
  locked: false,
      alwaysOnTop: true,
      stayExpanded: false,
  pinnedProvider: null,
  autoRotateSeconds: 12,
  language: "en",
};

const noop = () => undefined;

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("QuotaCard platform ledger", () => {
  const adaptiveProps = {
    snapshot: codex, snapshots: [codex], preferences,
    onSelectProvider: noop, onLock: noop, onLanguage: noop, onDrag: noop, onHover: noop,
    consumingProviders: new Set<string>(),
  };

  it.each(["dashboard", "provider-bar", "stacked", "cockpit"] as const)("reclaims single-provider space in %s and allows manual expansion", (expandedLayout) => {
    const { container } = render(<QuotaCard {...adaptiveProps} preferences={{ ...preferences, expandedLayout }} />);
    const card = container.querySelector(".quota-card")!;
    const width = expandedLayout === "cockpit" ? "400" : "360";
    expect(card).toHaveAttribute("data-content-width", width);
    expect(container.querySelector(".provider-ledger")).not.toBeInTheDocument();
    expect(container.querySelector(".expanded-provider-strip")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Expand provider list" }));
    expect(card).toHaveAttribute("data-content-width", "552");
    expect(screen.getByRole("button", { name: "Collapse provider list" })).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("button", { name: "Collapse provider list" }));
    expect(card).toHaveAttribute("data-content-width", width);
  });

  it("keeps a compact provider switcher when the multi-provider list is collapsed", () => {
    const onSelectProvider = vi.fn();
    const { container } = render(<QuotaCard {...adaptiveProps} snapshots={[codex, qoder]} onSelectProvider={onSelectProvider} />);
    fireEvent.click(screen.getByRole("button", { name: "Collapse provider list" }));
    expect(container.querySelector(".quota-card")).toHaveAttribute("data-content-width", "360");
    expect(container.querySelector(".provider-ledger")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "QODER" }));
    expect(onSelectProvider).toHaveBeenCalledWith("qoder");
    fireEvent.click(screen.getByRole("button", { name: "Expand provider list" }));
    expect(container.querySelector(".provider-ledger")).toBeInTheDocument();
    expect(container.querySelector(".expanded-provider-strip")).not.toBeInTheDocument();
  });

  it.each(["ok", "stale", "signed_out", "unavailable", "loading"] as const)("keeps a tracked %s provider visible and respects hidden providers", (status) => {
    const props = { ...adaptiveProps, snapshots: [codex, { ...qoder, status }] };
    const { container, rerender } = render(<QuotaCard {...props} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(container.querySelector(".quota-card")).toHaveAttribute("data-content-width", "552");
    rerender(<QuotaCard {...props} preferences={{ ...preferences, hiddenProviders: ["qoder"] }} />);
    expect(container.querySelector(".quota-card")).toHaveAttribute("data-content-width", "360");
  });

  it("adapts as sources arrive and preserves an explicit collapsed choice across refreshes", () => {
    const { container, rerender } = render(<QuotaCard {...adaptiveProps} />);
    const card = container.querySelector(".quota-card")!;
    rerender(<QuotaCard {...adaptiveProps} snapshots={[codex, qoder]} />);
    expect(card).toHaveAttribute("data-content-width", "552");
    fireEvent.click(screen.getByRole("button", { name: "Collapse provider list" }));
    rerender(<QuotaCard {...adaptiveProps} snapshots={[{ ...codex }, { ...qoder }]} />);
    expect(card).toHaveAttribute("data-content-width", "360");
  });

  it("restores the compact width after each full-width overlay closes", () => {
    const { container, rerender } = render(<QuotaCard {...adaptiveProps} />);
    const card = container.querySelector(".quota-card")!;
    for (const overlay of ["controlOpen", "diagnosticsOpen", "updateOpen"] as const) {
      rerender(<QuotaCard {...adaptiveProps} {...{ [overlay]: true }} />);
      expect(card).toHaveAttribute("data-content-width", "552");
      rerender(<QuotaCard {...adaptiveProps} />);
      expect(card).toHaveAttribute("data-content-width", "360");
    }
  });

  it("reports the provider-list choice and accepts it when the expanded card remounts", () => {
    const onProviderListPreferenceChange = vi.fn();
    const { unmount } = render(<QuotaCard {...adaptiveProps} snapshots={[codex, qoder]} providerListPreference={null} onProviderListPreferenceChange={onProviderListPreferenceChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Collapse provider list" }));
    expect(onProviderListPreferenceChange).toHaveBeenCalledWith(false);
    unmount();
    const { container } = render(<QuotaCard {...adaptiveProps} snapshots={[codex, qoder]} providerListPreference={false} onProviderListPreferenceChange={onProviderListPreferenceChange} />);
    expect(container.querySelector(".quota-card")).toHaveAttribute("data-content-width", "360");
    expect(screen.getByRole("button", { name: "Expand provider list" })).toHaveAttribute("aria-expanded", "false");
  });
  it("does not derive hidden history sparklines when the preference is off", () => {
    const recentTrend = vi.spyOn(usageInsights, "recentQuotaTrend");
    const { container } = render(
      <QuotaCard
        snapshot={codex}
        snapshots={[codex, qoder]}
        preferences={{ ...preferences, showHistorySparklines: false }}
        history={Array.from({ length: 100 }, (_, index) => ({
          provider: "codex" as const,
          capturedAt: new Date(Date.now() - index * 60_000).toISOString(),
          metric: 90 - index % 20,
          metricKind: "percent" as const,
          status: "ok" as const,
          resetsAt: codex.weeklyWindow?.resetsAt ?? null,
        }))}
        onSelectProvider={noop}
        onLock={noop}
        onLanguage={noop}
        onDrag={noop}
        onHover={noop}
        consumingProviders={new Set()}
      />,
    );

    expect(recentTrend).not.toHaveBeenCalled();
    expect(container.querySelectorAll(".provider-history")).toHaveLength(0);
    recentTrend.mockRestore();
  });

  it("reuses cockpit trend data when only the focused region changes", () => {
    const recentTrend = vi.spyOn(usageInsights, "recentQuotaTrend");
    render(
      <QuotaCard
        snapshot={codex}
        snapshots={[codex]}
        preferences={{ ...preferences, expandedLayout: "cockpit" }}
        history={[{ provider: "codex", capturedAt: new Date().toISOString(), metric: 74, metricKind: "percent", status: "ok", resetsAt: codex.weeklyWindow?.resetsAt ?? null }]}
        onSelectProvider={noop}
        onLock={noop}
        onLanguage={noop}
        onDrag={noop}
        onHover={noop}
        consumingProviders={new Set()}
      />,
    );

    expect(recentTrend).toHaveBeenCalledOnce();
    fireEvent.click(screen.getAllByRole("button", { name: "Enlarge this area" })[0]);
    expect(recentTrend).toHaveBeenCalledOnce();
    recentTrend.mockRestore();
  });

  it("shows the live Codex reset forecast and opens its source", () => {
    const onOpenResetForecast = vi.fn();
    render(
      <QuotaCard
        snapshot={codex}
        snapshots={[codex]}
        preferences={preferences}
        onSelectProvider={noop}
        onLock={noop}
        onLanguage={noop}
        onDrag={noop}
        onHover={noop}
        consumingProviders={new Set()}
        resetForecast={{
          score: 92,
          windowHours: 48,
          fetchedAt: new Date().toISOString(),
          resetAnnounced: false,
          sourceUrl: "https://codexresetradar.com/",
        }}
        onOpenResetForecast={onOpenResetForecast}
      />,
    );

    expect(screen.getByText("Public reset signal")).toBeInTheDocument();
    expect(screen.getAllByText("48h signal · 92\/100").length).toBeGreaterThan(0);
    expect(screen.getByText("Personal cycle")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Uncalibrated public reset signal/i }));
    expect(onOpenResetForecast).toHaveBeenCalledWith("https://codexresetradar.com/");
  }, 15_000);

  it("removes an expired public reset signal while keeping the provider schedule", () => {
    render(
      <QuotaCard
        snapshot={codex}
        snapshots={[codex]}
        preferences={preferences}
        onSelectProvider={noop}
        onLock={noop}
        onLanguage={noop}
        onDrag={noop}
        onHover={noop}
        consumingProviders={new Set()}
        resetForecast={{
          score: 92,
          windowHours: 48,
          fetchedAt: new Date(Date.now() - 6 * 60 * 60_000 - 1).toISOString(),
          resetAnnounced: false,
          sourceUrl: "https://codexresetradar.com/",
        }}
      />,
    );

    expect(screen.queryByText("Public reset signal")).not.toBeInTheDocument();
    expect(screen.getByText("Personal cycle")).toBeInTheDocument();
  });

  it("hides public reset signals while the provider snapshot is stale", () => {
    render(
      <QuotaCard
        snapshot={{ ...codex, status: "stale" }}
        snapshots={[codex]}
        preferences={preferences}
        onSelectProvider={noop}
        onLock={noop}
        onLanguage={noop}
        onDrag={noop}
        onHover={noop}
        consumingProviders={new Set()}
        resetForecast={{
          score: 92,
          windowHours: 48,
          fetchedAt: new Date().toISOString(),
          resetAnnounced: false,
          sourceUrl: "https://codexresetradar.com/",
        }}
      />,
    );

    expect(screen.queryByText("Public reset signal")).not.toBeInTheDocument();
  });

  it("lists real platform values and selects a connected platform", () => {
    const onSelectProvider = vi.fn();
    render(
      <QuotaCard
        snapshot={codex}
        snapshots={[codex, qoder]}
        preferences={preferences}
        onSelectProvider={onSelectProvider}
        onLock={noop}
        onLanguage={noop}
        onDrag={noop}
        onHover={noop}
        consumingProviders={new Set()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /QODER.*1,280.*credits/i }));
    expect(onSelectProvider).toHaveBeenCalledWith("qoder");
    expect(screen.getByText("Weekly remaining")).toBeInTheDocument();
  });

  it("keeps the vertical provider ledger and removes the horizontal switcher in the provider-bar layout", () => {
    const { container } = render(
      <QuotaCard
        snapshot={codex}
        snapshots={[codex, qoder]}
        preferences={{ ...preferences, expandedLayout: "provider-bar" }}
        onSelectProvider={noop}
        onLock={noop}
        onLanguage={noop}
        onDrag={noop}
        onHover={noop}
        consumingProviders={new Set()}
      />,
    );

    expect(container.querySelector(".expanded-provider-strip")).not.toBeInTheDocument();
    expect(container.querySelector(".provider-ledger")).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "Choose provider" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /QODER.*1,280.*credits/i })).toBeInTheDocument();
  });

  it("renders the cockpit overview and enlarges one region in place", () => {
    const { container } = render(
      <QuotaCard
        snapshot={codex}
        snapshots={[codex, qoder]}
        preferences={{ ...preferences, expandedLayout: "cockpit" }}
        history={[
          { provider: "codex", capturedAt: "2026-08-20T00:00:00Z", metric: 82, metricKind: "percent", status: "ok", resetsAt: "2026-08-30T00:00:00Z" },
          { provider: "codex", capturedAt: "2026-08-21T00:00:00Z", metric: 74, metricKind: "percent", status: "ok", resetsAt: "2026-08-30T00:00:00Z" },
        ]}
        dailyUsage={[{ provider: "codex", localDate: "2026-08-27", observedUsedPercent: 8, sampleCount: 3, updatedAt: "2026-08-27T12:00:00Z" }]}
        onSelectProvider={noop}
        onLock={noop}
        onLanguage={noop}
        onDrag={noop}
        onHover={noop}
        consumingProviders={new Set()}
      />,
    );

    const cockpit = screen.getByLabelText("Quota cockpit");
    expect(cockpit).toHaveAttribute("data-focus", "none");
    expect(screen.getByText("Quota snapshot")).toBeInTheDocument();
    expect(screen.getByText("Pace plan")).toBeInTheDocument();
    expect(screen.getByLabelText("90-day observed usage heatmap").querySelectorAll(".cockpit-day")).toHaveLength(91);
    expect(screen.getAllByRole("radiogroup", { name: "Choose provider" })).toHaveLength(1);

    fireEvent.click(screen.getAllByRole("button", { name: "Enlarge this area" })[2]);
    expect(cockpit).toHaveAttribute("data-focus", "activity");
    expect(screen.getByRole("button", { name: "Restore dashboard" })).toHaveAttribute("aria-pressed", "true");
    expect(container.querySelector(".quota-card")).toHaveClass("quota-card--expanded-cockpit");
  });

  it("detaches a selected cockpit region without changing its in-place focus", () => {
    const onDetach = vi.fn();
    render(
      <QuotaCard
        snapshot={codex}
        snapshots={[codex]}
        preferences={{ ...preferences, expandedLayout: "cockpit" }}
        onSelectProvider={noop}
        onLock={noop}
        onLanguage={noop}
        onDrag={noop}
        onHover={noop}
        onDetachCockpitRegion={onDetach}
        consumingProviders={new Set()}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Detach this area" })[1]);
    expect(onDetach).toHaveBeenCalledWith("pace");
    expect(screen.getByLabelText("Quota cockpit")).toHaveAttribute("data-focus", "none");
  });

  it("shows risk-first values and local history trails", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-16T00:00:00Z"));
    try {
      render(
        <QuotaCard
          snapshot={codex}
          snapshots={[codex, volcengine, antigravity]}
          preferences={{ ...preferences, riskFirst: true, showHistorySparklines: true }}
          history={[
            { provider: "codex", capturedAt: "2026-07-15T00:00:00Z", metric: 91, metricKind: "percent", status: "ok", resetsAt: null },
            { provider: "codex", capturedAt: "2026-07-16T00:00:00Z", metric: 74, metricKind: "percent", status: "ok", resetsAt: null },
          ]}
          onSelectProvider={noop}
          onLock={noop}
          onLanguage={noop}
          onDrag={noop}
          onHover={noop}
          consumingProviders={new Set()}
        />,
      );

      expect(screen.getByText("RISK FIRST")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /VOLCENGINE.*45%.*Monthly/i })).toBeInTheDocument();
      const codexRow = screen.getByRole("button", { name: /CODEX.*74%.*Weekly/i });
      const curve = codexRow.querySelector(".provider-history .quota-history-curve");
      expect(curve?.querySelector(".quota-history-line")).toBeInTheDocument();
      Object.defineProperty(curve!, "getBoundingClientRect", { configurable: true, value: () => ({ left: 0, width: 44 }) });
      fireEvent.pointerMove(curve!, { clientX: 0 });
      expect(within(curve as HTMLElement).getByText("91%")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("switches between exactly two tabs while preserving the local usage dashboard", async () => {
    render(
      <QuotaCard
        snapshot={codex}
        snapshots={[codex]}
        preferences={preferences}
        history={[
          { provider: "codex", capturedAt: "2026-07-15T00:00:00Z", metric: 82, metricKind: "percent", status: "ok", resetsAt: "2026-07-19T00:00:00Z" },
          { provider: "codex", capturedAt: "2026-07-16T00:00:00Z", metric: 74, metricKind: "percent", status: "ok", resetsAt: "2026-07-19T00:00:00Z" },
        ]}
        dailyUsage={[{ provider: "codex", localDate: "2026-07-16", observedUsedPercent: 8, sampleCount: 3, updatedAt: "2026-07-16T00:00:00Z" }]}
        resetForecast={{
          score: 92,
          windowHours: 48,
          fetchedAt: new Date().toISOString(),
          resetAnnounced: false,
          sourceUrl: "https://codexresetradar.com/",
        }}
        onSelectProvider={noop}
        onLock={noop}
        onLanguage={noop}
        onDrag={noop}
        onHover={noop}
        consumingProviders={new Set()}
      />,
    );

    const quotaTab = screen.getByRole("tab", { name: "Quota" });
    const insightsTab = screen.getByRole("tab", { name: "Insights" });
    expect(quotaTab.closest(".quota-card")).toHaveAttribute("data-content-width", "360");
    expect(screen.getAllByRole("tab")).toHaveLength(2);
    expect(quotaTab).toHaveAttribute("aria-selected", "true");

    fireEvent.click(insightsTab);
    expect(quotaTab.closest(".quota-card")).toHaveAttribute("data-content-width", "552");
    expect(insightsTab).toHaveAttribute("aria-selected", "true");
    expect(quotaTab).toHaveAttribute("aria-selected", "false");
    expect(await screen.findByRole("region", { name: "Usage insights" }, { timeout: 10_000 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "24H" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("img", { name: "24-hour quota remaining curve" })).toBeInTheDocument();
    const allHistory = screen.getByRole("button", { name: "All" });
    fireEvent.click(allHistory);
    expect(allHistory).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("img", { name: "All recorded quota remaining curve" })).toBeInTheDocument();
    expect(screen.getByText("QUOTA REMAINING · ALL")).toBeInTheDocument();
    expect(screen.getAllByText("API equivalent").length).toBeGreaterThan(0);
    expect(screen.getByText("Total Token")).toBeInTheDocument();
    expect(screen.getByText("Used this cycle")).toBeInTheDocument();
    expect(screen.getByText("Range observed")).toBeInTheDocument();
    expect(screen.getByText("Daily guide")).toBeInTheDocument();
    expect(screen.getByText("Public reset signal")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "48h signal · 92/100 · 48h · reference only" })).toBeInTheDocument();
    expect(screen.getByText("WEEKDAY × HOUR")).toBeInTheDocument();
    expect(screen.getByText(/quota retention: 90-day full samples, then daily compaction; capacity 120,000 samples \/ 100,000 daily summaries/i)).toBeInTheDocument();
    expect(screen.getByText(/actual retained coverage starts Jul 15, 2026/i)).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Alert while open" })).toHaveAttribute("title", "Checked only while Codex Insights is open");

    fireEvent.click(quotaTab);
    expect(quotaTab.closest(".quota-card")).toHaveAttribute("data-content-width", "360");
    expect(quotaTab).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("region", { name: "Usage insights" })).not.toBeInTheDocument();

    fireEvent.keyDown(quotaTab, { key: "ArrowRight" });
    expect(insightsTab).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(insightsTab, { key: "ArrowLeft" });
    expect(quotaTab).toHaveAttribute("aria-selected", "true");
  }, 15_000);

  it("labels a short-window pace guide by the hour", async () => {
    render(
      <QuotaCard
        snapshot={antigravity}
        snapshots={[antigravity]}
        preferences={preferences}
        initialInsightsOpen
        onSelectProvider={noop}
        onLock={noop}
        onLanguage={noop}
        onDrag={noop}
        onHover={noop}
        consumingProviders={new Set()}
      />,
    );

    expect(await screen.findByText("Hourly guide", {}, { timeout: 10_000 })).toBeInTheDocument();
    expect(screen.queryByText("Daily guide")).not.toBeInTheDocument();
  });

  it("omits platforms without a detected snapshot from the widget", () => {
    render(
      <QuotaCard
        snapshot={codex}
        snapshots={[codex, qoder]}
        preferences={preferences}
        onSelectProvider={noop}
        onLock={noop}
        onLanguage={noop}
        onDrag={noop}
        onHover={noop}
        consumingProviders={new Set()}
      />,
    );

    expect(screen.queryByRole("button", { name: /VOLCENGINE.*Not detected/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("keeps a balance-based platform readable in the collapsed orb", () => {
    render(<QuotaOrb snapshot={qoder} language="en" onDrag={noop} onHover={noop} />);
    expect(screen.getByLabelText("1280 credits")).toBeInTheDocument();
  });

  it("applies compact layout and color theme independently", () => {
    render(<QuotaOrb snapshot={codex} language="en" compactLayout="float" colorTheme="paper" resolvedAppearance="light" onDrag={noop} onHover={noop} />);
    expect(screen.getByLabelText("Weekly quota remaining 74%")).toHaveClass("quota-card--compact-float", "quota-card--style-paper", "quota-card--theme-light");
  });

  it("renders the Ring compact layout with any color theme", () => {
    render(<QuotaOrb snapshot={codex} language="en" compactLayout="ring" colorTheme="graphite" resolvedAppearance="dark" onDrag={noop} onHover={noop} />);
    const ring = screen.getByLabelText("Weekly quota remaining 74%");
    expect(ring).toHaveClass("quota-card--compact-ring", "quota-card--style-graphite", "quota-card--theme-dark");
    expect(ring).toHaveStyle({ "--quota-progress-angle": "266.4deg" });
  });

  it("renders the Stacked expanded layout independently from color", () => {
    const { container } = render(
      <QuotaCard
        snapshot={codex}
        snapshots={[codex, qoder]}
        preferences={{ ...preferences, expandedLayout: "stacked", colorTheme: "paper" }}
        onSelectProvider={noop}
        onLock={noop}
        onLanguage={noop}
        onDrag={noop}
        onHover={noop}
        consumingProviders={new Set()}
      />,
    );
    expect(container.querySelector(".quota-card")).toHaveClass("quota-card--expanded-stacked", "quota-card--style-paper");
  });

  it("switches providers from the compact top Bar without expanding", () => {
    const onSelectProvider = vi.fn();
    render(
      <QuotaBar
        snapshot={codex}
        snapshots={[codex, qoder, trae, antigravity]}
        edge="top"
        language="en"
        onSelectProvider={onSelectProvider}
        onDrag={noop}
        onHover={noop}
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: "QODER" }));
    expect(onSelectProvider).toHaveBeenCalledWith("qoder");
    expect(screen.getByLabelText(/CODEX 74% left On track/i)).toHaveClass("quota-card--compact-bar", "quota-card--style-aurora");
    expect(screen.getByRole("radiogroup", { name: "Choose provider" })).toHaveAttribute("aria-orientation", "horizontal");
    expect(screen.getByText("74%")).toBeInTheDocument();
    expect(screen.getByText("On track")).toBeInTheDocument();
  });

  it.each([
    ["left", "aurora", "light"],
    ["right", "aurora", "dark"],
    ["left", "graphite", "light"],
    ["right", "graphite", "dark"],
    ["left", "paper", "light"],
    ["right", "paper", "dark"],
  ] as const)("renders an upright %s Bar with its selected theme", (edge, colorTheme, resolvedAppearance) => {
    const { container } = render(
      <QuotaBar
        snapshot={codex}
        snapshots={[codex, qoder, trae, antigravity]}
        edge={edge}
        language="en"
        colorTheme={colorTheme}
        resolvedAppearance={resolvedAppearance}
        onSelectProvider={noop}
        onDrag={noop}
        onHover={noop}
      />,
    );

    const bar = screen.getByLabelText(/CODEX 74% left On track/i);
    expect(bar).toHaveClass(`quota-bar--${edge}`, `quota-card--style-${colorTheme}`, `quota-card--theme-${resolvedAppearance}`);
    expect(bar).toHaveStyle({ "--bar-progress": "74%" });
    expect(screen.getByRole("radiogroup", { name: "Choose provider" })).toHaveAttribute("aria-orientation", "vertical");
    expect(container.querySelector(".bar-metric")).toHaveTextContent("CODEX74%left");
  });

  it("maps vertical Bar slider dragging to the provider stack", () => {
    class TestPointerEvent extends MouseEvent {
      pointerId: number;

      constructor(type: string, init: MouseEventInit & { pointerId?: number } = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 1;
      }
    }
    Object.defineProperty(window, "PointerEvent", { configurable: true, value: TestPointerEvent });
    const onSelectProvider = vi.fn();
    render(
      <QuotaBar
        snapshot={codex}
        snapshots={[codex, qoder, trae, antigravity]}
        edge="left"
        language="en"
        onSelectProvider={onSelectProvider}
        onDrag={noop}
        onHover={noop}
      />,
    );
    const slider = screen.getByRole("radiogroup", { name: "Choose provider" });
    vi.spyOn(slider, "getBoundingClientRect").mockReturnValue({ top: 100, height: 200 } as DOMRect);
    fireEvent.pointerDown(slider, { button: 0, pointerId: 1, clientY: 275 });
    expect(onSelectProvider).toHaveBeenCalledWith("antigravity");
  });

  it("keeps provider selection compact and only expands from the detail zone", () => {
    vi.useFakeTimers();
    const onHover = vi.fn();
    render(
      <QuotaBar
        snapshot={codex}
        snapshots={[codex, qoder]}
        edge="top"
        language="en"
        onSelectProvider={noop}
        onDrag={noop}
        onHover={onHover}
      />,
    );
    const slider = screen.getByRole("radiogroup", { name: "Choose provider" });
    fireEvent.mouseOver(slider);
    act(() => vi.advanceTimersByTime(650));
    expect(onHover).not.toHaveBeenCalledWith(true);

    fireEvent.mouseOver(screen.getByText("On track"));
    act(() => vi.advanceTimersByTime(649));
    expect(onHover).not.toHaveBeenCalledWith(true);
    act(() => vi.advanceTimersByTime(1));
    expect(onHover).toHaveBeenCalledWith(true);
  });

  it("sorts every provider by its tightest window and keeps provider clicks switch-only", () => {
    vi.useFakeTimers();
    const onSelectProvider = vi.fn();
    const onHover = vi.fn();
    render(
      <QuotaBottleneckBar
        snapshot={codex}
        snapshots={[codex, volcengine, antigravity]}
        edge="top"
        language="en"
        onSelectProvider={onSelectProvider}
        onDrag={noop}
        onHover={onHover}
      />,
    );

    const providers = screen.getAllByRole("radio");
    expect(providers[0]).toHaveAccessibleName("VOLCENGINE · Month · 45%");
    expect(screen.getByRole("radio", { name: "CODEX · Week · 74%" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("radio", { name: "ANTIGRAVITY · 5 hours · 68%" }));
    act(() => vi.advanceTimersByTime(650));
    expect(onSelectProvider).toHaveBeenCalledWith("antigravity");
    expect(onHover).not.toHaveBeenCalledWith(true);

    fireEvent.mouseOver(screen.getByRole("button", { name: "Expand bottleneck details" }));
    act(() => vi.advanceTimersByTime(650));
    expect(onHover).toHaveBeenCalledWith(true);
  });

  it("uses roving focus and directional keys in the bottleneck provider list", () => {
    const onSelectProvider = vi.fn();
    render(
      <QuotaBottleneckBar
        snapshot={codex}
        snapshots={[codex, volcengine, antigravity]}
        edge="top"
        language="en"
        onSelectProvider={onSelectProvider}
        onDrag={noop}
        onHover={noop}
      />,
    );

    const codexButton = screen.getByRole("radio", { name: "CODEX · Week · 74%" });
    const antigravityButton = screen.getByRole("radio", { name: "ANTIGRAVITY · 5 hours · 68%" });
    expect(codexButton).toHaveAttribute("tabindex", "0");
    expect(antigravityButton).toHaveAttribute("tabindex", "-1");
    fireEvent.keyDown(codexButton, { key: "ArrowLeft" });
    expect(onSelectProvider).toHaveBeenCalledWith("antigravity");
  });

  it("returns the collapsed orb to idle after a hover ends", () => {
    vi.useFakeTimers();
    render(<QuotaOrb snapshot={qoder} language="en" onDrag={noop} onHover={noop} />);
    const orb = screen.getByLabelText("1280 credits");
    fireEvent.mouseEnter(orb);
    fireEvent.mouseLeave(orb);
    expect(orb).not.toHaveClass("quota-orb--idle");
    act(() => vi.advanceTimersByTime(2000));
    expect(orb).toHaveClass("quota-orb--idle");
  });

  it("keeps the Codex weekly design and adds a compact pace hint only", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-20T00:00:00Z"));
    try {
      const weeklyOnlyCodex: ProviderSnapshot = {
        ...codex,
        shortWindow: { remainingPercent: 5, resetsAt: "2026-07-20T05:00:00Z", windowSeconds: 18_000 },
        weeklyWindow: { remainingPercent: 74, resetsAt: "2026-07-25T00:00:00Z", windowSeconds: 604_800 },
      };
      render(
        <QuotaCard
          snapshot={weeklyOnlyCodex}
          snapshots={[weeklyOnlyCodex]}
          preferences={preferences}
          onSelectProvider={noop}
          onLock={noop}
          onLanguage={noop}
          onDrag={noop}
          onHover={noop}
          consumingProviders={new Set()}
        />,
      );
      expect(screen.getByText("Weekly remaining")).toBeInTheDocument();
      expect(screen.getByText("On track")).toBeInTheDocument();
      expect(screen.getByText("Used since reset: 26%")).toBeInTheDocument();
      expect(screen.getByText(/Today's plan: [\d.]+% left/)).toBeInTheDocument();
      expect(screen.getByText("Daily suggestion ≤ 14.8%/day")).toBeInTheDocument();
      expect(screen.queryByText("5 hours")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("explains when a balance quota has no period for pace guidance", () => {
    render(
      <QuotaCard
        snapshot={qoder}
        snapshots={[qoder]}
        preferences={preferences}
        onSelectProvider={noop}
        onLock={noop}
        onLanguage={noop}
        onDrag={noop}
        onHover={noop}
        consumingProviders={new Set()}
      />,
    );
    expect(screen.getByText("Pace needs a quota period")).toBeInTheDocument();
  });

  it("shows TRAE's credit balance in the collapsed orb", () => {
    render(<QuotaOrb snapshot={trae} language="en" onDrag={noop} onHover={noop} />);
    expect(screen.getByLabelText("350 credits")).toBeInTheDocument();
  });

  it("shows Antigravity's short-window quota in the collapsed orb", () => {
    render(<QuotaOrb snapshot={antigravity} language="en" onDrag={noop} onHover={noop} />);
    expect(screen.getByLabelText("5 hours quota remaining 68%")).toBeInTheDocument();
    expect(screen.getByText("68")).toBeInTheDocument();
  });

  it("offers an in-app reconnect action for an expired Volcengine login", () => {
    const onReconnect = vi.fn();
    render(
      <QuotaCard
        snapshot={signedOutVolcengine}
        snapshots={[signedOutVolcengine]}
        preferences={preferences}
        onSelectProvider={noop}
        onLock={noop}
        onLanguage={noop}
        onDrag={noop}
        onHover={noop}
        onReconnect={onReconnect}
        consumingProviders={new Set()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Reconnect" }));
    expect(onReconnect).toHaveBeenCalledOnce();
    expect(screen.getByText("Reconnect VOLCENGINE")).toBeInTheDocument();
  });

  it("shows Volcengine 5-hour, weekly, and monthly pace guidance", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-20T00:00:00Z"));
    try {
      render(
        <QuotaCard
          snapshot={volcengine}
          snapshots={[volcengine]}
          preferences={preferences}
          onSelectProvider={noop}
          onLock={noop}
          onLanguage={noop}
          onDrag={noop}
          onHover={noop}
          consumingProviders={new Set()}
        />,
      );

      expect(screen.getByRole("region", { name: "Quota windows" })).toHaveTextContent("5 hours");
      expect(screen.getByRole("region", { name: "Quota windows" })).toHaveTextContent("Weekly");
      expect(screen.getByRole("region", { name: "Quota windows" })).toHaveTextContent("Monthly");
      expect(screen.getAllByText(/Today's plan: [\d.]+% left/)).toHaveLength(3);
      expect(screen.getByText("Daily suggestion ≤ 30%/hour")).toBeInTheDocument();
      expect(screen.getByText(/Over pace \+[\d.]+%/)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows only redacted Volcengine diagnostics", () => {
    render(
      <QuotaCard
        snapshot={signedOutVolcengine}
        snapshots={[signedOutVolcengine]}
        preferences={preferences}
        onSelectProvider={noop}
        onLock={noop}
        onLanguage={noop}
        onDrag={noop}
        onHover={noop}
        diagnostics={diagnostics}
        diagnosticsOpen
        consumingProviders={new Set()}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Volcengine connection" });
    expect(dialog).toBeInTheDocument();
    expect(dialog.closest("main")).toHaveClass("quota-card--diagnostics-open");
    expect(dialog.closest("main")?.querySelector(".quota-card-content")).toBeInTheDocument();
    expect(screen.getByText(/~\\AppData\\Roaming\\npm\\arkcli\.cmd/)).toBeInTheDocument();
    expect(screen.queryByText(/refresh_token|ark-[a-z0-9]{8}/i)).not.toBeInTheDocument();
  });

  it("keeps a downloaded update ready until the user chooses to restart", () => {
    const onUpdateInstall = vi.fn();
    const onUpdateLater = vi.fn();
    render(
      <QuotaCard
        snapshot={codex}
        snapshots={[codex]}
        preferences={preferences}
        onSelectProvider={noop}
        onLock={noop}
        onLanguage={noop}
        onDrag={noop}
        onHover={noop}
        consumingProviders={new Set()}
        updateOpen
        updateState={{
          phase: "ready",
          info: { version: "0.2.0", body: "Background updates.", date: null, platform: "windows", channel: "stable", releaseUrl: "https://github.com/silverlion2/quota-float/releases/latest", automaticInstall: true },
          progress: { downloadedBytes: 100, totalBytes: 100, percent: 100 },
          error: null,
        }}
        onUpdateInstall={onUpdateInstall}
        onUpdateLater={onUpdateLater}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Quota Float update" });
    expect(dialog).toHaveTextContent("0.2.0 is ready");
    expect(dialog.closest("main")).toHaveClass("quota-card--update-open");
    fireEvent.click(screen.getByRole("button", { name: "Later" }));
    expect(onUpdateLater).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: /Restart and install/i }));
    expect(onUpdateInstall).toHaveBeenCalledOnce();
  });

  it("covers loading, unavailable, and attention diagnostics without exposing the quota content", () => {
    const view = render(
      <QuotaCard
        snapshot={signedOutVolcengine}
        snapshots={[signedOutVolcengine]}
        preferences={preferences}
        onSelectProvider={noop}
        onLock={noop}
        onLanguage={noop}
        onDrag={noop}
        onHover={noop}
        diagnosticsOpen
        diagnosticsLoading
        consumingProviders={new Set()}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Checking Ark CLI");
    for (const panel of screen.getAllByRole("tabpanel", { hidden: true })) {
      expect(panel).toHaveAttribute("inert");
    }

    view.rerender(
      <QuotaCard
        snapshot={signedOutVolcengine}
        snapshots={[signedOutVolcengine]}
        preferences={preferences}
        onSelectProvider={noop}
        onLock={noop}
        onLanguage={noop}
        onDrag={noop}
        onHover={noop}
        diagnosticsOpen
        consumingProviders={new Set()}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Quota service is temporarily unavailable");

    view.rerender(
      <QuotaCard
        snapshot={signedOutVolcengine}
        snapshots={[signedOutVolcengine]}
        preferences={preferences}
        onSelectProvider={noop}
        onLock={noop}
        onLanguage={noop}
        onDrag={noop}
        onHover={noop}
        diagnostics={diagnostics}
        diagnosticsOpen
        consumingProviders={new Set()}
      />,
    );

    expect(screen.getByText("Needs attention")).toBeInTheDocument();
    expect(within(screen.getByRole("dialog")).getByText("Volcengine login expired. Reconnect to continue.")).toBeInTheDocument();
  });

  it("shows when the current Codex window recently reset", () => {
    const resetAt = new Date(Date.now() - 60_000).toISOString();
    render(
      <QuotaCard
        snapshot={codex}
        snapshots={[codex]}
        preferences={preferences}
        onSelectProvider={noop}
        onLock={noop}
        onLanguage={noop}
        onDrag={noop}
        onHover={noop}
        consumingProviders={new Set()}
        recentCodexReset={{ detectedAt: resetAt, resetAt, source: "window" }}
      />,
    );

    expect(screen.getByText("Recently reset")).toBeInTheDocument();
  });

  it("removes the recent reset marker after its six-hour window", () => {
    const resetAt = new Date(Date.now() - 6 * 60 * 60_000 - 1).toISOString();
    render(
      <QuotaCard
        snapshot={codex}
        snapshots={[codex]}
        preferences={preferences}
        onSelectProvider={noop}
        onLock={noop}
        onLanguage={noop}
        onDrag={noop}
        onHover={noop}
        consumingProviders={new Set()}
        recentCodexReset={{ detectedAt: resetAt, resetAt, source: "window" }}
      />,
    );

    expect(screen.queryByText("Recently reset")).not.toBeInTheDocument();
  });

  it("reorders quota rows by dragging the grip and preserves the resulting order", () => {
    class TestPointerEvent extends MouseEvent {
      pointerId: number;

      constructor(type: string, init: MouseEventInit & { pointerId?: number } = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 1;
      }
    }
    Object.defineProperty(window, "PointerEvent", { configurable: true, value: TestPointerEvent });
    const onReorderProviders = vi.fn();
    const onWindowDrag = vi.fn();
    render(
      <QuotaCard
        snapshot={codex}
        snapshots={[codex, qoder]}
        preferences={preferences}
        onSelectProvider={noop}
        onReorderProviders={onReorderProviders}
        onLock={noop}
        onLanguage={noop}
        onDrag={onWindowDrag}
        onHover={noop}
        consumingProviders={new Set()}
      />,
    );

    const codexRow = screen.getByRole("listitem", { name: /Reorder CODEX/i });
    const qoderRow = screen.getByRole("listitem", { name: /Reorder QODER/i });
    vi.spyOn(qoderRow, "getBoundingClientRect").mockReturnValue({ top: 0, height: 20 } as DOMRect);
    const elementFromPoint = vi.fn(() => qoderRow);
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: elementFromPoint });
    const codexGrip = screen.getByRole("button", { name: /Reorder CODEX/i });

    fireEvent.mouseDown(codexGrip, { button: 0 });
    expect(onWindowDrag).not.toHaveBeenCalled();
    fireEvent.pointerDown(codexGrip, { button: 0, pointerId: 1, clientY: 1 });
    expect(codexRow).toHaveClass("is-dragging");
    fireEvent.pointerMove(codexGrip, { pointerId: 1, clientY: 1 });
    expect(qoderRow).toHaveClass("is-drag-target");
    fireEvent.pointerUp(codexGrip, { pointerId: 1, clientY: 19 });

    expect(onReorderProviders).toHaveBeenCalledWith(["qoder", "claude", "codex", "trae", "workbuddy", "volcengine", "antigravity"]);
  });

  it("supports Alt plus arrow keys as a sorting alternative", () => {
    const onReorderProviders = vi.fn();
    render(
      <QuotaCard
        snapshot={codex}
        snapshots={[codex, qoder]}
        preferences={preferences}
        onSelectProvider={noop}
        onReorderProviders={onReorderProviders}
        onLock={noop}
        onLanguage={noop}
        onDrag={noop}
        onHover={noop}
        consumingProviders={new Set()}
      />,
    );

    fireEvent.keyDown(screen.getByRole("listitem", { name: /Reorder CODEX/i }), { key: "ArrowDown", altKey: true });
    expect(onReorderProviders).toHaveBeenCalledWith(["qoder", "claude", "codex", "trae", "workbuddy", "volcengine", "antigravity"]);
  });
});

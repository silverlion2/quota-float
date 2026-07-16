// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProviderSnapshot, WidgetPreferences } from "../types";
import { QuotaCard, QuotaOrb } from "./QuotaCard";

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
  plan: "Free",
  shortWindow: null,
  weeklyWindow: null,
  resetCredits: null,
  balanceRemaining: 0,
  balanceUnit: "unlimited",
  updatedAt: "2026-07-16T00:00:00Z",
  status: "ok",
  message: null,
};

const preferences: WidgetPreferences = {
  locked: false,
  alwaysOnTop: true,
  pinnedProvider: null,
  autoRotateSeconds: 12,
  language: "en",
};

const noop = () => undefined;

afterEach(cleanup);

describe("QuotaCard platform ledger", () => {
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

  it("marks platforms without a collector as not detected", () => {
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

    expect(screen.getByRole("button", { name: /VOLCENGINE.*Not detected/i })).toBeDisabled();
  });

  it("keeps a balance-based platform readable in the collapsed orb", () => {
    render(<QuotaOrb snapshot={qoder} language="en" onDrag={noop} onHover={noop} />);
    expect(screen.getByLabelText("1280 credits")).toBeInTheDocument();
  });

  it("shows an unlimited free plan without inventing a numeric quota", () => {
    render(<QuotaOrb snapshot={trae} language="en" onDrag={noop} onHover={noop} />);
    expect(screen.getByLabelText("Unlimited")).toHaveTextContent("∞");
  });
});

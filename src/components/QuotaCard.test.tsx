// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProviderSnapshot, VolcengineDiagnostics, WidgetPreferences } from "../types";
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
  locked: false,
      alwaysOnTop: true,
      stayExpanded: false,
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

    expect(screen.getByRole("dialog", { name: "Volcengine connection" })).toBeInTheDocument();
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
          info: { version: "0.2.0", body: "Background updates.", date: null, platform: "windows" },
          progress: { downloadedBytes: 100, totalBytes: 100, percent: 100 },
          error: null,
        }}
        onUpdateInstall={onUpdateInstall}
        onUpdateLater={onUpdateLater}
      />,
    );

    expect(screen.getByRole("dialog", { name: "Quota Float update" })).toHaveTextContent("0.2.0 is ready");
    fireEvent.click(screen.getByRole("button", { name: "Later" }));
    expect(onUpdateLater).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: /Restart and install/i }));
    expect(onUpdateInstall).toHaveBeenCalledOnce();
  });

  it("shows when the current Codex window recently reset", () => {
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
        recentCodexReset={{ detectedAt: "2026-07-18T01:00:00Z", resetAt: "2026-07-18T01:00:00Z", source: "window" }}
      />,
    );

    expect(screen.getByText("Recently reset")).toBeInTheDocument();
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
    const traeRow = screen.getByRole("listitem", { name: /Reorder TRAE/i });
    vi.spyOn(traeRow, "getBoundingClientRect").mockReturnValue({ top: 0, height: 20 } as DOMRect);
    const elementFromPoint = vi.fn(() => traeRow);
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: elementFromPoint });
    const codexGrip = screen.getByRole("button", { name: /Reorder CODEX/i });

    fireEvent.mouseDown(codexGrip, { button: 0 });
    expect(onWindowDrag).not.toHaveBeenCalled();
    fireEvent.pointerDown(codexGrip, { button: 0, pointerId: 1, clientY: 1 });
    expect(codexRow).toHaveClass("is-dragging");
    fireEvent.pointerMove(codexGrip, { pointerId: 1, clientY: 1 });
    expect(traeRow).toHaveClass("is-drag-target");
    fireEvent.pointerUp(codexGrip, { pointerId: 1, clientY: 1 });

    expect(onReorderProviders).toHaveBeenCalledWith(["qoder", "codex", "trae", "workbuddy", "volcengine"]);
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
    expect(onReorderProviders).toHaveBeenCalledWith(["qoder", "codex", "trae", "workbuddy", "volcengine"]);
  });
});

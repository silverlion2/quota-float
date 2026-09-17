// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProviderSnapshot, ResetForecast } from "../types";
import { ResetOutlook } from "./ResetOutlook";

const now = new Date("2026-09-15T12:00:00Z");
afterEach(cleanup);
const snapshot: ProviderSnapshot = { provider: "codex", displayName: "CODEX", plan: "PRO", status: "ok", updatedAt: now.toISOString(), shortWindow: null, weeklyWindow: { remainingPercent: 48, resetsAt: "2026-09-16T12:00:00Z", windowSeconds: 604800 }, resetCredits: null, message: null };
const forecast: ResetForecast = { score: 67, quality: "conflicting", windowHours: 48, fetchedAt: now.toISOString(), resetAnnounced: false, sourceUrl: "https://codex-reset.com/", sources: [
  { name: "Codex Reset", score: 42, fetchedAt: now.toISOString(), lastResetAt: "2026-09-12T08:00:00Z", sourceUrl: "https://codex-reset.com/", included: true },
  { name: "Old tracker", score: 91, fetchedAt: now.toISOString(), lastResetAt: "2026-07-25T03:00:00Z", sourceUrl: "https://codexreset.app/", included: false },
] };

describe("reset consumption outlook", () => {
  it("shows a personal hourly target even when public sources conflict and opens the selected source", () => {
    const open = vi.fn();
    render(<ResetOutlook snapshot={snapshot} history={[]} forecast={forecast} now={now} language="en" onOpenSource={open} />);
    fireEvent.click(screen.getByText("Reset forecast & consumption plan"));
    expect(screen.getByText("2 pp/h")).toBeInTheDocument();
    expect(screen.getByText("Sources conflict · no estimate")).toBeInTheDocument();
    expect(screen.queryByText("67/100")).not.toBeInTheDocument();
    expect(screen.getByText(/Recent continuous history is insufficient/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Codex Reset ↗" }));
    expect(open).toHaveBeenCalledWith("https://codex-reset.com/");
  });
  it("shows burn and remaining-at-reset projections only from a continuous current-cycle history", () => {
    const history = [50, 49, 48].map((metric, index) => ({ provider: "codex" as const, capturedAt: new Date(now.getTime() - (2 - index) * 30 * 60_000).toISOString(), metric, metricKind: "percent" as const, status: "ok" as const, resetsAt: snapshot.weeklyWindow!.resetsAt }));
    render(<ResetOutlook snapshot={snapshot} history={history} forecast={null} now={now} language="en" onOpenSource={vi.fn()} />);
    expect(screen.getByText("Observed average")).toBeInTheDocument();
    expect(screen.getByText("0%")).toBeInTheDocument();
    expect(screen.getByText(/3 samples over 60 minutes/)).toBeInTheDocument();
    expect(screen.getByText("No fresh public signal")).toBeInTheDocument();
  });
  it.each(["stale", "signed_out", "unavailable"] as const)("retains public evidence but no consumption target for a %s provider", (status) => {
    render(<ResetOutlook snapshot={{ ...snapshot, status }} history={[]} forecast={forecast} now={now} language="zh-CN" onOpenSource={vi.fn()} />);
    expect(screen.getByText("重置预测与消耗计划")).toBeInTheDocument();
    expect(screen.getByText("42/100 · 来源分数")).toBeInTheDocument();
    expect(screen.queryByText("目标平均速度")).not.toBeInTheDocument();
  });
  it("keeps an expired forecast discoverable with source links and a retry action", () => {
    const retry = vi.fn();
    const open = vi.fn();
    render(<ResetOutlook snapshot={snapshot} history={[]} forecast={{ ...forecast, fetchedAt: "2026-09-15T05:59:59Z" }} now={now} language="en" onOpenSource={open} onRefresh={retry} />);
    fireEvent.click(screen.getByText("Reset forecast & consumption plan"));
    expect(screen.getByText("No fresh public signal")).toBeInTheDocument();
    expect(screen.queryByText(/42\/100/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh reset forecast" }));
    expect(retry).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Codex Reset ↗" }));
    expect(open).toHaveBeenCalledWith("https://codex-reset.com/");
  });
  it("distinguishes loading and retained-cache states", () => {
    const props = { snapshot, history: [], now, language: "en" as const, onOpenSource: vi.fn(), onRefresh: vi.fn() };
    const view = render(<ResetOutlook {...props} forecast={null} loadStatus="loading" />);
    fireEvent.click(screen.getByText("Reset forecast & consumption plan"));
    expect(screen.getByText("Loading public signals…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refreshing…" })).toBeDisabled();
    view.rerender(<ResetOutlook {...props} forecast={forecast} loadStatus="cached" />);
    expect(screen.getByRole("status")).toHaveTextContent("Refresh failed");
    expect(screen.getByText("42/100 · Tracker score")).toBeInTheDocument();
  });
});

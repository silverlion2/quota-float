// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiHotPanel, type AiHotPanelProps } from "./AiHotPanel";
import type { AiHotCreditsReport, AiHotReport } from "../lib/aihot";

const api = vi.hoisted(() => ({ open: vi.fn(), claim: vi.fn() }));
vi.mock("../lib/bridge", () => ({ openAiHotOffer: api.claim, openExternalUrl: api.open, usesSyntheticData: () => true }));
const report: AiHotReport = { checkedAt: "2026-11-16T10:00:00Z", sources: [
  { provider: "codex", status: "healthy", updatedAt: "2026-11-16T09:00:00Z", sourceUrl: "https://aihot.news/codex-reset", error: null,
    events: [{ id: "a", title: "Example reset-card grant", updatedAt: "2026-11-16T09:30:00Z", status: "likely_completed", scope: null, reportedAt: "2026-11-16T08:00:00Z", url: "https://aihot.news/codex-reset" }] },
  { provider: "claude", status: "unavailable", updatedAt: null, sourceUrl: "https://aihot.news/claude-reset", error: "private failure", events: [] },
] };
const credits: AiHotCreditsReport = { status: "healthy", checkedAt: "2026-11-16T10:00:00Z", updatedAt: "2026-11-16T09:00:00Z", sourceUrl: "https://aihot.news/free-tokens", error: null, offers: [
  { id: "offer-1", provider: "OpenAI", title: "Example developer credits", category: "monthly", amount: "Up to $5, subject to approval", instructions: "Apply on the provider website", models: "Selected models", requirements: "New developers only", validity: "30 days after approval", deadlineAt: null, verifiedAt: "2026-11-15T08:00:00Z", verification: "Source checked", claimUrl: "https://example.com/claim", sourceUrl: "https://aihot.news/free-tokens" },
  { id: "offer-2", provider: "Example Cloud", title: "Public cloud offer", category: "daily", amount: "100 tokens daily", instructions: "Check in", models: "Listed models", requirements: "Eligible regions only", validity: null, deadlineAt: "2020-01-01T00:00:00Z", verifiedAt: null, verification: "", claimUrl: "https://example.com/old", sourceUrl: "https://aihot.news/free-tokens" },
] };
const defaults = (): AiHotPanelProps => ({ language: "en", report, credits, loading: false, failed: false, onRefresh: vi.fn(), enabledProviders: ["codex"], integrationEnabled: false, onIntegrationEnabled: vi.fn(), notificationsEnabled: false, onNotificationsEnabled: vi.fn(), onMarkRead: vi.fn() });
function show(overrides: Partial<AiHotPanelProps> = {}) { const props = { ...defaults(), ...overrides }; return { ...render(<AiHotPanel {...props} />), props }; }
function showCredits(provider?: string) { fireEvent.click(screen.getByRole("button", { name: "Free-credit catalogue" })); if (provider) fireEvent.change(screen.getByRole("combobox"), { target: { value: provider } }); }
beforeEach(() => { vi.resetAllMocks(); api.open.mockResolvedValue(undefined); api.claim.mockResolvedValue(undefined); });
afterEach(cleanup);

describe("AIHOT public updates", () => {
  it("does not request automatically, exposes manual loading and explicit opt-ins", () => {
    const { props } = show({ report: null, credits: null });
    expect(props.onRefresh).not.toHaveBeenCalled();
    expect(screen.getByText(/your personal balance and reset time/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Integration and alerts"));
    expect(screen.getByRole("checkbox", { name: /Desktop alerts/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /Show public updates/ }));
    expect(props.onIntegrationEnabled).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByRole("button", { name: "Load public reports" }));
    expect(props.onRefresh).toHaveBeenCalledOnce();
  });

  it("defaults to enabled platforms and can browse all without requesting again", () => {
    const { props } = show();
    expect(screen.getByRole("combobox")).toHaveValue("enabled");
    expect(screen.getByText("Example reset-card grant")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "View source: Claude" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "all" } });
    expect(screen.getByRole("button", { name: "View source: Claude" })).toBeInTheDocument();
    expect(screen.queryByText("The source returned no reports.")).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain("private failure");
    expect(props.onRefresh).not.toHaveBeenCalled();
  });

  it("offers a clear all-public fallback when enabled platforms have no feed", () => {
    show({ enabledProviders: ["qoder"] });
    expect(screen.queryByText("Example reset-card grant")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Browse all public providers" }));
    expect(screen.getByText("Example reset-card grant")).toBeInTheDocument();
  });

  it("preserves reports during loading and partial failure, and keeps inference unconfirmed", () => {
    const view = show({ loading: true });
    expect(screen.getByRole("button", { name: "Refresh reports" })).toBeDisabled();
    expect(screen.getByText("Example reset-card grant")).toBeInTheDocument();
    expect(screen.getByText(/Likely completed · unconfirmed/)).toBeInTheDocument();
    expect(screen.queryByText(/Confirmation reported:/)).not.toBeInTheDocument();
    view.rerender(<AiHotPanel {...view.props} loading={false} failed />);
    expect(screen.getByRole("status")).toHaveTextContent("Previous reports are retained");
    expect(screen.getByText("Example reset-card grant")).toBeInTheDocument();
  });

  it("separates source freshness and confirmation time from personal arrival", () => {
    show({ report: { ...report, sources: [{ ...report.sources[0], status: "stale", events: [{ ...report.sources[0].events[0], status: "confirmed" }] }] } });
    expect(screen.getByText("Older data · not refreshed")).toBeInTheDocument();
    expect(screen.getByText(/Confirmation reported:/)).toBeInTheDocument();
    expect(screen.getByText(/Source confirmed/)).toBeInTheDocument();
    expect(screen.getByText(/do not confirm credits in your account/)).toBeInTheDocument();
  });

  it("renders native credit facts, relative validity and unknown cutoff without inventing eligibility", () => {
    show(); showCredits("enabled");
    const card = screen.getByRole("article", { name: "Example developer credits" });
    expect(within(card).getByText("Up to $5, subject to approval")).toBeInTheDocument();
    expect(within(card).getByText("New developers only")).toBeInTheDocument();
    expect(within(card).getByText("30 days after approval")).toBeInTheDocument();
    expect(within(card).getByText("No explicit deadline supplied by the source")).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Public cloud offer" })).not.toBeInTheDocument();
    expect(api.claim).not.toHaveBeenCalled();
  });

  it("filters the full catalogue by its actual provider without a network request", () => {
    const { props } = show(); showCredits();
    expect(screen.getByRole("combobox")).toHaveValue("all");
    expect(screen.getAllByRole("article")).toHaveLength(2);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "credit:Example Cloud" } });
    expect(screen.getByRole("article", { name: "Public cloud offer" })).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Example developer credits" })).not.toBeInTheDocument();
    expect(props.onRefresh).not.toHaveBeenCalled();
  });

  it("remembers separate report and credit filters and labels missing eligibility as unknown", () => {
    show({ credits: { ...credits, offers: [{ ...credits.offers[0], requirements: "" }] } });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "claude" } });
    showCredits();
    expect(screen.getByRole("combobox")).toHaveValue("all");
    expect(screen.getByText("Eligibility not specified")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "credit:OpenAI" } });
    fireEvent.click(screen.getByRole("button", { name: "Reset reports" }));
    expect(screen.getByRole("combobox")).toHaveValue("claude");
    showCredits();
    expect(screen.getByRole("combobox")).toHaveValue("credit:OpenAI");
  });

  it("opens claims by cached offer ID, never by the supplied URL", async () => {
    show(); showCredits("enabled");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Open claim website" })));
    expect(api.claim).toHaveBeenCalledWith("offer-1");
    expect(api.open).not.toHaveBeenCalled();
  });

  it.each(["stale", "unavailable"] as const)("keeps %s catalogue visible but disables claim navigation", (status) => {
    show({ credits: { ...credits, status, error: "secret raw backend error" } }); showCredits("enabled");
    expect(screen.getByRole("article", { name: "Example developer credits" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open claim website" })).toBeDisabled();
    expect(screen.getByText("Refresh the source before opening a claim website")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("secret raw backend error");
  });

  it("disables expired offers and missing claim links while keeping their conditions visible", () => {
    show({ credits: { ...credits, offers: [{ ...credits.offers[0], claimUrl: null }, credits.offers[1]] } }); showCredits("enabled");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "all" } });
    expect(screen.getByText("No claim link supplied by the source")).toBeInTheDocument();
    expect(screen.getByText("Past the stated deadline")).toBeInTheDocument();
    for (const button of screen.getAllByRole("button", { name: "Open claim website" })) expect(button).toBeDisabled();
    expect(screen.getByText("Eligible regions only")).toBeInTheDocument();
  });

  it("keeps unavailable catalogue distinct from a healthy empty response", () => {
    const view = show({ credits: { ...credits, status: "unavailable", offers: [] } }); showCredits("enabled");
    expect(screen.queryByText("The source returned no credit offers.")).not.toBeInTheDocument();
    view.rerender(<AiHotPanel {...view.props} credits={{ ...credits, offers: [] }} />);
    expect(screen.getByText("The source returned no credit offers.")).toBeInTheDocument();
  });

  it("reports generic link failures and coalesces pending claim clicks", async () => {
    let reject!: (reason: Error) => void;
    api.claim.mockReturnValue(new Promise<void>((_, fail) => { reject = fail; }));
    show(); showCredits("enabled");
    const claim = screen.getByRole("button", { name: "Open claim website" });
    fireEvent.click(claim); fireEvent.click(claim);
    expect(api.claim).toHaveBeenCalledOnce();
    expect(claim).toBeDisabled();
    await act(async () => reject(new Error("private local path")));
    expect(screen.getByRole("alert")).toHaveTextContent("Refresh the source and retry");
    expect(document.body.textContent).not.toContain("private local path");
  });

  it("marks reports read explicitly and exposes separately controlled notifications", () => {
    const { props } = show({ integrationEnabled: true });
    expect(props.onMarkRead).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Mark reports read" }));
    expect(props.onMarkRead).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByText("Integration and alerts"));
    fireEvent.click(screen.getByRole("checkbox", { name: /Desktop alerts/ }));
    expect(props.onNotificationsEnabled).toHaveBeenCalledWith(true);
  });
});

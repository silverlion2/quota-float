// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchCodexProfileStats } from "../lib/bridge";
import { CodexProfileSummary } from "./CodexProfileSummary";

vi.mock("../lib/bridge", () => ({ fetchCodexProfileStats: vi.fn() }));
afterEach(cleanup);
beforeEach(() => vi.mocked(fetchCodexProfileStats).mockReset());
const profile = { fetchedAt: new Date().toISOString(), lifetimeTokens: 42_000_000_000, peakDailyTokens: 1_200_000_000 };

describe("Codex Profile account totals", () => {
  it("clears a prior account result when native authentication changes or expires", async () => {
    vi.mocked(fetchCodexProfileStats).mockResolvedValueOnce(profile);
    render(<CodexProfileSummary language="en" />);
    expect(await screen.findByText("42,000,000,000 Token")).toBeInTheDocument();
    vi.mocked(fetchCodexProfileStats).mockRejectedValueOnce({ clearCached: true, message: "safe error" });
    fireEvent.click(screen.getByRole("button", { name: "Refresh Profile" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Profile statistics are unavailable");
    expect(screen.queryByText("42,000,000,000 Token")).not.toBeInTheDocument();
  });
  it("shows exact account totals, retains them on failure, and recovers", async () => {
    vi.mocked(fetchCodexProfileStats).mockResolvedValueOnce(profile);
    render(<CodexProfileSummary language="en" />);
    expect(await screen.findByText("42,000,000,000 Token")).toBeInTheDocument();
    vi.mocked(fetchCodexProfileStats).mockRejectedValueOnce(new Error("private detail"));
    fireEvent.click(screen.getByRole("button", { name: "Refresh Profile" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Refresh failed");
    expect(screen.getByText("42,000,000,000 Token")).toBeInTheDocument();
    expect(screen.queryByText(/private detail/)).not.toBeInTheDocument();
    vi.mocked(fetchCodexProfileStats).mockResolvedValueOnce({ ...profile, lifetimeTokens: 43_000_000_000 });
    fireEvent.click(screen.getByRole("button", { name: "Refresh Profile" }));
    expect(await screen.findByText("43,000,000,000 Token")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
  it("does not replace unavailable Profile data with a local or zero total", async () => {
    vi.mocked(fetchCodexProfileStats).mockRejectedValueOnce(new Error("offline"));
    render(<CodexProfileSummary language="zh-CN" />);
    expect(await screen.findByRole("status")).toHaveTextContent("本机记录不能替代账户终生总量");
    expect(screen.queryByText("0 Token")).not.toBeInTheDocument();
  });
  it("refreshes independently of local metadata scans and preserves missing versus zero", async () => {
    vi.mocked(fetchCodexProfileStats).mockResolvedValue({ ...profile, lifetimeTokens: 0, peakDailyTokens: null });
    const view = render(<CodexProfileSummary language="en" />);
    expect(await screen.findByText("0 Token")).toBeInTheDocument();
    expect(screen.getByText("Not provided")).toBeInTheDocument();
    view.rerender(<CodexProfileSummary language="zh-CN" />);
    await waitFor(() => expect(fetchCodexProfileStats).toHaveBeenCalledTimes(1));
  });
});

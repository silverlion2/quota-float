// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiHotPanel } from "./AiHotPanel";
import type { AiHotReport } from "../lib/aihot";

const api = vi.hoisted(() => ({ fetch: vi.fn(), open: vi.fn() }));
vi.mock("../lib/bridge", () => ({ fetchAiHotResets: api.fetch, openExternalUrl: api.open, usesSyntheticData: () => true }));
const report: AiHotReport = { checkedAt: "2026-11-16T10:00:00Z", sources: [
  { provider: "codex", status: "healthy", updatedAt: "2026-11-16T09:00:00Z", sourceUrl: "https://aihot.news/codex-reset", error: null,
    events: [{ id: "a", title: "Example reset-card grant", updatedAt: "2026-11-16T09:30:00Z", status: "likely_completed", scope: null, reportedAt: "2026-11-16T08:00:00Z", url: "https://aihot.news/codex-reset" }] },
  { provider: "claude", status: "unavailable", updatedAt: null, sourceUrl: "https://aihot.news/claude-reset", error: "private failure", events: [] },
] };
beforeEach(() => { vi.resetAllMocks(); api.fetch.mockResolvedValue(report); api.open.mockResolvedValue(undefined); });
afterEach(cleanup);

describe("AIHOT public quota reports", () => {
  it("makes no request until asked and keeps public events separate from personal quota", async () => {
    render(<AiHotPanel language="en" />);
    expect(api.fetch).not.toHaveBeenCalled();
    expect(screen.getByText(/your personal balance and reset time/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Load public reports" }));
    expect(await screen.findByText("Example reset-card grant")).toBeInTheDocument();
    expect(screen.getByText(/Likely completed · unconfirmed/)).toBeInTheDocument();
    expect(screen.queryByText(/Confirmation reported:/)).not.toBeInTheDocument();
    expect(screen.getByText(/Eligibility not specified/)).toBeInTheDocument();
    expect(screen.getByText(/Report updated:/)).toBeInTheDocument();
    expect(screen.getByText("Source verified: Unknown")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("private failure");
  });

  it("filters providers without another network request and does not present failure as an empty feed", async () => {
    render(<AiHotPanel language="en" />);
    fireEvent.click(screen.getByRole("button", { name: "Load public reports" }));
    await screen.findByText("Example reset-card grant");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "claude" } });
    expect(screen.queryByText("Example reset-card grant")).not.toBeInTheDocument();
    expect(screen.queryByText("The source returned no reports.")).not.toBeInTheDocument();
    expect(api.fetch).toHaveBeenCalledTimes(1);
  });

  it("retains reports on retry failure and only renders generic errors", async () => {
    render(<AiHotPanel language="en" />);
    fireEvent.click(screen.getByRole("button", { name: "Load public reports" }));
    await screen.findByText("Example reset-card grant");
    api.fetch.mockRejectedValueOnce(new Error("secret local path"));
    fireEvent.click(screen.getByRole("button", { name: "Refresh reports" }));
    expect(await screen.findByText(/Previous reports are retained/)).toBeInTheDocument();
    expect(screen.getByText("Example reset-card grant")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("secret local path");
  });

  it("marks confirmation-report time separately and shows stale data", async () => {
    api.fetch.mockResolvedValue({ ...report, sources: [{ ...report.sources[0], status: "stale", events: [{ ...report.sources[0].events[0], status: "confirmed" }] }] });
    render(<AiHotPanel language="en" />);
    fireEvent.click(screen.getByRole("button", { name: "Load public reports" }));
    expect(await screen.findByText("Older data · not refreshed")).toBeInTheDocument();
    expect(screen.getByText(/Confirmation reported:/)).toBeInTheDocument();
    expect(screen.getByText(/Source confirmed/)).toBeInTheDocument();
  });

  it("opens free-credit offers only on click, with safe failure feedback", async () => {
    render(<AiHotPanel language="zh-CN" />);
    expect(api.open).not.toHaveBeenCalled();
    api.open.mockRejectedValueOnce(new Error("unsafe raw detail"));
    fireEvent.click(screen.getByRole("button", { name: "查看免费额度" }));
    expect(api.open).toHaveBeenCalledWith("https://aihot.news/free-tokens");
    expect(await screen.findByRole("alert")).toHaveTextContent("无法打开来源");
    expect(document.body.textContent).not.toContain("unsafe raw detail");
  });

  it("coalesces duplicate clicks and ignores a request finishing after unmount", async () => {
    let resolve!: (value: AiHotReport) => void;
    api.fetch.mockReturnValue(new Promise<AiHotReport>((done) => { resolve = done; }));
    const view = render(<AiHotPanel language="en" />);
    const button = screen.getByRole("button", { name: "Load public reports" });
    fireEvent.click(button); fireEvent.click(button);
    expect(button).toBeDisabled();
    expect(api.fetch).toHaveBeenCalledTimes(1);
    view.unmount();
    await act(async () => resolve(report));
    await waitFor(() => expect(screen.queryByText("Example reset-card grant")).not.toBeInTheDocument());
  });
});

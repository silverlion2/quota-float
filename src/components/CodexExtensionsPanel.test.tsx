// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CodexExtensionsPanel } from "./CodexExtensionsPanel";
import type { CodexExtensionsReport } from "../lib/codexExtensions";
import { CODEX_COMPANIONS } from "../lib/codexExtensions";

const api = vi.hoisted(() => ({ fetch: vi.fn(), open: vi.fn() }));
vi.mock("../lib/bridge", () => ({ fetchCodexExtensions: api.fetch, openExternalUrl: api.open, usesSyntheticData: () => true }));
const report: CodexExtensionsReport = { status: "ok", truncated: false, warnings: [], entries: [
  { kind: "mcp", name: "docs", enabled: false, source: "codex_config" },
  { kind: "skill", name: "review", enabled: null, source: "agent_skills" },
  { kind: "plugin", name: "design@local", enabled: true, source: "codex_config" },
] };
beforeEach(() => { vi.resetAllMocks(); api.fetch.mockResolvedValue(report); api.open.mockResolvedValue(undefined); });
afterEach(cleanup);

describe("Codex extension inventory", () => {
  it("shows discovered/configured states separately and filters local names", async () => {
    render(<CodexExtensionsPanel language="en" />);
    expect(await screen.findByText("design@local")).toBeInTheDocument();
    expect(screen.getByText("Configured off")).toBeInTheDocument();
    expect(screen.getByText("Discovered")).toBeInTheDocument();
    expect(screen.getByText("Synthetic preview data")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Skills 1" }));
    expect(screen.queryByText("docs")).not.toBeInTheDocument();
    expect(screen.getByText("review")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "missing" } });
    expect(screen.getByText("No extensions in this view.")).toBeInTheDocument();
  });

  it("retains the previous inventory on refresh failure without rendering raw errors", async () => {
    render(<CodexExtensionsPanel language="en" />);
    await screen.findByText("design@local");
    api.fetch.mockRejectedValueOnce(new Error("secret-token path@example.invalid"));
    fireEvent.click(screen.getByRole("button", { name: "Rescan" }));
    expect(await screen.findByText(/Scan failed/)).toBeInTheDocument();
    expect(screen.getByText("design@local")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("secret-token");
    fireEvent.click(screen.getByRole("button", { name: "Rescan" }));
    await waitFor(() => expect(screen.queryByText(/Scan failed/)).not.toBeInTheDocument());
  });

  it("shows partial coverage and ignores native diagnostic content", async () => {
    api.fetch.mockResolvedValue({ ...report, status: "partial", warnings: ["private path"] });
    render(<CodexExtensionsPanel language="en" />);
    expect(await screen.findByText(/Inventory may be incomplete/)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("private path");
  });

  it("does not present missing sources as a healthy empty inventory", async () => {
    api.fetch.mockResolvedValue({ ...report, status: "not_found", entries: [] });
    render(<CodexExtensionsPanel language="zh-CN" />);
    expect(await screen.findByText("未发现支持的本地扩展来源。")).toBeInTheDocument();
    expect(screen.queryByText("当前范围没有扩展。")).not.toBeInTheDocument();
  });

  it("disables rescans while loading and safely ignores completion after unmount", async () => {
    let resolve!: (value: CodexExtensionsReport) => void;
    api.fetch.mockReturnValue(new Promise<CodexExtensionsReport>((done) => { resolve = done; }));
    const view = render(<CodexExtensionsPanel language="en" />);
    const rescan = screen.getByRole("button", { name: "Rescan" });
    expect(rescan).toBeDisabled();
    fireEvent.click(rescan);
    expect(api.fetch).toHaveBeenCalledTimes(1);
    view.unmount();
    await act(async () => resolve(report));
  });

  it("opens only curated repository links on demand and reports opener failures", async () => {
    render(<CodexExtensionsPanel language="en" />);
    await screen.findByText("design@local");
    expect(api.open).not.toHaveBeenCalled();
    const companion = CODEX_COMPANIONS[0];
    expect(companion).toBeDefined();
    api.open.mockRejectedValueOnce(new Error("raw failure"));
    fireEvent.click(screen.getByRole("button", { name: `Open GitHub repository: ${companion.name}` }));
    expect(api.open).toHaveBeenCalledWith(`https://github.com/${companion.repository}`);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not open the repository");
    expect(document.body.textContent).not.toContain("raw failure");
  });
});

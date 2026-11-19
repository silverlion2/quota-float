// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AiHotSummary } from "./AiHotSummary";
import type { AiHotSignal } from "../lib/aihotIntegration";
afterEach(cleanup);
it.each(["en", "zh-CN"] as const)("opens AIHOT without starting the parent window drag (%s)", (language) => {
  const open = vi.fn();
  const drag = vi.fn();
  render(<div onMouseDown={drag}>
    <AiHotSummary enabled={false} signals={[]} report={null} credits={null} provider="codex"
      loading={false} language={language} onOpen={open} />
  </div>);
  const button = screen.getByRole("button", { name: language === "en" ? "View AIHOT" : "查看 AIHOT" });
  fireEvent.mouseDown(button, { button: 0 });
  fireEvent.mouseUp(button, { button: 0 });
  fireEvent.click(button, { button: 0 });
  expect(drag).not.toHaveBeenCalled();
  expect(open).toHaveBeenCalledOnce();
});
const signal: AiHotSignal = { key: "example", eventId: "example", provider: "codex", status: "pending", unread: true,
  sourceVerifiedAt: "2026-11-17T00:00:00Z", expiresAt: "2026-11-17T06:00:00Z",
  event: { id: "example", title: "Scheduled reset", status: "announced", scope: null, updatedAt: "2026-11-17T00:00:00Z", reportedAt: null, url: "https://aihot.news/codex-reset" } };
it("keeps an obvious entry while disabled and distinguishes unconfirmed public information from account state", () => {
  const open = vi.fn();
  const props = { report: null, credits: null, provider: "codex" as const, loading: false, language: "en" as const, onOpen: open };
  const { rerender } = render(<AiHotSummary {...props} enabled={false} signals={[]} />);
  expect(screen.getByText("Connect public updates")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "View AIHOT" })); expect(open).toHaveBeenCalledOnce();
  rerender(<AiHotSummary {...props} enabled signals={[signal]} />);
  expect(screen.getByText("Unconfirmed announcement")).toBeTruthy();
  expect(screen.getByText("1 unread · 1 for this provider")).toBeTruthy();
  expect(screen.getByText("Public reports do not confirm your account reset")).toBeTruthy();
  rerender(<AiHotSummary {...props} enabled signals={[{ ...signal, unread: false }]} />);
  expect(screen.queryByText("Unconfirmed announcement")).toBeNull();
});

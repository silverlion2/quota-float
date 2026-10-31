// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ActionAlert } from "../lib/actionAlerts";
import { ActionAlerts } from "./ActionAlerts";

const now = new Date("2026-10-31T12:00:00Z");
const critical: ActionAlert = { id: "codex-reset", provider: "codex", kind: "reset-expiry", severity: "critical", title: "Reset expires soon", detail: "Check usage before expiry", actionLabel: "Open usage", action: "codex-usage", deadline: "2026-10-31T13:00:00Z", repeatMinutes: 15 };
const other: ActionAlert = { ...critical, id: "claude-low", provider: "claude", kind: "low-quota", severity: "warning", title: "Claude quota low", actionLabel: "View Claude", action: "provider", deadline: null };
afterEach(cleanup);
const setup = (alerts = [other, critical], snoozes: Record<string, string> = {}) => {
  const onAction = vi.fn(); const onSnooze = vi.fn(); const onRefresh = vi.fn();
  const view = render(<ActionAlerts alerts={alerts} snoozes={snoozes} language="en" now={now} onAction={onAction} onSnooze={onSnooze} onRefresh={onRefresh} />);
  return { ...view, onAction, onSnooze, onRefresh };
};
describe("ActionAlerts", () => {
  it("shows the highest priority item and sends explicit actions without claiming completion", () => {
    const { onAction, onSnooze, onRefresh } = setup();
    expect(screen.getByText("Reset expires soon")).toBeVisible();
    expect(screen.queryByText("Claude quota low")).not.toBeInTheDocument();
    expect(screen.getByText("2 active · 2 total")).toBeVisible();
    expect(document.querySelector('time[datetime="2026-10-31T13:00:00Z"]')).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open usage" }));
    expect(onAction).toHaveBeenCalledWith(critical);
    fireEvent.click(screen.getByRole("button", { name: "Remind later (up to 15m)" }));
    expect(onSnooze).toHaveBeenCalledWith(critical);
    fireEvent.click(screen.getByRole("button", { name: "Action taken · refresh to confirm" }));
    expect(onRefresh).toHaveBeenCalledOnce();
    expect(screen.getByText("Reset expires soon")).toBeVisible();
  });
  it("expands the full queue once without duplicating the top item", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "View all" }));
    expect(screen.getByRole("button", { name: "Collapse" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByText("Reset expires soon")).toHaveLength(1);
    expect(screen.getByText("Claude quota low")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Collapse" }));
    expect(screen.queryByText("Claude quota low")).not.toBeInTheDocument();
  });
  it("keeps snoozed items in the queue with their resume time", () => {
    setup(undefined, { [critical.id]: "2026-10-31T12:10:00Z" });
    expect(screen.getByText("1 active · 2 total")).toBeVisible();
    expect(screen.getByText("Claude quota low")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "View all" }));
    expect(screen.getByText("Snoozed until")).toBeVisible();
    expect(document.querySelector('time[datetime="2026-10-31T12:10:00Z"]')).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Remind later (up to 15m)" })).toHaveLength(1);
  });
  it("shows an honest all-snoozed summary", () => {
    setup([critical], { [critical.id]: "2026-10-31T12:10:00Z" });
    expect(screen.getByText("0 active · 1 total")).toBeVisible();
    expect(screen.getByText(/All reminders snoozed/)).toBeVisible();
  });
  it("renders nothing for an empty queue", () => {
    const { container } = setup([]);
    expect(container).toBeEmptyDOMElement();
  });
});

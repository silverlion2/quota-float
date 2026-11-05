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

describe("ActionAlerts action desk", () => {
  it("filters each kind and resumes a paused item without performing its action", () => {
    const onResume = vi.fn(); const onAction = vi.fn();
    render(<ActionAlerts alerts={[critical, other]} language="en" now={now} snoozes={{ [critical.id]: "2026-10-31T12:10:00Z" }} onResume={onResume} onAction={onAction} onSnooze={vi.fn()} onRefresh={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "View all" }));
    fireEvent.click(screen.getByRole("button", { name: "Quota" }));
    expect(screen.queryByText(critical.title)).not.toBeInTheDocument();
    expect(screen.getByText(other.title)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Later" }));
    expect(screen.queryByText(other.title)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Resume now" }));
    expect(onResume).toHaveBeenCalledWith(critical);
    expect(onAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Expiry" }));
    expect(screen.getByText(critical.title)).toBeVisible();
  });
  it("keeps actionable amounts visible while evidence is collapsed", () => {
    setup([{ ...critical, amountLabel: "12 reset credits", evidenceLabel: "Latest provider snapshot" }]);
    expect(screen.getByText("12 reset credits")).toBeVisible();
    expect(screen.getByText("Check usage before expiry")).not.toBeVisible();
    fireEvent.click(screen.getByText("Why this reminder"));
    expect(screen.getByText("Check usage before expiry")).toBeVisible();
    expect(screen.getByText("Latest provider snapshot")).toBeVisible();
  });
  it("offers truthful bounded history even when no reminders remain", () => {
    const records = Array.from({ length: 23 }, (_, index) => ({ key: `closed-${index}`, provider: "codex" as const, kind: critical.kind, title: "Expires in 1h", detail: `Recorded context ${index}`, deadline: critical.deadline, firstSeenAt: now.toISOString(), lastSeenAt: now.toISOString(), status: index % 2 ? "deadline-passed" as const : "no-longer-observed" as const, closedAt: new Date(now.getTime() + index * 1000).toISOString() }));
    render(<ActionAlerts alerts={[]} history={records} language="en" now={now} onAction={vi.fn()} onSnooze={vi.fn()} onRefresh={vi.fn()} />);
    expect(screen.getByText(/No active reminders/)).toBeVisible();
    expect(screen.queryByText("Expires in 1h")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Local history"));
    expect(screen.getAllByText(/Recorded time passed; usage still needs checking/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/No longer meets reminder conditions after refresh/).length).toBeGreaterThan(0);
    expect(document.querySelectorAll(".action-alerts__history-list>article")).toHaveLength(20);
    expect(screen.queryByText("Recorded context 0")).not.toBeInTheDocument();
  });
  it("keeps separate deadlines visible in the queue and labels reached times honestly", () => {
    setup([critical, { ...critical, id: "another-grant", deadline: "2026-10-31T11:59:00Z", title: "Another grant" }]);
    expect(screen.getByText("Time reached · refresh")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "View all" }));
    expect(document.querySelector('time[datetime="2026-10-31T13:00:00Z"]')).toBeVisible();
    expect(document.querySelector('time[datetime="2026-10-31T11:59:00Z"]')).toBeVisible();
  });
});

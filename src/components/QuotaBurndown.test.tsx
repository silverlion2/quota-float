// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ProviderSnapshot, QuotaHistoryPoint } from "../types";
import { QuotaBurndown as Burndown } from "./QuotaBurndown";
import { calculateResetConsumptionPlan } from "../lib/resetConsumptionPlan";
function QuotaBurndown({ snapshot, history, now, language }: { snapshot: ProviderSnapshot; history: QuotaHistoryPoint[]; now: Date; language: "en" | "zh-CN" }) {
  return <Burndown plan={calculateResetConsumptionPlan(snapshot, history, now)} resetsAt={snapshot.weeklyWindow!.resetsAt!} language={language} />;
}
import { formatDateTime } from "../lib/format";

afterEach(cleanup);
const now = new Date("2026-10-21T12:00:00Z");
const snapshot: ProviderSnapshot = {
  provider: "codex", displayName: "CODEX", plan: "Pro", status: "ok", updatedAt: now.toISOString(),
  weeklyWindow: { remainingPercent: 48, resetsAt: "2026-10-22T12:00:00Z", windowSeconds: 604800 },
  shortWindow: null, resetCredits: null, message: null,
};
const history: QuotaHistoryPoint[] = [50, 49, 48].map((metric, i) => ({
  provider: "codex", capturedAt: new Date(now.getTime() - (2 - i) * 30 * 60000).toISOString(),
  metric, metricKind: "percent", status: "ok", resetsAt: snapshot.weeklyWindow!.resetsAt,
}));
describe("QuotaBurndown", () => {
  it("reuses recorded-point keyboard inspection and fills the observed time range", () => {
    const { container } = render(<QuotaBurndown snapshot={snapshot} history={history} now={now} language="en" />);
    const chart = screen.getByRole("img");
    fireEvent.focus(chart);
    expect(within(chart).getByRole("status")).toHaveTextContent("48%");
    fireEvent.keyDown(chart, { key: "Home" });
    expect(within(chart).getByRole("status")).toHaveTextContent("50%");
    fireEvent.keyDown(chart, { key: "ArrowRight" });
    expect(within(chart).getByRole("status")).toHaveTextContent("49%");
    fireEvent.keyDown(chart, { key: "End" });
    expect(within(chart).getByRole("status")).toHaveTextContent("48%");
    expect(screen.getByText(/not a forecast/)).toBeInTheDocument();
    expect(container.querySelector(".quota-burndown-guide")).toHaveAttribute("y1", "38");
    expect(container.querySelector(".quota-history-line")).toHaveAttribute("d", "M 4.0,38.0 L 110.0,38.6 L 216.0,39.1");
    expect(screen.getByText(/Personal reset/, { selector: "p" })).toHaveTextContent(formatDateTime(snapshot.updatedAt, "en"));
  });
  it("shows one real sample without an even-use guide", () => {
    const { container } = render(<QuotaBurndown snapshot={snapshot} history={[]} now={now} language="zh-CN" />);
    expect(container.querySelector(".quota-burndown-guide")).toBeNull();
    expect(container.querySelectorAll(".quota-history-sample")).toHaveLength(1);
    fireEvent.focus(screen.getByRole("img"));
    expect(screen.getByRole("status")).toHaveTextContent("48%");
  });
  it("removes stale data and remains inspectable when history shrinks", () => {
    const { rerender } = render(<QuotaBurndown snapshot={snapshot} history={history} now={now} language="en" />);
    fireEvent.focus(screen.getByRole("img"));
    fireEvent.keyDown(screen.getByRole("img"), { key: "End" });
    rerender(<QuotaBurndown snapshot={snapshot} history={[]} now={now} language="en" />);
    expect(screen.getByRole("status")).toHaveTextContent("48%");
    rerender(<QuotaBurndown snapshot={{ ...snapshot, status: "stale" }} history={history} now={now} language="en" />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});

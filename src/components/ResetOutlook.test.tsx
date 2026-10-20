// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProviderSnapshot, ResetForecast, ResetPrediction } from "../types";
import { formatDateTime } from "../lib/format";
import { ResetOutlook } from "./ResetOutlook";

const now = new Date("2026-09-15T12:00:00Z");
afterEach(cleanup);
const snapshot: ProviderSnapshot = { provider: "codex", displayName: "CODEX", plan: "PRO", status: "ok", updatedAt: now.toISOString(), shortWindow: null, weeklyWindow: { remainingPercent: 48, resetsAt: "2026-09-16T12:00:00Z", windowSeconds: 604800 }, resetCredits: null, message: null };
const forecast: ResetForecast = { score: 67, quality: "conflicting", windowHours: 48, fetchedAt: now.toISOString(), resetAnnounced: false, sourceUrl: "https://codex-reset.com/", sources: [
  { name: "Codex Reset", score: 42, fetchedAt: now.toISOString(), lastResetAt: "2026-09-12T08:00:00Z", sourceUrl: "https://codex-reset.com/", included: true },
  { name: "Old tracker", score: 91, fetchedAt: now.toISOString(), lastResetAt: "2026-07-25T03:00:00Z", sourceUrl: "https://codexreset.app/", included: false },
] };
const prediction: ResetPrediction = {
  sourceName: "Codex Reset", sourceUrl: forecast.sourceUrl, basis: "source_model",
  reportedLastResetAt: "2026-09-12T08:00:00Z", generatedAt: now.toISOString(), validUntil: "2026-09-17T12:00:00Z",
  estimate24h: 19, estimate48h: 34, range24h: { lower: 12, upper: 29 }, range48h: { lower: 22, upper: 48 },
  calibration: "experimental", expectedWindow: null, watchWindow: null, confidence: "low", reason: "Historical reset model",
};

describe("reset consumption outlook", () => {
  it("shows a personal hourly target even when public sources conflict and opens the selected source", () => {
    const open = vi.fn();
    render(<ResetOutlook snapshot={snapshot} history={[]} forecast={forecast} now={now} language="en" onOpenSource={open} />);
    fireEvent.click(screen.getByText("Reset forecast & consumption plan"));
    expect(screen.getByText("2 pp/h")).toBeInTheDocument();
    expect(screen.getByText("48h reference · 42/100")).toBeInTheDocument();
    expect(screen.queryByText("67/100")).not.toBeInTheDocument();
    expect(screen.getByText(/Usage estimate needs 3 continuous samples/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Why this forecast? View sources"));
    fireEvent.click(screen.getByRole("button", { name: "Codex Reset ↗" }));
    expect(open).toHaveBeenCalledWith("https://codex-reset.com/");
  });
  it("shows burn and remaining-at-reset projections only from a continuous current-cycle history", () => {
    const history = [50, 49, 48].map((metric, index) => ({ provider: "codex" as const, capturedAt: new Date(now.getTime() - (2 - index) * 30 * 60_000).toISOString(), metric, metricKind: "percent" as const, status: "ok" as const, resetsAt: snapshot.weeklyWindow!.resetsAt }));
    render(<ResetOutlook snapshot={snapshot} history={history} forecast={null} now={now} language="en" onOpenSource={vi.fn()} />);
    expect(screen.getByText("Observed average")).toBeInTheDocument();
    expect(screen.getByText("0%", { selector: "dd" })).toBeInTheDocument();
    expect(screen.getByText(/3 samples \/ 60 min/)).toBeInTheDocument();
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
    fireEvent.click(screen.getByText("Why this forecast? View sources"));
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
  it("shows the model's 19%/34% horizons and uncertainty even when source scores conflict", () => {
    render(<ResetOutlook snapshot={snapshot} history={[]} forecast={{ ...forecast, prediction }} now={now} language="en" onOpenSource={vi.fn()} open />);
    const model = within(screen.getByRole("region", { name: "Global reset prediction" }));
    expect(screen.getByText("48h estimate · 34%")).toBeInTheDocument();
    expect(model.getByText("19%", { exact: false })).toHaveTextContent("12–29% model range");
    expect(model.getByText("34%", { exact: false })).toHaveTextContent("22–48% model range");
    expect(model.getByText(/A reset is not the leading 48-hour outcome/)).toBeInTheDocument();
    expect(screen.getByText(/Sources disagree/)).toBeInTheDocument();
    expect(screen.getByText("42/100 · Tracker score")).toBeInTheDocument();
    expect(screen.getByText("2 pp/h")).toBeInTheDocument();
  });
  it("does not turn a 24h source signal or its supplied range into a probability", () => {
    render(<ResetOutlook snapshot={snapshot} history={[]} forecast={{ ...forecast, prediction: { ...prediction, basis: "source_signal", calibration: "uncalibrated", estimate24h: 24 } }} now={now} language="en" onOpenSource={vi.fn()} open />);
    const model = screen.getByRole("region", { name: "Global reset prediction" });
    expect(within(model).getByText("24/100")).toBeInTheDocument();
    expect(within(model).getByText("34/100")).toBeInTheDocument();
    expect(model).not.toHaveTextContent("%");
    expect(model).not.toHaveTextContent("model range");
    expect(model).toHaveTextContent("This is a tracker score, not a reset probability");
  });
  it("keeps watch timestamps fixed and removes the watch window at its original expiry", () => {
    const watchWindow = { startAt: "2026-09-15T13:00:00Z", endAt: "2026-09-15T14:00:00Z" };
    const props = { snapshot, history: [], forecast: { ...forecast, prediction: { ...prediction, estimate48h: 75, range48h: { lower: 55, upper: 90 }, watchWindow } }, language: "en" as const, onOpenSource: vi.fn(), open: true };
    const view = render(<ResetOutlook {...props} now={now} />);
    const windowText = `${formatDateTime(watchWindow.startAt, "en")} – ${formatDateTime(watchWindow.endAt, "en")}`;
    expect(screen.getByText(windowText)).toBeInTheDocument();
    view.rerender(<ResetOutlook {...props} now={new Date("2026-09-15T13:30:00Z")} />);
    expect(screen.getByText(windowText)).toBeInTheDocument();
    view.rerender(<ResetOutlook {...props} now={new Date(watchWindow.endAt)} />);
    expect(screen.queryByText("Watch window · local time")).not.toBeInTheDocument();
    expect(screen.queryByText(windowText)).not.toBeInTheDocument();
    expect(screen.getByText(/Check again before a long session/)).toBeInTheDocument();
    expect(screen.queryByText(/Recheck during the watch window/)).not.toBeInTheDocument();
    expect(screen.getByText(/No reliable reset date is available/)).toBeInTheDocument();
  });
  it("retains an unverified reported window beyond 48h when it is within the 14-day source horizon", () => {
    const expectedWindow = { startAt: "2026-09-18T12:00:00Z", endAt: "2026-09-19T12:00:00Z" };
    const props = { snapshot, history: [], forecast: { ...forecast, prediction: { ...prediction, expectedWindow } }, now, language: "en" as const, onOpenSource: vi.fn(), open: true };
    const view = render(<ResetOutlook {...props} />);
    expect(screen.getByText("Reported window · unverified")).toBeInTheDocument();
    expect(screen.getByText(`${formatDateTime(expectedWindow.startAt, "en")} – ${formatDateTime(expectedWindow.endAt, "en")}`)).toBeInTheDocument();
    expect(screen.queryByText("Watch window · local time")).not.toBeInTheDocument();
    view.rerender(<ResetOutlook {...props} forecast={{ ...forecast, prediction: { ...prediction, expectedWindow: { startAt: "2026-09-28T12:00:00Z", endAt: "2026-09-30T12:00:00Z" } } }} />);
    expect(screen.queryByText("Reported window · unverified")).not.toBeInTheDocument();
  });
  it("shows original model time and expiry for retained cache, then removes a stale model despite a fresh fetch", () => {
    const cachedPrediction = { ...prediction, generatedAt: "2026-09-15T10:00:00Z", validUntil: "2026-09-17T10:00:00Z" };
    const props = { snapshot, history: [], forecast: { ...forecast, prediction: cachedPrediction }, now, language: "en" as const, onOpenSource: vi.fn(), loadStatus: "cached" as const, open: true };
    const view = render(<ResetOutlook {...props} />);
    expect(screen.getByRole("status")).toHaveTextContent("original expiry is unchanged");
    expect(screen.getByText(/As of/)).toHaveTextContent(`As of ${formatDateTime(cachedPrediction.generatedAt, "en")}`);
    expect(screen.getByText("48h forecast ends").closest("div")).toHaveTextContent(formatDateTime(cachedPrediction.validUntil, "en"));
    view.rerender(<ResetOutlook {...props} now={new Date("2026-09-15T17:00:00Z")} forecast={{ ...props.forecast, fetchedAt: "2026-09-15T17:00:00Z" }} />);
    expect(screen.getByText("No fresh public signal")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Global reset prediction" })).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

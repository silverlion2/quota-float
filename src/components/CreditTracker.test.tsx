// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProviderSnapshot, QuotaHistoryPoint } from "../types";
import { CreditTracker } from "./CreditTracker";

const now = new Date("2026-10-25T12:00:00Z");
const snapshot: ProviderSnapshot = { provider: "codex", displayName: "Codex", plan: "Pro", shortWindow: null, weeklyWindow: null, resetCredits: 2, resetCreditExpiresAt: ["2026-10-27T10:00:00Z"], balanceRemaining: 100, balanceUnit: "credits", updatedAt: "2026-10-25T11:00:00Z", status: "ok", message: null };
afterEach(cleanup);
const show = (overrides: Partial<ProviderSnapshot> = {}, history: QuotaHistoryPoint[] = [], language: "en" | "zh-CN" = "en") => render(<CreditTracker snapshot={{ ...snapshot, ...overrides }} history={history} now={now} language={language} />);

describe("CreditTracker", () => {
  it("keeps both Codex pools and nearest reported expiry visible when collapsed", () => {
    show();
    expect(screen.getByText("Reset credits")).toBeVisible();
    expect(screen.getByText("Extra credits")).toBeVisible();
    expect(screen.getByText("Within 7 days")).toBeVisible();
    expect(screen.getByText("Expiry not provided")).toBeVisible();
    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "false");
    expect(document.querySelector("time")?.getAttribute("datetime")).toBe("2026-10-27T10:00:00Z");
  });
  it("localizes labels and explains Codex expiry limitations", () => {
    show({}, [], "zh-CN");
    expect(screen.getByText("额外 credits")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /Credits 明细/ }));
    expect(screen.getByText("当前账号数据未包含额外 credits 的逐笔到期时间。")).toBeVisible();
    expect(screen.getByText(/可能仅覆盖部分余额/)).toBeVisible();
    expect(screen.getByText(/并非账单明细/)).toBeVisible();
  });
  it("does not imply zero credits have a future expiration", () => {
    show({ resetCredits: 0, balanceRemaining: 0 });
    expect(screen.getAllByText("No credits remaining")).toHaveLength(2);
    expect(screen.queryByText("Within 7 days")).not.toBeInTheDocument();
    expect(document.querySelector("time")).toBeNull();
    fireEvent.click(screen.getByRole("button"));
    expect(document.querySelector('time[datetime="2026-10-27T10:00:00Z"]')).toBeNull();
  });
  it("marks stale amounts as last known and preserves expired dates without deduction", () => {
    show({ status: "stale", resetCreditExpiresAt: ["2026-10-24T10:00:00Z"] });
    expect(screen.getByText("Last known · stale")).toBeVisible();
    expect(screen.getByText("Expired")).toBeVisible();
    expect(screen.getByText("2")).toBeVisible();
  });
  it("shows partial grant amounts and unknown expiry separately", () => {
    show({ balanceGrants: [{ remaining: 30, expiresAt: "2026-10-28T10:00:00Z" }, { remaining: 70, expiresAt: null }] });
    expect(screen.getByText("Some expiry dates unknown")).toBeVisible();
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("30 credits")).toBeVisible();
    expect(screen.getByText("70 credits")).toBeVisible();
    expect(screen.getByText("Expiry not provided")).toBeVisible();
    expect(screen.getByText(/may cover only part/)).toBeVisible();
  });
  it("expands local changes with cautious delta wording and exact data time", () => {
    const history: QuotaHistoryPoint[] = [120, 100].map((balance, index) => ({ provider: "codex", capturedAt: `2026-10-25T${index ? "11" : "10"}:00:00Z`, metric: 80, metricKind: "percent", status: "ok", resetsAt: null, credits: { balance, reset: 2, unit: "credits" } }));
    show({}, history);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("(-20)")).toBeVisible();
    expect(screen.getByText(/consumption, expiry or refills/)).toBeVisible();
    expect(screen.getByText("Data timestamp")).toBeVisible();
    const expected = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "short" }).format(new Date(snapshot.updatedAt));
    expect(screen.getAllByText(expected).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.queryByText(/consumption, expiry or refills/)).not.toBeInTheDocument();
  });
  it("handles signed-out and unlimited data explicitly", () => {
    const view = show({ status: "signed_out" });
    expect(screen.getByText("Sign in required")).toBeVisible();
    expect(screen.queryByText("100")).not.toBeInTheDocument();
    view.unmount();
    show({ balanceUnit: "unlimited" });
    expect(screen.getByText("∞")).toBeVisible();
    expect(screen.getByText("Unlimited · expiry not provided")).toBeVisible();
  });
  it("supports legacy initial expansion and blocks native drag from the entire tracker", () => {
    const onMouseDown = vi.fn();
    render(<div onMouseDown={onMouseDown}><CreditTracker snapshot={snapshot} history={[]} now={now} language="en" defaultExpanded /></div>);
    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "true");
    fireEvent.mouseDown(screen.getByText("Data timestamp"));
    expect(onMouseDown).not.toHaveBeenCalled();
  });
  it("marks old otherwise healthy snapshots stale", () => {
    show({ updatedAt: "2026-10-25T10:00:00Z" });
    expect(screen.getByText("Last known · stale")).toBeVisible();
  });
  it("keeps partial-expiry uncertainty visible in Chinese", () => {
    show({ balanceGrants: [{ remaining: 30, expiresAt: "2026-10-28T10:00:00Z" }, { remaining: null, expiresAt: null }] }, [], "zh-CN");
    expect(screen.getByText("部分到期时间未知")).toBeVisible();
    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "false");
  });
});

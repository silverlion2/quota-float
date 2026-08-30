// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { QuotaHistoryCurve } from "./QuotaHistoryCurve";

const points = [
  { capturedAt: "2026-08-07T08:00:00Z", remainingPercent: 90 },
  { capturedAt: "2026-08-07T12:00:00Z", remainingPercent: 80 },
  { capturedAt: "2026-08-08T08:00:00Z", remainingPercent: 70 },
];

afterEach(cleanup);

function movePointer(element: Element, clientX: number) {
  fireEvent(element, new MouseEvent("pointermove", { bubbles: true, clientX }));
}

describe("QuotaHistoryCurve", () => {
  it("shows the nearest time point and remaining percentage on pointer hover", () => {
    render(<QuotaHistoryCurve points={points} language="en" variant="insights" now={new Date("2026-08-08T08:00:00Z")} />);
    const curve = screen.getByRole("img", { name: "24-hour quota remaining curve" });
    Object.defineProperty(curve, "getBoundingClientRect", { configurable: true, value: () => ({ left: 0, width: 220 }) });

    movePointer(curve, 4);

    expect(within(curve).getByText("90%")).toBeInTheDocument();
    expect(within(curve).getByText("remaining")).toBeInTheDocument();
    expect(within(curve).getByRole("status")).toHaveClass("is-start");
  });

  it("localizes the right-edge tooltip without letting it overflow the curve", () => {
    render(<QuotaHistoryCurve points={points} language="zh-CN" variant="insights" now={new Date("2026-08-08T08:00:00Z")} />);
    const curve = screen.getByRole("img", { name: "24 小时剩余额度曲线" });
    Object.defineProperty(curve, "getBoundingClientRect", { configurable: true, value: () => ({ left: 0, width: 220 }) });

    movePointer(curve, 219);

    expect(within(curve).getByText("70%")).toBeInTheDocument();
    expect(within(curve).getByText("剩余")).toBeInTheDocument();
    expect(within(curve).getByRole("status")).toHaveClass("is-end");
  });

  it("supports keyboard inspection across every captured point", () => {
    render(<QuotaHistoryCurve points={points} language="en" variant="cockpit" now={new Date("2026-08-08T08:00:00Z")} />);
    const curve = screen.getByRole("img", { name: "24-hour quota remaining curve" });

    fireEvent.focus(curve);
    expect(within(curve).getByText("70%")).toBeInTheDocument();
    fireEvent.keyDown(curve, { key: "ArrowLeft" });
    expect(within(curve).getByText("80%")).toBeInTheDocument();
    fireEvent.keyDown(curve, { key: "Home" });
    expect(within(curve).getByText("90%")).toBeInTheDocument();
  });

  it("keeps an empty curve out of the keyboard tab order", () => {
    render(<QuotaHistoryCurve points={[]} language="en" variant="cockpit" now={new Date("2026-08-08T08:00:00Z")} />);
    const curve = screen.getByRole("img", { name: "24-hour quota remaining curve" });

    expect(curve).not.toHaveAttribute("tabindex");
    expect(curve).toHaveClass("quota-history-curve--empty");
    expect(within(curve).queryByRole("status")).not.toBeInTheDocument();
  });
});

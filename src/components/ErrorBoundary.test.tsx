// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "./ErrorBoundary";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function BrokenPanel(): never {
  throw new Error("secret quota payload at C:\\Users\\example");
}

describe("ErrorBoundary", () => {
  it.each([
    ["en" as const, "This view could not be displayed", "Reload"],
    ["zh-CN" as const, "界面暂时无法显示", "重新加载"],
  ])("shows a safe %s fallback without error details", (language, title, action) => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(<ErrorBoundary language={language}><BrokenPanel /></ErrorBoundary>);

    expect(screen.getByRole("alert")).toHaveTextContent(title);
    expect(screen.getByRole("button", { name: action })).toBeInTheDocument();
    expect(screen.queryByText(/secret quota|Users\\example/i)).not.toBeInTheDocument();
  });
});

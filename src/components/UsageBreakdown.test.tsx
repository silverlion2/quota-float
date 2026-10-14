// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { UsageBreakdown } from "./UsageBreakdown";
import type { UsageBreakdownRow } from "../lib/tokenUsage";

afterEach(cleanup);
const rows: UsageBreakdownRow[] = Array.from({ length: 10 }, (_, index) => ({
  key: `p${index}`, label: `Project ${index}`, dimension: "project", totalTokens: 1000,
  tokenShare: .1, requests: 1, sessions: 1, bucketCount: 1, costUsd: 2, knownCostUsd: 2,
  costShare: .1, pricedTokenCoverage: 1, unpricedModels: [],
}));

it("keeps shares against the full selection when showing the top eight and supports dimension switching", () => {
  const change = vi.fn();
  render(<UsageBreakdown rows={rows} dimension="project" onDimension={change} metric="token" language="en" />);
  expect(screen.getAllByRole("listitem")).toHaveLength(8);
  expect(screen.getAllByText("10%")).toHaveLength(8);
  expect(screen.getByText(/Top 8 of 10/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Terminals" }));
  expect(change).toHaveBeenCalledWith("terminal");
});

it("does not invent cost percentages for incomplete pricing", () => {
  render(<UsageBreakdown rows={[{ ...rows[0], costUsd: null, costShare: null, pricedTokenCoverage: .5, unpricedModels: ["unknown"] }]} dimension="project" onDimension={vi.fn()} metric="cost" language="en" />);
  expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  expect(screen.getByText("Unpriced / partial")).toBeInTheDocument();
  expect(screen.getByText(/cost shares are unavailable/)).toBeInTheDocument();
});

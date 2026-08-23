// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProviderId } from "../types";
import { ProviderLogoSlider } from "./ProviderLogoSlider";

const horizontalProviders = [
  { id: "codex", label: "CODEX" },
  { id: "claude", label: "CLAUDE" },
  { id: "qoder", label: "QODER" },
] as const;

const verticalProviders = [
  ...horizontalProviders,
  { id: "trae", label: "TRAE" },
] as const;

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function ControlledSlider({
  providers,
  orientation,
  initialSelected,
  onSelect,
}: {
  providers: ReadonlyArray<{ id: ProviderId; label: string }>;
  orientation: "horizontal" | "vertical";
  initialSelected: ProviderId;
  onSelect: (provider: ProviderId) => void;
}) {
  const [selected, setSelected] = useState(initialSelected);
  return (
    <ProviderLogoSlider
      providers={providers}
      selected={selected}
      onSelect={(provider) => {
        setSelected(provider);
        onSelect(provider);
      }}
      ariaLabel="Choose provider"
      orientation={orientation}
    />
  );
}

describe("ProviderLogoSlider keyboard and layout contract", () => {
  it("exposes the dynamic provider count and a horizontal roving radio group", () => {
    const onSelect = vi.fn();
    render(
      <ControlledSlider
        providers={horizontalProviders}
        orientation="horizontal"
        initialSelected="claude"
        onSelect={onSelect}
      />,
    );

    const group = screen.getByRole("radiogroup", { name: "Choose provider" });
    const codex = screen.getByRole("radio", { name: "CODEX" });
    const claude = screen.getByRole("radio", { name: "CLAUDE" });
    const qoder = screen.getByRole("radio", { name: "QODER" });

    expect(group).toHaveClass("provider-logo-slider--horizontal");
    expect(group).toHaveAttribute("aria-orientation", "horizontal");
    expect(group).toHaveStyle({ "--provider-count": "3" });
    expect(codex).toHaveAttribute("tabindex", "-1");
    expect(claude).toHaveAttribute("tabindex", "0");
    expect(claude).toHaveAttribute("aria-checked", "true");
    expect(qoder).toHaveAttribute("tabindex", "-1");

    claude.focus();
    fireEvent.keyDown(claude, { key: "ArrowRight" });
    expect(onSelect).toHaveBeenLastCalledWith("qoder");
    expect(qoder).toHaveFocus();
    expect(qoder).toHaveAttribute("aria-checked", "true");
    expect(qoder).toHaveAttribute("tabindex", "0");

    fireEvent.keyDown(qoder, { key: "ArrowLeft" });
    expect(onSelect).toHaveBeenLastCalledWith("claude");
    expect(claude).toHaveFocus();
  });

  it("uses vertical arrows and supports Home and End with a dynamic provider count", () => {
    const onSelect = vi.fn();
    render(
      <ControlledSlider
        providers={verticalProviders}
        orientation="vertical"
        initialSelected="claude"
        onSelect={onSelect}
      />,
    );

    const group = screen.getByRole("radiogroup", { name: "Choose provider" });
    const codex = screen.getByRole("radio", { name: "CODEX" });
    const claude = screen.getByRole("radio", { name: "CLAUDE" });
    const qoder = screen.getByRole("radio", { name: "QODER" });
    const trae = screen.getByRole("radio", { name: "TRAE" });

    expect(group).toHaveClass("provider-logo-slider--vertical");
    expect(group).toHaveAttribute("aria-orientation", "vertical");
    expect(group).toHaveStyle({ "--provider-count": "4" });

    claude.focus();
    fireEvent.keyDown(claude, { key: "ArrowDown" });
    expect(onSelect).toHaveBeenLastCalledWith("qoder");
    expect(qoder).toHaveFocus();

    fireEvent.keyDown(qoder, { key: "ArrowUp" });
    expect(onSelect).toHaveBeenLastCalledWith("claude");
    expect(claude).toHaveFocus();

    fireEvent.keyDown(claude, { key: "End" });
    expect(onSelect).toHaveBeenLastCalledWith("trae");
    expect(trae).toHaveFocus();

    fireEvent.keyDown(trae, { key: "Home" });
    expect(onSelect).toHaveBeenLastCalledWith("codex");
    expect(codex).toHaveFocus();
    expect(codex).toHaveAttribute("aria-checked", "true");
    expect(codex).toHaveAttribute("tabindex", "0");
  });
});

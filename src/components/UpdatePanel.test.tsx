// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UpdatePanel, type UpdatePhase, type UpdateViewState } from "./UpdatePanel";

afterEach(cleanup);

const info = {
  version: "0.2.27",
  body: "Compact overlays and stronger state coverage.",
  date: null,
  platform: "windows" as const,
  channel: "stable" as const,
  releaseUrl: "https://github.com/silverlion2/quota-float/releases/latest",
  automaticInstall: true,
};

const expectedTitles: Array<[UpdatePhase, string]> = [
  ["idle", "Checking for updates…"],
  ["checking", "Checking for updates…"],
  ["available", "Version 0.2.27 is available"],
  ["downloading", "Downloading Quota Float 0.2.27…"],
  ["ready", "0.2.27 is ready"],
  ["installing", "Installing update"],
  ["current", "You're up to date"],
  ["error", "Update check failed. Check GitHub Releases."],
];

function renderPhase(phase: UpdatePhase) {
  const state: UpdateViewState = {
    phase,
    info: phase === "idle" || phase === "checking" ? null : info,
    progress: phase === "downloading" ? { downloadedBytes: 42, totalBytes: 100, percent: 42 } : null,
    error: phase === "error" ? "Network unavailable." : null,
  };
  return render(
    <UpdatePanel
      state={state}
      language="en"
      onClose={vi.fn()}
      onDownload={vi.fn()}
      onInstall={vi.fn()}
      onRetry={vi.fn()}
      onLater={vi.fn()}
      onSkip={vi.fn()}
      onOpenRelease={vi.fn()}
    />,
  );
}

describe("UpdatePanel states", () => {
  it.each(expectedTitles)("renders the %s phase", (phase, title) => {
    renderPhase(phase);
    expect(screen.getByRole("dialog", { name: "Quota Float update" })).toHaveTextContent(title);
  });

  it("exposes bounded progress and the complete ready actions", () => {
    const view = renderPhase("downloading");
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "42");
    expect(screen.getByRole("button", { name: "Later" })).toBeInTheDocument();

    view.unmount();
    renderPhase("ready");
    expect(screen.getByRole("button", { name: "Skip this version" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Later" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restart and install" })).toBeInTheDocument();
  });

  it("keeps installation non-dismissible and focuses the dialog", () => {
    renderPhase("installing");
    expect(screen.getByRole("button", { name: "Close update center" })).toBeDisabled();
    expect(screen.getByRole("dialog", { name: "Quota Float update" })).toHaveFocus();
  });
});

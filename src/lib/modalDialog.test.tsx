// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useModalDialog } from "./modalDialog";

afterEach(cleanup);

function TestDialog({ onClose, closeOnEscape = true }: { onClose: () => void; closeOnEscape?: boolean }) {
  const dialogRef = useModalDialog<HTMLElement>(onClose, closeOnEscape);
  return (
    <section ref={dialogRef} role="dialog" aria-modal="true" tabIndex={-1}>
      <button type="button" data-dialog-initial-focus>First</button>
      <button type="button">Last</button>
    </section>
  );
}

function HiddenInitialFocusDialog({ onClose }: { onClose: () => void }) {
  const dialogRef = useModalDialog<HTMLElement>(onClose);
  return (
    <section ref={dialogRef} role="dialog" aria-modal="true" tabIndex={-1}>
      <button type="button" data-dialog-initial-focus hidden>Hidden</button>
      <button type="button">Visible</button>
    </section>
  );
}

describe("modal dialog keyboard behavior", () => {
  it("moves focus into the dialog, traps Tab, and closes on Escape", () => {
    const onClose = vi.fn();
    render(<TestDialog onClose={onClose} />);

    const first = screen.getByRole("button", { name: "First" });
    const last = screen.getByRole("button", { name: "Last" });
    expect(first).toHaveFocus();

    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(first).toHaveFocus();

    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("restores focus and can block Escape during a non-dismissible operation", async () => {
    const onClose = vi.fn();
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const view = render(<TestDialog onClose={onClose} closeOnEscape={false} />);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();

    view.unmount();
    await act(async () => {});
    expect(opener).toHaveFocus();
    opener.remove();
  });

  it("skips a hidden initial target", () => {
    render(<HiddenInitialFocusDialog onClose={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Visible" })).toHaveFocus();
  });

  it("does not steal focus from a replacement dialog", async () => {
    const first = render(<TestDialog onClose={vi.fn()} />);
    first.unmount();
    render(<HiddenInitialFocusDialog onClose={vi.fn()} />);
    await act(async () => {});
    expect(screen.getByRole("button", { name: "Visible" })).toHaveFocus();
  });
});

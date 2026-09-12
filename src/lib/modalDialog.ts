import { useLayoutEffect, useRef, type RefObject } from "react";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function focusableElements(dialog: HTMLElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true")
    .filter((element) => !element.closest("[hidden], [aria-hidden='true']"));
}

/**
 * Gives a role="dialog" surface the keyboard behavior promised by aria-modal:
 * initial focus, a contained Tab cycle, Escape dismissal, and focus restoration.
 */
export function useModalDialog<T extends HTMLElement>(
  onClose: () => void,
  closeOnEscape = true,
): RefObject<T | null> {
  const dialogRef = useRef<T>(null);
  const onCloseRef = useRef(onClose);
  const closeOnEscapeRef = useRef(closeOnEscape);
  onCloseRef.current = onClose;
  closeOnEscapeRef.current = closeOnEscape;

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const requestedFocus = dialog.querySelector<HTMLElement>("[data-dialog-initial-focus]:not([disabled]):not([hidden])");
    const initialFocus = requestedFocus && !requestedFocus.closest("[hidden], [aria-hidden='true']")
      ? requestedFocus
      : focusableElements(dialog)[0] ?? dialog;
    initialFocus.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (!closeOnEscapeRef.current) return;
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab") return;
      const focusable = focusableElements(dialog);
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const active = document.activeElement;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      // React removes the background's inert attribute later in this commit.
      // Restore after those mutations, while letting a replacement dialog keep focus.
      queueMicrotask(() => {
        const activeElement = document.activeElement;
        const dialogOwnsFocus = activeElement instanceof HTMLElement
          && activeElement.closest("[role='dialog'][aria-modal='true']");
        if (!dialogOwnsFocus && previousFocus?.isConnected) previousFocus.focus();
      });
    };
  }, []);

  return dialogRef;
}

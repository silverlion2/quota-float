import { type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, useRef } from "react";
import type { ProviderId } from "../types";
import { ProviderMark } from "./ProviderMark";

interface Props {
  providers: ReadonlyArray<{ id: ProviderId; label: string }>;
  selected: ProviderId;
  onSelect: (provider: ProviderId) => void;
  ariaLabel: string;
  compact?: boolean;
  orientation?: "horizontal" | "vertical";
}

export function ProviderLogoSlider({ providers, selected, onSelect, ariaLabel, compact = false, orientation = "horizontal" }: Props) {
  const dragging = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const selectAt = (event: ReactPointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const length = orientation === "vertical" ? bounds.height : bounds.width;
    if (length <= 0 || providers.length === 0) return;
    const pointer = orientation === "vertical" ? event.clientY - bounds.top : event.clientX - bounds.left;
    const progress = Math.max(0, Math.min(0.9999, pointer / length));
    onSelect(providers[Math.floor(progress * providers.length)].id);
  };

  const selectByKeyboard = (event: ReactKeyboardEvent<HTMLButtonElement>, provider: ProviderId) => {
    if (providers.length === 0) return;
    const currentIndex = Math.max(0, providers.findIndex((item) => item.id === provider));
    const previousKey = orientation === "vertical" ? "ArrowUp" : "ArrowLeft";
    const nextKey = orientation === "vertical" ? "ArrowDown" : "ArrowRight";
    let nextIndex: number | null = null;
    if (event.key === previousKey) nextIndex = (currentIndex - 1 + providers.length) % providers.length;
    if (event.key === nextKey) nextIndex = (currentIndex + 1) % providers.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = providers.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    event.stopPropagation();
    onSelect(providers[nextIndex].id);
    requestAnimationFrame(() => rootRef.current?.querySelectorAll<HTMLButtonElement>("button")[nextIndex!]?.focus());
  };

  return (
    <div
      ref={rootRef}
      className={`provider-logo-slider provider-logo-slider--${orientation}${compact ? " provider-logo-slider--compact" : ""}`}
      style={{ "--provider-count": Math.max(1, providers.length) } as CSSProperties}
      role="radiogroup"
      aria-label={ariaLabel}
      aria-orientation={orientation}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        dragging.current = true;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        selectAt(event);
      }}
      onPointerMove={(event) => {
        if (!dragging.current) return;
        event.preventDefault();
        event.stopPropagation();
        selectAt(event);
      }}
      onPointerUp={(event) => {
        dragging.current = false;
        if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      }}
      onPointerCancel={() => { dragging.current = false; }}
    >
      {providers.map((provider) => (
        <button
          key={provider.id}
          type="button"
          role="radio"
          aria-checked={selected === provider.id}
          aria-label={provider.label}
          title={provider.label}
          tabIndex={selected === provider.id ? 0 : -1}
          className={selected === provider.id ? "is-active" : ""}
          onKeyDown={(event) => selectByKeyboard(event, provider.id)}
          onClick={(event) => {
            event.stopPropagation();
            onSelect(provider.id);
          }}
        >
          <ProviderMark provider={provider.id} label={provider.label} />
        </button>
      ))}
    </div>
  );
}

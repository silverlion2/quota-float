import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  useId,
  useState,
} from "react";
import { buildQuotaTrendGeometry, type QuotaTrendPoint } from "../lib/usageInsights";
import type { Language } from "../types";

interface Props {
  points: QuotaTrendPoint[];
  language: Language;
  variant: "micro" | "cockpit" | "insights";
  now?: Date;
  hours?: number;
  interactive?: boolean;
  ariaLabel?: string;
}

const VIEWBOX_WIDTH = 220;

function formatPoint(point: QuotaTrendPoint, language: Language): { time: string; value: string } {
  const locale = language === "en" ? "en-US" : "zh-CN";
  const time = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(point.capturedAt));
  const value = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(point.remainingPercent);
  return { time, value };
}

export function QuotaHistoryCurve({
  points,
  language,
  variant,
  now = new Date(),
  hours = 24,
  interactive = true,
  ariaLabel,
}: Props) {
  const gradientId = `quota-history-${useId().replaceAll(":", "")}`;
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const geometry = buildQuotaTrendGeometry(points, now, hours);
  const activePoint = activeIndex === null ? null : points[activeIndex] ?? null;
  const activeGeometry = activeIndex === null ? null : geometry?.points[activeIndex] ?? null;
  const tooltip = activePoint ? formatPoint(activePoint, language) : null;
  const resolvedLabel = ariaLabel ?? (language === "en"
    ? `${hours}-hour quota remaining curve`
    : `${hours} 小时剩余额度曲线`);

  const selectNearestPoint = (event: PointerEvent<HTMLSpanElement>) => {
    if (!geometry || geometry.points.length === 0) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width <= 0) return;
    const pointerX = Math.min(VIEWBOX_WIDTH, Math.max(0, ((event.clientX - bounds.left) / bounds.width) * VIEWBOX_WIDTH));
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    geometry.points.forEach((point, index) => {
      const distance = Math.abs(point.x - pointerX);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });
    setActiveIndex(nearestIndex);
  };

  const moveSelection = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (!interactive || points.length === 0) return;
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Home") return setActiveIndex(0);
    if (event.key === "End") return setActiveIndex(points.length - 1);
    const current = activeIndex ?? points.length - 1;
    setActiveIndex(event.key === "ArrowLeft"
      ? Math.max(0, current - 1)
      : Math.min(points.length - 1, current + 1));
  };

  const tooltipPosition = activeGeometry ? activeGeometry.x / VIEWBOX_WIDTH * 100 : 50;
  const tooltipEdge = tooltipPosition < 18 ? " is-start" : tooltipPosition > 82 ? " is-end" : "";

  return (
    <span
      className={`quota-history-curve quota-history-curve--${variant}${points.length === 0 ? " quota-history-curve--empty" : ""}`}
      role={interactive ? "img" : undefined}
      aria-label={interactive ? resolvedLabel : undefined}
      aria-hidden={interactive ? undefined : true}
      tabIndex={interactive && points.length > 0 ? 0 : undefined}
      onFocus={() => { if (interactive && points.length > 0) setActiveIndex(points.length - 1); }}
      onBlur={() => setActiveIndex(null)}
      onKeyDown={moveSelection}
      onPointerMove={selectNearestPoint}
      onPointerLeave={() => setActiveIndex(null)}
    >
      <svg viewBox="0 0 220 72" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="currentColor" stopOpacity=".24" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[10, 38, 66].map((y) => <line className="quota-history-grid" key={y} x1="4" x2="216" y1={y} y2={y} />)}
        {geometry ? <>
          <path className="quota-history-area" d={geometry.area} style={{ fill: `url(#${gradientId})` }} />
          <path className="quota-history-line" d={geometry.line} />
          {geometry.points.map((point, index) => <circle className="quota-history-sample" key={`${points[index]?.capturedAt}-${index}`} cx={point.x} cy={point.y} r="1.5" />)}
          {activeGeometry ? <>
            <line className="quota-history-crosshair" x1={activeGeometry.x} x2={activeGeometry.x} y1="7" y2="69" />
            <circle className="quota-history-active-point" cx={activeGeometry.x} cy={activeGeometry.y} r="3.4" />
          </> : null}
        </> : null}
      </svg>
      {tooltip && activeGeometry ? (
        <span
          className={`quota-history-tooltip${tooltipEdge}`}
          style={{ "--curve-tooltip-x": `${tooltipPosition}%` } as CSSProperties}
          role={interactive ? "status" : undefined}
        >
          <time>{tooltip.time}</time>
          <strong>{tooltip.value}%</strong>
          <small>{language === "en" ? "remaining" : "剩余"}</small>
        </span>
      ) : null}
    </span>
  );
}

import { useId } from "react";
import { cn } from "@/lib/utils";

const MAX_POINTS = 28;

/**
 * Averages long series (e.g. 168 hourly prices) into buckets so small lines
 * read as a trend instead of noise. The first and last values are kept exact.
 */
function smooth(values: number[]) {
  if (values.length <= MAX_POINTS) return values;
  const size = values.length / MAX_POINTS;
  const buckets = Array.from({ length: MAX_POINTS }, (_, index) => {
    const slice = values.slice(Math.floor(index * size), Math.floor((index + 1) * size));
    return slice.reduce((sum, value) => sum + value, 0) / slice.length;
  });
  buckets[0] = values[0];
  buckets[buckets.length - 1] = values[values.length - 1];
  return buckets;
}

/** A small trend line drawn from real price points. Renders nothing without data. */
export function Sparkline({
  values: rawValues,
  className,
  filled = false,
  label,
}: {
  values: number[] | undefined;
  className?: string;
  filled?: boolean;
  /** Accessible description; omit to hide the sparkline from screen readers. */
  label?: string;
}) {
  const gradientId = useId();
  if (!rawValues || rawValues.length < 2) {
    return <span className={cn("sparkline sparkline-empty", className)} aria-hidden="true" />;
  }
  const values = smooth(rawValues);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values.map((value, index) => [
    (index / (values.length - 1)) * 100,
    2 + (1 - (value - min) / range) * 28,
  ]);
  const line = points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const rising = values[values.length - 1] >= values[0];
  const color = rising ? "var(--positive)" : "var(--negative)";
  return (
    <svg
      className={cn("sparkline", className)}
      viewBox="0 0 100 32"
      preserveAspectRatio="none"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {filled && (
        <>
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity=".28" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon points={`0,32 ${line} 100,32`} fill={`url(#${gradientId})`} />
        </>
      )}
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

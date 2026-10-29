import { useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Activity, ArrowRight } from "lucide-react";
import type { Candle } from "@/lib/market";
import { formatCandleTime, formatPrice } from "@/i18n/format";
import { cn } from "@/lib/utils";

const WIDTH = 1000;
const HEIGHT = 300;

/**
 * Responsive area chart for real candles, with a hover/keyboard crosshair.
 * Labels are HTML (not SVG text) so they stay crisp at any width.
 */
export function MarketChart({
  candles,
  loading = false,
  error = false,
  onRetry,
  label,
  axis = true,
  className,
}: {
  candles: Candle[];
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  label: string;
  axis?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const gradientId = useId();
  const plotRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const plot = useMemo(() => {
    if (candles.length < 2) return null;
    const closes = candles.map((candle) => candle.close);
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const pad = (max - min) * 0.12 || max * 0.005 || 1;
    const top = max + pad;
    const bottom = min - pad;
    const x = (index: number) => (index / (candles.length - 1)) * WIDTH;
    const y = (value: number) => ((top - value) / (top - bottom)) * HEIGHT;
    const line = candles
      .map((candle, index) => `${x(index).toFixed(1)},${y(candle.close).toFixed(1)}`)
      .join(" ");
    return { x, y, top, bottom, min, max, line };
  }, [candles]);

  if (loading || (!plot && !error)) {
    return (
      <div className={cn("market-chart", className)}>
        <div className="market-chart-plot chart-skeleton" aria-label={t("chart.loading")} />
      </div>
    );
  }
  if (error || !plot) {
    return (
      <div className={cn("market-chart market-chart-message", className)} role="alert">
        <Activity size={18} />
        <b>{t("chart.errorTitle")}</b>
        <span>{t("chart.errorText")}</span>
        {onRetry && (
          <button className="button button-subtle button-small" onClick={onRetry}>
            {t("common.retry")} <ArrowRight size={13} />
          </button>
        )}
      </div>
    );
  }

  const first = candles[0].open || candles[0].close;
  const last = candles[candles.length - 1].close;
  const rising = last >= first;
  const color = rising ? "var(--positive)" : "var(--negative)";
  const span = candles[candles.length - 1].time - candles[0].time;
  const active = hover === null ? null : candles[hover];
  const pct = (value: number, total: number) => `${(value / total) * 100}%`;
  const yTicks = [plot.max, (plot.max + plot.min) / 2, plot.min];
  const xTicks = [0, Math.floor((candles.length - 1) / 2), candles.length - 1];

  const inspect = (clientX: number) => {
    const bounds = plotRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const ratio = Math.min(Math.max((clientX - bounds.left) / bounds.width, 0), 1);
    setHover(Math.round(ratio * (candles.length - 1)));
  };

  return (
    <div
      className={cn("market-chart", { "has-axis": axis }, className)}
      style={{ "--chart-color": color } as React.CSSProperties}
    >
      <div
        ref={plotRef}
        className="market-chart-plot"
        role="img"
        tabIndex={0}
        aria-label={t("chart.description", {
          symbol: label,
          min: formatPrice(plot.min),
          max: formatPrice(plot.max),
        })}
        onPointerMove={(event) => inspect(event.clientX)}
        onPointerDown={(event) => inspect(event.clientX)}
        onPointerLeave={() => setHover(null)}
        onBlur={() => setHover(null)}
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          const step = event.key === "ArrowLeft" ? -1 : 1;
          setHover((current) =>
            Math.min(
              candles.length - 1,
              Math.max(0, (current ?? candles.length - 1) + step),
            ),
          );
        }}
      >
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity=".26" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          {axis &&
            yTicks.map((value) => (
              <line
                key={value}
                x1="0"
                x2={WIDTH}
                y1={plot.y(value)}
                y2={plot.y(value)}
                className="chart-gridline"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          <polygon points={`0,${HEIGHT} ${plot.line} ${WIDTH},${HEIGHT}`} fill={`url(#${gradientId})`} />
          <polyline
            points={plot.line}
            fill="none"
            stroke={color}
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          {hover !== null && (
            <line
              x1={plot.x(hover)}
              x2={plot.x(hover)}
              y1="0"
              y2={HEIGHT}
              className="chart-crosshair"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
        {active && hover !== null && (
          <>
            <span
              className="market-chart-dot"
              style={{
                left: pct(plot.x(hover), WIDTH),
                top: pct(plot.y(active.close), HEIGHT),
              }}
            />
            <div
              className={cn("market-chart-tooltip", {
                flipped: hover > candles.length / 2,
              })}
              style={{ left: pct(plot.x(hover), WIDTH) }}
            >
              <span>{formatCandleTime(active.time, span, true)}</span>
              <b>{formatPrice(active.close)}</b>
              <small className={active.close >= first ? "positive-text" : "negative-text"}>
                {active.close >= first ? "+" : "−"}
                {Math.abs((active.close / first - 1) * 100).toFixed(2)}%
              </small>
            </div>
          </>
        )}
      </div>
      {axis && (
        <>
          <div className="market-chart-y" aria-hidden="true">
            {yTicks.map((value) => (
              <span key={value} style={{ top: pct(plot.y(value), HEIGHT) }}>
                {formatPrice(value, true)}
              </span>
            ))}
          </div>
          <div className="market-chart-x" aria-hidden="true">
            {xTicks.map((index) => (
              <span key={index}>
                {index === candles.length - 1
                  ? t("chart.now")
                  : formatCandleTime(candles[index].time, span)}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

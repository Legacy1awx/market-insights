import { useId, useMemo, useRef, useState } from "react";
import { Activity, ArrowDownRight, ArrowUpRight } from "lucide-react";
import { TokenIcon } from "@/components/funds/TokenIcon";
import { describeMovement } from "@/lib/movement";
import { cn } from "@/lib/utils";

const CHART_TYPES = ["Area", "Line", "Candles"] as const;
type ChartType = (typeof CHART_TYPES)[number];
type HistoryPoint = { recordedAt: string; balanceUsd: string };
type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};
export type ChartInvestment = {
  id: string;
  symbol: string;
  investedUsd: string;
  returnUsd: string;
  totalUsd: string;
  movementDirection: "up" | "down" | "continuous" | "paused";
  movementAmount: string;
  movementIntervalSeconds: number;
  updatedAt: string;
  history: HistoryPoint[];
};

const TIMEFRAMES = [
  { label: "1H", ms: 60 * 60 * 1000 },
  { label: "24H", ms: 24 * 60 * 60 * 1000 },
  { label: "7D", ms: 7 * 24 * 60 * 60 * 1000 },
  { label: "All", ms: Infinity },
] as const;
type Timeframe = (typeof TIMEFRAMES)[number]["label"];

// SVG drawing area (viewBox units). Labels are HTML so they never stretch.
const VIEW_WIDTH = 1000;
const VIEW_HEIGHT = 300;
const PLOT_TOP = 12;
const PLOT_BOTTOM = 288;
const GRID_LINES = 5;

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function signedUsd(value: number) {
  return `${value >= 0 ? "+" : "−"}${usd.format(Math.abs(value))}`;
}

function signedPercent(value: number) {
  return `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(2)}%`;
}

function formatAxisTime(time: number, spanMs: number) {
  const date = new Date(time);
  return spanMs > 24 * 60 * 60 * 1000
    ? date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : date.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      });
}

/** One candle per recorded balance, opening at the previous balance. */
function buildCandles(history: HistoryPoint[], currentUsd: number) {
  const points = history
    .map((point) => ({
      time: new Date(point.recordedAt).getTime(),
      value: Number(point.balanceUsd),
    }))
    .filter((point) => Number.isFinite(point.time + point.value));
  const last = points[points.length - 1];
  if (!last || last.value !== currentUsd) {
    points.push({ time: Date.now(), value: currentUsd });
  }
  return points.map<Candle>((point, index) => {
    const open = index === 0 ? point.value : points[index - 1].value;
    return {
      time: point.time,
      open,
      close: point.value,
      high: Math.max(open, point.value),
      low: Math.min(open, point.value),
    };
  });
}

function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="chart-type-control" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option}
          className={value === option ? "chart-type active" : "chart-type"}
          aria-pressed={value === option}
          onClick={() => onChange(option)}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

export function InvestmentPriceChart({
  investments,
}: {
  investments: ChartInvestment[];
}) {
  const gradientId = useId();
  const [selectedId, setSelectedId] = useState(investments[0]?.id ?? "");
  const [type, setType] = useState<ChartType>("Area");
  const [timeframe, setTimeframe] = useState<Timeframe>("All");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const investment =
    investments.find((item) => item.id === selectedId) ?? investments[0];
  const invested = Number(investment?.investedUsd ?? 0);

  const data = useMemo(() => {
    if (!investment) return [];
    const candles = buildCandles(
      investment.history,
      Number(investment.totalUsd),
    );
    const span = TIMEFRAMES.find((item) => item.label === timeframe)!.ms;
    const visible = candles.filter(
      (candle) => candle.time >= Date.now() - span,
    );
    return visible.length >= 2 ? visible : candles.slice(-2);
  }, [investment, timeframe]);

  const plot = useMemo(() => {
    // Include the invested amount so the cost line is always on the chart.
    const values = [...data.flatMap((row) => [row.high, row.low]), invested];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = (max - min) * 0.12 || Math.max(max * 0.01, 1);
    const top = max + pad;
    const bottom = Math.max(0, min - pad);
    const x = (index: number) =>
      (index / Math.max(data.length - 1, 1)) * VIEW_WIDTH;
    const y = (value: number) =>
      PLOT_TOP +
      ((top - value) / (top - bottom || 1)) * (PLOT_BOTTOM - PLOT_TOP);
    return { x, y, top, bottom };
  }, [data, invested]);

  if (!investment) return null;

  const latest = data[data.length - 1]?.close ?? 0;
  const periodStart = data[0]?.open ?? 0;
  const periodChange = latest - periodStart;
  const totalReturn = Number(investment.returnUsd);
  const totalReturnPercent = invested ? (totalReturn / invested) * 100 : 0;
  const periodHigh = Math.max(...data.map((row) => row.high));
  const periodLow = Math.min(...data.map((row) => row.low));
  const spanMs = data.length ? data[data.length - 1].time - data[0].time : 0;
  const activeIndex = hoverIndex ?? data.length - 1;
  const active = data[activeIndex];
  const linePoints = data
    .map((row, index) => `${plot.x(index)},${plot.y(row.close)}`)
    .join(" ");
  const areaPoints = `0,${PLOT_BOTTOM} ${linePoints} ${VIEW_WIDTH},${PLOT_BOTTOM}`;
  const toPercent = (value: number) => `${(value / VIEW_HEIGHT) * 100}%`;
  const gridValues = Array.from(
    { length: GRID_LINES },
    (_, line) =>
      plot.top - ((plot.top - plot.bottom) * line) / (GRID_LINES - 1),
  );
  const timeLabels =
    data.length > 1
      ? [0, Math.floor((data.length - 1) / 2), data.length - 1]
      : [0];

  const moveCrosshair = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!plotRef.current || data.length < 2) return;
    const bounds = plotRef.current.getBoundingClientRect();
    const relative = Math.min(
      Math.max((event.clientX - bounds.left) / bounds.width, 0),
      1,
    );
    setHoverIndex(Math.round(relative * (data.length - 1)));
  };

  const stats = [
    { label: "Invested", value: usd.format(invested) },
    {
      label: "Total return",
      value: `${signedUsd(totalReturn)} (${signedPercent(totalReturnPercent)})`,
      tone: totalReturn >= 0 ? "positive" : "negative",
    },
    { label: `${timeframe} high`, value: usd.format(periodHigh) },
    { label: `${timeframe} low`, value: usd.format(periodLow) },
    { label: "Movement", value: describeMovement(investment) },
    {
      label: "Last updated",
      value: new Date(investment.updatedAt).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    },
  ];

  return (
    <section
      className="panel chart-panel investment-chart"
      aria-label={`${investment.symbol} investment value`}
    >
      <div className="investment-chart-top">
        <div className="investment-chart-heading">
          <span className="eyebrow">ASSIGNED VALUE</span>
          <div
            className="investment-chart-assets"
            role="group"
            aria-label="Investment"
          >
            {investments.map((item) => (
              <button
                key={item.id}
                className={cn("investment-chart-asset", {
                  active: item.id === investment.id,
                })}
                aria-pressed={item.id === investment.id}
                onClick={() => {
                  setSelectedId(item.id);
                  setHoverIndex(null);
                }}
              >
                <TokenIcon symbol={item.symbol} size="sm" />
                {item.symbol}
              </button>
            ))}
          </div>
        </div>
        <div className="chart-tools">
          <SegmentedControl
            label="Timeframe"
            options={TIMEFRAMES.map((item) => item.label)}
            value={timeframe}
            onChange={(value) => {
              setTimeframe(value);
              setHoverIndex(null);
            }}
          />
          <SegmentedControl<ChartType>
            label="Chart style"
            options={CHART_TYPES}
            value={type}
            onChange={setType}
          />
        </div>
      </div>

      <div className="investment-chart-value" aria-live="polite">
        <strong>{usd.format(latest)}</strong>
        <span
          className={`change-pill ${totalReturn >= 0 ? "positive" : "negative"}`}
        >
          {totalReturn >= 0 ? (
            <ArrowUpRight size={14} />
          ) : (
            <ArrowDownRight size={14} />
          )}
          {signedPercent(totalReturnPercent)}
        </span>
        <span className="chart-value-note">
          {signedUsd(periodChange)}{" "}
          {timeframe === "All"
            ? "since first record"
            : `in the last ${timeframe}`}
        </span>
      </div>

      <dl className="investment-chart-stats">
        {stats.map((stat) => (
          <div key={stat.label}>
            <dt>{stat.label}</dt>
            <dd className={stat.tone ? `${stat.tone}-text` : undefined}>
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>

      {data.length ? (
        <div className="investment-chart-plot">
          <div
            ref={plotRef}
            className="investment-chart-canvas"
            onPointerMove={moveCrosshair}
            onPointerLeave={() => setHoverIndex(null)}
            tabIndex={0}
            role="img"
            aria-label={`${investment.symbol} value between ${usd.format(periodLow)} and ${usd.format(periodHigh)}. Use arrow keys to inspect values.`}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft")
                setHoverIndex((current) =>
                  Math.max(0, (current ?? data.length - 1) - 1),
                );
              if (event.key === "ArrowRight")
                setHoverIndex((current) =>
                  Math.min(data.length - 1, (current ?? data.length - 1) + 1),
                );
            }}
          >
            <svg
              viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <defs>
                <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor="var(--chart-line)"
                    stopOpacity=".28"
                  />
                  <stop
                    offset="100%"
                    stopColor="var(--chart-line)"
                    stopOpacity="0"
                  />
                </linearGradient>
              </defs>
              {gridValues.map((value) => (
                <line
                  key={value}
                  x1="0"
                  x2={VIEW_WIDTH}
                  y1={plot.y(value)}
                  y2={plot.y(value)}
                  className="chart-gridline"
                />
              ))}
              <line
                x1="0"
                x2={VIEW_WIDTH}
                y1={plot.y(invested)}
                y2={plot.y(invested)}
                className="investment-chart-baseline"
              />
              {type === "Candles" ? (
                data.map((row, index) => {
                  const x = plot.x(index);
                  const width = Math.min(16, Math.max(3, 600 / data.length));
                  const color =
                    row.close >= row.open
                      ? "var(--positive)"
                      : "var(--negative)";
                  return (
                    <g key={`${row.time}-${index}`}>
                      <line
                        x1={x}
                        x2={x}
                        y1={plot.y(row.high)}
                        y2={plot.y(row.low)}
                        stroke={color}
                        strokeWidth="1.4"
                        vectorEffect="non-scaling-stroke"
                      />
                      <rect
                        x={x - width / 2}
                        y={Math.min(plot.y(row.open), plot.y(row.close))}
                        width={width}
                        height={Math.max(
                          1.5,
                          Math.abs(plot.y(row.open) - plot.y(row.close)),
                        )}
                        fill={color}
                        rx="1"
                      />
                    </g>
                  );
                })
              ) : (
                <>
                  {type === "Area" && (
                    <polygon points={areaPoints} fill={`url(#${gradientId})`} />
                  )}
                  <polyline
                    points={linePoints}
                    fill="none"
                    stroke="var(--chart-line)"
                    strokeWidth="2.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                </>
              )}
              {hoverIndex !== null && (
                <line
                  x1={plot.x(activeIndex)}
                  x2={plot.x(activeIndex)}
                  y1={PLOT_TOP}
                  y2={PLOT_BOTTOM}
                  className="chart-crosshair"
                />
              )}
            </svg>
            {active && (
              <span
                className="investment-chart-marker"
                style={{
                  left: `${(plot.x(activeIndex) / VIEW_WIDTH) * 100}%`,
                  top: toPercent(plot.y(active.close)),
                }}
              />
            )}
            <span
              className="investment-chart-baseline-label"
              style={{ top: toPercent(plot.y(invested)) }}
            >
              Invested {usd.format(invested)}
            </span>
            {hoverIndex !== null && active && (
              <div
                className={cn("chart-tooltip investment-chart-tooltip", {
                  flipped: activeIndex > data.length / 2,
                })}
                style={{
                  left: `${(plot.x(activeIndex) / VIEW_WIDTH) * 100}%`,
                }}
              >
                <span>
                  {new Date(active.time).toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </span>
                <b>{usd.format(active.close)}</b>
                <small
                  className={
                    active.close >= invested ? "positive-text" : "negative-text"
                  }
                >
                  {signedUsd(active.close - invested)} vs invested (
                  {signedPercent(
                    invested ? ((active.close - invested) / invested) * 100 : 0,
                  )}
                  )
                </small>
                <small>
                  {signedUsd(active.close - active.open)} from previous record
                </small>
              </div>
            )}
          </div>
          <div className="investment-chart-y-axis" aria-hidden="true">
            {gridValues.map((value) => (
              <span key={value} style={{ top: toPercent(plot.y(value)) }}>
                {usd.format(value)}
              </span>
            ))}
          </div>
          <div className="investment-chart-x-axis" aria-hidden="true">
            {timeLabels.map((index, position) => (
              <span key={index}>
                {position === timeLabels.length - 1
                  ? "Now"
                  : formatAxisTime(data[index].time, spanMs)}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div className="chart-empty">
          <Activity size={20} />
          <b>No balance history yet</b>
          <span>Values appear here as they are recorded.</span>
        </div>
      )}
    </section>
  );
}

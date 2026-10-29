import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Sparkline } from "@/components/market/Sparkline";
import { useAssetMarkets, useFearGreed, useGlobalMarket } from "@/hooks/use-market";
import {
  dateFormat,
  formatCandleTime,
  formatCompactUsd,
  formatPrice,
  formatUsd,
  numberFormat,
} from "@/i18n/format";
import { holdingsHistory, readHoldings } from "@/lib/holdings";
import {
  BINANCE_STREAM,
  TIMEFRAMES,
  fetchCandles,
  fetchTickers,
  type Candle,
  type Timeframe,
} from "@/lib/market";
import { useAuth } from "@/lib/auth";
import {
  Activity,
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Bookmark,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Command,
  CreditCard,
  Ellipsis,
  Globe2,
  LayoutDashboard,
  Menu,
  Moon,
  MoreHorizontal,
  Plus,
  Search,
  Send,
  ArrowUpFromLine,
  ShieldCheck,
  Settings2,
  SlidersHorizontal,
  Sun,
  X,
} from "lucide-react";

const MarketWorkspace = lazy(() => import("./MarketWorkspace"));
const EmailAccountDialog = lazy(
  () => import("../components/EmailAccountDialog"),
);
const AuthDialog = lazy(() => import("../components/AuthDialog"));

type Asset = {
  symbol: string;
  name: string;
  price: number;
  change: number;
  marketCap: number;
  volume24h: number;
  color: string;
  short: string;
  rank?: number | null;
  circulatingSupply?: number | null;
  maxSupply?: number | null;
  high24h?: number;
  low24h?: number;
  sparkline?: number[];
};
type FeedState =
  "live" | "delayed" | "simulated" | "connecting" | "reconnecting" | "offline";
type Screen = "Overview" | "Markets" | "Portfolio" | "Alerts" | "Screener";
type ChartType = "Area" | "Line" | "Candles";
type MarketOverride = {
  symbol: string;
  price: number | null;
  change: number | null;
};
type NewsArticle = {
  id: string;
  title: string;
  summary: string;
  category: string;
  readMinutes: number;
};

function withPriceOverrides(
  values: Record<string, number>,
  overrides: MarketOverride[],
) {
  const result = { ...values };
  for (const override of overrides) {
    if (override.price !== null) result[override.symbol] = override.price;
  }
  return result;
}

function withChangeOverrides(
  values: Record<string, number>,
  overrides: MarketOverride[],
) {
  const result = { ...values };
  for (const override of overrides) {
    if (override.change !== null) result[override.symbol] = override.change;
  }
  return result;
}

const SAMPLE_NEWS: NewsArticle[] = [
  {
    id: "sample-scarcity",
    title: "The long-term case for digital scarcity",
    summary: "Market Brief · 2 hours ago",
    category: "MARKET INSIGHT",
    readMinutes: 4,
  },
  {
    id: "sample-flows",
    title: "Institutional flows return to spot ETFs",
    summary: "Northstar Research · 5 hours ago",
    category: "MARKET INSIGHT",
    readMinutes: 3,
  },
];

const ASSETS: Asset[] = [
  {
    symbol: "BTC",
    name: "Bitcoin",
    price: 67432.18,
    change: 2.41,
    marketCap: 1_320_000_000_000,
    volume24h: 28_460_000_000,
    color: "#f5a623",
    short: "₿",
  },
  {
    symbol: "ETH",
    name: "Ethereum",
    price: 3521.64,
    change: 1.83,
    marketCap: 420_000_000_000,
    volume24h: 13_700_000_000,
    color: "#8293f7",
    short: "Ξ",
  },
  {
    symbol: "SOL",
    name: "Solana",
    price: 182.37,
    change: -0.62,
    marketCap: 80_000_000_000,
    volume24h: 2_450_000_000,
    color: "#a78bfa",
    short: "S",
  },
  {
    symbol: "BNB",
    name: "BNB",
    price: 586.42,
    change: 0.74,
    marketCap: 86_000_000_000,
    volume24h: 1_280_000_000,
    color: "#eebc42",
    short: "B",
  },
  {
    symbol: "XRP",
    name: "XRP",
    price: 0.6238,
    change: -1.26,
    marketCap: 34_000_000_000,
    volume24h: 1_750_000_000,
    color: "#91a0b0",
    short: "X",
  },
  {
    symbol: "ADA",
    name: "Cardano",
    price: 0.4782,
    change: 3.18,
    marketCap: 17_000_000_000,
    volume24h: 310_000_000,
    color: "#4074df",
    short: "A",
  },
  {
    symbol: "AVAX",
    name: "Avalanche",
    price: 36.84,
    change: 1.07,
    marketCap: 13_600_000_000,
    volume24h: 230_000_000,
    color: "#e84142",
    short: "A",
  },
  {
    symbol: "LINK",
    name: "Chainlink",
    price: 17.26,
    change: 0.42,
    marketCap: 10_100_000_000,
    volume24h: 280_000_000,
    color: "#3861d5",
    short: "L",
  },
];
const SCREEN_KEYS = {
  Overview: "nav.overview",
  Markets: "nav.markets",
  Portfolio: "nav.portfolio",
  Alerts: "nav.alerts",
  Screener: "nav.screener",
  "Send funds": "nav.sendFunds",
  Withdraw: "nav.withdraw",
} as const;
const CHART_TYPE_KEYS = {
  Area: "chart.area",
  Line: "chart.line",
  Candles: "chart.candles",
} as const;
const SCREEN_PATHS: Record<Screen, string> = {
  Overview: "/dashboard",
  Markets: "/markets",
  Portfolio: "/portfolio",
  Alerts: "/alerts",
  Screener: "/screener",
};
const PATH_SCREENS: Record<string, Screen> = Object.fromEntries(
  Object.entries(SCREEN_PATHS).map(([screen, path]) => [path, screen]),
) as Record<string, Screen>;
const STORAGE = {
  watchlist: "northstar-watchlist",
  theme: "northstar-theme",
  // v2: live data became the default; older saved "simulated" choices reset.
  mock: "northstar-mock-mode-v2",
  colorSafe: "northstar-color-safe",
  recent: "northstar-recent-searches",
};

function readStorage<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** "+1.23%" / "−1.23%", or "—" while the value is unknown. */
function formatChange(value: number) {
  if (!Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(2)}%`;
}

function makeSeries(price: number, seed: number, timeframe = "1D"): Candle[] {
  let previous = price * 0.973;
  const periodMinutes: Record<string, number> = {
    "1D": 1440,
    "1W": 10080,
    "1M": 43200,
    "3M": 129600,
    "1Y": 525600,
    "5Y": 2628000,
    ALL: 5256000,
  };
  const interval = (periodMinutes[timeframe] ?? 1440) / 71;
  return Array.from({ length: 72 }, (_, index) => {
    const wave =
      Math.sin(index * 0.51 + seed) * 0.006 +
      Math.cos(index * 0.19 + seed * 0.4) * 0.004;
    const trend = (index / 72) * 0.027;
    const close = price * (0.966 + trend + wave);
    const open = previous;
    const spread =
      price * (0.002 + Math.abs(Math.sin(index * 0.73 + seed)) * 0.0025);
    previous = close;
    return {
      time: Date.now() - (71 - index) * interval * 60_000,
      open,
      close,
      volume: 0,
      high: Math.max(open, close) + spread,
      low: Math.min(open, close) - spread,
    };
  });
}

function PriceChart({
  data,
  type,
  onTypeChange,
  timeframe,
  onTimeframeChange,
  symbol,
  source,
  loading,
  error,
  onRetry,
  assets,
}: {
  data: Candle[];
  type: ChartType;
  onTypeChange: (value: ChartType) => void;
  timeframe: Timeframe;
  onTimeframeChange: (value: Timeframe) => void;
  symbol: string;
  source: string;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  assets: Asset[];
}) {
  const { t } = useTranslation();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [movingAverage, setMovingAverage] = useState(false);
  const [volume, setVolume] = useState(false);
  const [rsi, setRsi] = useState(false);
  const [comparison, setComparison] = useState("");
  const [comparisonData, setComparisonData] = useState<Candle[]>([]);
  const plotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setComparisonData([]);
    if (!comparison) return;
    let active = true;
    fetchCandles(comparison, timeframe)
      .then((candles) => active && setComparisonData(candles))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [comparison, timeframe]);

  const plot = useMemo(() => {
    if (!data.length) return null;
    const values = data.flatMap((row) => [row.high, row.low]);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = (max - min) * 0.12 || max * 0.01;
    const top = max + pad;
    const bottom = min - pad;
    const x = (index: number) => (index / Math.max(data.length - 1, 1)) * 1000;
    const y = (value: number) => ((top - value) / (top - bottom)) * 300;
    return { x, y, min, max, top, bottom };
  }, [data]);

  const activeIndex = hoverIndex ?? data.length - 1;
  const active = data[activeIndex];
  const first = data[0]?.open ?? 0;
  const last = data[data.length - 1]?.close ?? 0;
  const chartChange = first ? (last / first - 1) * 100 : 0;
  const span = data.length > 1 ? data[data.length - 1].time - data[0].time : 0;
  const points = plot
    ? data.map((row, index) => `${plot.x(index)},${plot.y(row.close)}`).join(" ")
    : "";
  const movingAveragePoints = plot
    ? data
        .map((_, index) => {
          const slice = data.slice(Math.max(0, index - 19), index + 1);
          const average =
            slice.reduce((sum, item) => sum + item.close, 0) / slice.length;
          return `${plot.x(index)},${plot.y(average)}`;
        })
        .join(" ")
    : "";
  // Rebase the comparison asset onto this chart: same start, relative moves.
  const comparisonPoints =
    plot && comparisonData.length > 1 && data.length > 1
      ? (() => {
          const aligned = comparisonData.slice(-data.length);
          const offset = data.length - aligned.length;
          const base = aligned[0].close;
          return aligned
            .map(
              (row, index) =>
                `${plot.x(index + offset)},${plot.y((row.close / base) * data[offset].close)}`,
            )
            .join(" ");
        })()
      : "";
  const maxVolume = Math.max(0, ...data.map((row) => row.volume));
  const rsiValueAt = (index: number) => {
    const start = Math.max(1, index - 13);
    let gains = 0;
    let losses = 0;
    for (let current = start; current <= index; current++) {
      const difference = data[current].close - data[current - 1].close;
      if (difference >= 0) gains += difference;
      else losses -= difference;
    }
    return losses === 0 ? 100 : 100 - 100 / (1 + gains / losses);
  };
  const rsiValue = data.length > 1 ? Math.round(rsiValueAt(data.length - 1)) : 0;
  const rsiPoints =
    data.length > 1
      ? data
          .map(
            (_, index) =>
              `${(index / (data.length - 1)) * 1000},${4 + ((100 - rsiValueAt(index)) / 100) * 52}`,
          )
          .join(" ")
      : "";
  const pct = (value: number, total: number) => `${(value / total) * 100}%`;

  const moveCrosshair = (clientX: number) => {
    const bounds = plotRef.current?.getBoundingClientRect();
    if (!bounds || !data.length) return;
    const ratio = Math.min(Math.max((clientX - bounds.left) / bounds.width, 0), 1);
    setHoverIndex(Math.round(ratio * (data.length - 1)));
  };

  return (
    <section className="panel chart-panel" aria-label={t("chart.label", { symbol })}>
      <div className="chart-panel-top">
        <div className="chart-heading">
          <span className="eyebrow">{t("chart.eyebrow")}</span>
          <span className="chart-current">
            {symbol} <span>·</span> USD
          </span>
        </div>
        <div className="chart-tools">
          <div className="chart-type-control" role="group" aria-label={t("chart.style")}>
            {(["Area", "Line", "Candles"] as ChartType[]).map((item) => (
              <button
                className={type === item ? "chart-type active" : "chart-type"}
                key={item}
                aria-pressed={type === item}
                onClick={() => onTypeChange(item)}
              >
                {t(CHART_TYPE_KEYS[item])}
              </button>
            ))}
          </div>
          <div className="chart-options-wrap">
            <button
              className="icon-button chart-options"
              aria-label={t("chart.options")}
              aria-expanded={toolsOpen}
              onClick={() => setToolsOpen(!toolsOpen)}
            >
              <SlidersHorizontal size={16} />
            </button>
            {toolsOpen && (
              <div className="chart-options-menu">
                <span className="menu-label">{t("chart.indicators")}</span>
                <button onClick={() => setMovingAverage(!movingAverage)}>
                  <span>
                    {t("chart.movingAverage")} <small>{t("chart.movingAverageHint")}</small>
                  </span>
                  <i className={movingAverage ? "menu-check checked" : "menu-check"}>
                    {movingAverage && <Check size={11} />}
                  </i>
                </button>
                <button onClick={() => setVolume(!volume)}>
                  <span>
                    {t("chart.volume")} <small>{t("chart.volumeHint")}</small>
                  </span>
                  <i className={volume ? "menu-check checked" : "menu-check"}>
                    {volume && <Check size={11} />}
                  </i>
                </button>
                <button onClick={() => setRsi(!rsi)}>
                  <span>
                    RSI <small>{t("chart.rsiHint")}</small>
                  </span>
                  <i className={rsi ? "menu-check checked" : "menu-check"}>
                    {rsi && <Check size={11} />}
                  </i>
                </button>
                <span className="menu-label compare-label">{t("chart.compare")}</span>
                <select
                  aria-label={t("chart.compareLabel")}
                  value={comparison}
                  onChange={(event) => setComparison(event.target.value)}
                >
                  <option value="">{t("common.off")}</option>
                  {assets
                    .filter((asset) => asset.symbol !== symbol)
                    .map((asset) => (
                      <option key={asset.symbol} value={asset.symbol}>
                        {asset.name} ({asset.symbol})
                      </option>
                    ))}
                </select>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="chart-value-row" aria-live="polite">
        <strong>{formatPrice(last)}</strong>
        <span className={`change-pill ${chartChange >= 0 ? "positive" : "negative"}`}>
          {chartChange >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{" "}
          {chartChange >= 0 ? "+" : "−"}
          {Math.abs(chartChange).toFixed(2)}%
        </span>
        <span className="chart-value-note">{t("chart.performance", { timeframe })}</span>
      </div>
      {loading && !data.length ? (
        <div className="market-chart price-chart-frame">
          <div className="market-chart-plot chart-skeleton" aria-label={t("chart.loading")} />
        </div>
      ) : error && !data.length ? (
        <div className="market-chart market-chart-message price-chart-frame" role="alert">
          <Activity size={18} />
          <b>{t("chart.errorTitle")}</b>
          <span>{t("chart.errorText")}</span>
          <button className="button button-subtle button-small" onClick={onRetry}>
            {t("common.retry")} <ArrowRight size={13} />
          </button>
        </div>
      ) : plot ? (
        <div className="market-chart has-axis price-chart-frame">
          <div
            ref={plotRef}
            className="market-chart-plot"
            role="img"
            tabIndex={0}
            aria-label={t("chart.description", {
              symbol,
              min: formatPrice(plot.min),
              max: formatPrice(plot.max),
            })}
            onPointerMove={(event) => moveCrosshair(event.clientX)}
            onPointerDown={(event) => moveCrosshair(event.clientX)}
            onPointerLeave={() => setHoverIndex(null)}
            onBlur={() => setHoverIndex(null)}
            onKeyDown={(event) => {
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
              event.preventDefault();
              const step = event.key === "ArrowLeft" ? -1 : 1;
              setHoverIndex((current) =>
                Math.min(data.length - 1, Math.max(0, (current ?? data.length - 1) + step)),
              );
            }}
          >
            <svg viewBox="0 0 1000 300" preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <linearGradient id="chart-fill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-line)" stopOpacity=".22" />
                  <stop offset="100%" stopColor="var(--chart-line)" stopOpacity="0" />
                </linearGradient>
              </defs>
              {[0.25, 0.5, 0.75].map((ratio) => (
                <line
                  key={ratio}
                  x1="0"
                  x2="1000"
                  y1={ratio * 300}
                  y2={ratio * 300}
                  className="chart-gridline"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {volume &&
                maxVolume > 0 &&
                data.map((row, index) => {
                  const height = (row.volume / maxVolume) * 60;
                  return (
                    <rect
                      key={`volume-${row.time}`}
                      x={plot.x(index) - 500 / data.length}
                      y={300 - height}
                      width={Math.max(1, (1000 / data.length) * 0.7)}
                      height={height}
                      fill={row.close >= row.open ? "var(--positive)" : "var(--negative)"}
                      opacity=".35"
                    />
                  );
                })}
              {type === "Candles" ? (
                data.map((row, index) => {
                  const x = plot.x(index);
                  const width = Math.max(1.2, (1000 / data.length) * 0.62);
                  const color = row.close >= row.open ? "var(--positive)" : "var(--negative)";
                  return (
                    <g key={row.time}>
                      <line
                        x1={x}
                        x2={x}
                        y1={plot.y(row.high)}
                        y2={plot.y(row.low)}
                        stroke={color}
                        strokeWidth="1"
                        vectorEffect="non-scaling-stroke"
                      />
                      <rect
                        x={x - width / 2}
                        y={Math.min(plot.y(row.open), plot.y(row.close))}
                        width={width}
                        height={Math.max(1, Math.abs(plot.y(row.open) - plot.y(row.close)))}
                        fill={color}
                      />
                    </g>
                  );
                })
              ) : (
                <>
                  {type === "Area" && (
                    <polygon points={`0,300 ${points} 1000,300`} fill="url(#chart-fill)" />
                  )}
                  <polyline
                    points={points}
                    fill="none"
                    stroke="var(--chart-line)"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                </>
              )}
              {movingAverage && (
                <polyline
                  points={movingAveragePoints}
                  fill="none"
                  stroke="var(--indicator-line)"
                  strokeWidth="1.6"
                  strokeDasharray="5 4"
                  vectorEffect="non-scaling-stroke"
                />
              )}
              {comparisonPoints && (
                <polyline
                  points={comparisonPoints}
                  fill="none"
                  stroke="var(--comparison-line)"
                  strokeWidth="1.7"
                  strokeDasharray="4 4"
                  vectorEffect="non-scaling-stroke"
                />
              )}
              {hoverIndex !== null && (
                <line
                  x1={plot.x(activeIndex)}
                  x2={plot.x(activeIndex)}
                  y1="0"
                  y2="300"
                  className="chart-crosshair"
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </svg>
            {hoverIndex !== null && active && (
              <>
                <span
                  className="market-chart-dot"
                  style={{
                    left: pct(plot.x(activeIndex), 1000),
                    top: pct(plot.y(active.close), 300),
                    background: "var(--chart-line)",
                  }}
                />
                <div
                  className={`market-chart-tooltip${activeIndex > data.length / 2 ? " flipped" : ""}`}
                  style={{ left: pct(plot.x(activeIndex), 1000) }}
                >
                  <span>{formatCandleTime(active.time, span, true)}</span>
                  <b>{formatPrice(active.close)}</b>
                  <small>
                    O {formatPrice(active.open)} · H {formatPrice(active.high)} · L{" "}
                    {formatPrice(active.low)}
                  </small>
                </div>
              </>
            )}
          </div>
          <div className="market-chart-y" aria-hidden="true">
            {[0.25, 0.5, 0.75].map((ratio) => (
              <span key={ratio} style={{ top: `${ratio * 100}%` }}>
                {formatPrice(plot.top - ratio * (plot.top - plot.bottom), true)}
              </span>
            ))}
          </div>
          <div className="market-chart-x" aria-hidden="true">
            {[0, Math.floor((data.length - 1) / 2), data.length - 1].map((index) => (
              <span key={index}>
                {index === data.length - 1
                  ? t("chart.now")
                  : formatCandleTime(data[index].time, span)}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div className="chart-empty">
          <Activity size={20} />
          <b>{t("chart.emptyTitle")}</b>
          <span>{t("chart.emptyText")}</span>
        </div>
      )}
      {rsi && rsiPoints && (
        <div className="rsi-panel">
          <span>
            RSI (14) <b>{rsiValue}</b>
          </span>
          <svg viewBox="0 0 1000 60" preserveAspectRatio="none" aria-label={t("chart.rsiLabel")}>
            <line x1="0" x2="1000" y1="19.6" y2="19.6" className="chart-gridline" vectorEffect="non-scaling-stroke" />
            <line x1="0" x2="1000" y1="40.4" y2="40.4" className="chart-gridline" vectorEffect="non-scaling-stroke" />
            <polyline
              points={rsiPoints}
              fill="none"
              stroke="var(--indicator-line)"
              strokeWidth="1.6"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>
      )}
      {(movingAverage || comparisonPoints || (volume && maxVolume === 0)) && (
        <div className="chart-legend">
          {movingAverage && (
            <span>
              <i className="legend-ma" />
              MA (20)
            </span>
          )}
          {comparisonPoints && (
            <span>
              <i className="legend-compare" />
              {t("chart.normalized", { symbol: comparison })}
            </span>
          )}
          {volume && maxVolume === 0 && <span>{t("chart.volumeUnavailable")}</span>}
        </div>
      )}
      <div className="chart-footer">
        <div className="timeframe-control" role="group" aria-label={t("chart.timeframe")}>
          {TIMEFRAMES.map((item) => (
            <button
              key={item}
              className={timeframe === item ? "timeframe active" : "timeframe"}
              aria-pressed={timeframe === item}
              onClick={() => onTimeframeChange(item)}
            >
              {item}
            </button>
          ))}
        </div>
        <span className="chart-source">
          <span className="source-dot" /> {source}
        </span>
      </div>
    </section>
  );
}

export default function Index() {
  const { t } = useTranslation();
  const { user, isLoading: authLoading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { symbol: assetRouteSymbol } = useParams<{ symbol: string }>();
  const returnScreenRef = useRef<Screen>("Overview");
  const accountReturnPathRef = useRef("/dashboard");
  const [watchlist, setWatchlist] = useState<string[]>(() =>
    readStorage(STORAGE.watchlist, ["BTC", "ETH", "SOL", "LINK"]),
  );
  // Only real quotes go here; simulation mode seeds its own prices.
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [marketChanges, setMarketChanges] = useState<Record<string, number>>(
    {},
  );
  const [marketVolumes, setMarketVolumes] = useState<Record<string, number>>(
    {},
  );
  const [marketOverrides, setMarketOverrides] = useState<MarketOverride[]>([]);
  const marketOverridesRef = useRef(marketOverrides);
  marketOverridesRef.current = marketOverrides;
  const [newsArticles, setNewsArticles] = useState<NewsArticle[]>([]);
  const [newsLoaded, setNewsLoaded] = useState(false);
  const pricesRef = useRef(prices);
  pricesRef.current = prices;
  const [chartData, setChartData] = useState<Candle[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartError, setChartError] = useState(false);
  const [chartRetry, setChartRetry] = useState(0);
  const [mockMode, setMockMode] = useState(() =>
    readStorage(STORAGE.mock, false),
  );
  const { value: assetMarkets } = useAssetMarkets();
  const { value: globalMarket } = useGlobalMarket();
  const { value: fearGreed } = useFearGreed();
  const [theme, setTheme] = useState(() => readStorage(STORAGE.theme, "dark"));
  const [colorSafe, setColorSafe] = useState(() =>
    readStorage(STORAGE.colorSafe, false),
  );
  const [feedState, setFeedState] = useState<FeedState>("connecting");
  const [lastUpdated, setLastUpdated] = useState(() => new Date());
  const [activeScreen, setActiveScreen] = useState<Screen>("Overview");
  const [alertCount, setAlertCount] = useState(
    () =>
      readStorage("northstar-alerts", [
        { enabled: true },
        { enabled: true },
      ]).filter((alert) => alert.enabled).length,
  );
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>("1D");
  const [chartType, setChartType] = useState<ChartType>("Area");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountMode, setAccountMode] = useState<"auth" | "email">("auth");
  const [toast, setToast] = useState("");
  const [sortBy, setSortBy] = useState<"change" | "price">("change");
  const [recentSearches, setRecentSearches] = useState<string[]>(() =>
    readStorage(STORAGE.recent, []),
  );
  const [mobileMenu, setMobileMenu] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingMarketData = useRef<Record<string, number>>({});
  const pendingMarketChanges = useRef<Record<string, number>>({});
  const pendingMarketVolumes = useRef<Record<string, number>>({});
  const receivedFeedSymbols = useRef(new Set<string>());
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;
    void fetch("/api/market-overrides")
      .then((response) => {
        if (!response.ok) throw new Error("Could not load market overrides.");
        return response.json() as Promise<MarketOverride[]>;
      })
      .then((overrides) => {
        if (!active) return;
        setMarketOverrides(overrides);
        marketOverridesRef.current = overrides;
        setPrices((current) => {
          const next = withPriceOverrides(current, overrides);
          pricesRef.current = next;
          return next;
        });
        setMarketChanges((current) => withChangeOverrides(current, overrides));
      })
      .catch((error: unknown) => {
        if (active)
          console.error("Market overrides could not be loaded.", error);
      });
    void fetch("/api/content")
      .then((response) => {
        if (!response.ok) throw new Error("Could not load published content.");
        return response.json() as Promise<NewsArticle[]>;
      })
      .then((articles) => {
        if (active) {
          setNewsArticles(articles);
          setNewsLoaded(true);
        }
      })
      .catch((error: unknown) => {
        if (active)
          console.error("Published content could not be loaded.", error);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(STORAGE.theme, JSON.stringify(theme));
  }, [theme]);
  useEffect(() => {
    document.documentElement.dataset.colorSafe = String(colorSafe);
    localStorage.setItem(STORAGE.colorSafe, JSON.stringify(colorSafe));
  }, [colorSafe]);
  useEffect(
    () => localStorage.setItem(STORAGE.watchlist, JSON.stringify(watchlist)),
    [watchlist],
  );
  useEffect(
    () => localStorage.setItem(STORAGE.mock, JSON.stringify(mockMode)),
    [mockMode],
  );
  useEffect(
    () =>
      localStorage.setItem(
        STORAGE.recent,
        JSON.stringify(recentSearches.slice(0, 5)),
      ),
    [recentSearches],
  );
  useEffect(() => {
    if (location.pathname === "/account") {
      const returnTo = (location.state as { returnTo?: unknown } | null)
        ?.returnTo;
      if (
        typeof returnTo === "string" &&
        returnTo.startsWith("/") &&
        !returnTo.startsWith("//") &&
        returnTo !== "/account"
      ) {
        accountReturnPathRef.current = returnTo;
      }
      setSelectedAsset(null);
      setActiveScreen("Overview");
      setAccountOpen(true);
      return;
    }
    setAccountOpen(false);
    if (assetRouteSymbol) {
      const symbol = assetRouteSymbol.toUpperCase();
      if (ASSETS.some((asset) => asset.symbol === symbol)) {
        setSelectedAsset(symbol);
        setActiveScreen("Overview");
        return;
      }
      navigate("/dashboard");
      return;
    }
    setSelectedAsset(null);
    const screen = PATH_SCREENS[location.pathname];
    if (screen) setActiveScreen(screen);
    else navigate("/dashboard");
  }, [assetRouteSymbol, location.pathname, location.state, navigate]);

  const marketAssets = useMemo(
    () =>
      ASSETS.map((asset) => {
        const market = assetMarkets?.[asset.symbol];
        const seed = (value: number) => (mockMode ? value : NaN);
        return {
          ...asset,
          price: market?.price ?? seed(asset.price),
          change:
            marketChanges[asset.symbol] ??
            market?.change24h ??
            seed(asset.change),
          marketCap: market?.marketCap ?? seed(asset.marketCap),
          // CoinGecko's volume covers all exchanges; Binance's only its own.
          volume24h:
            market?.volume24h ??
            marketVolumes[asset.symbol] ??
            seed(asset.volume24h),
          rank: market?.rank ?? null,
          circulatingSupply: market?.circulatingSupply ?? null,
          maxSupply: market?.maxSupply ?? null,
          high24h: market?.high24h,
          low24h: market?.low24h,
          sparkline: market?.sparkline,
        };
      }),
    [assetMarkets, marketChanges, marketVolumes, mockMode],
  );
  const assetFor = useCallback(
    (symbol: string) =>
      marketAssets.find((asset) => asset.symbol === symbol) ?? marketAssets[0],
    [marketAssets],
  );
  const currentAsset = assetFor(selectedAsset || "BTC");
  const displayedNews = newsLoaded ? newsArticles : SAMPLE_NEWS;
  const currentAssetOverride = marketOverrides.find(
    (override) => override.symbol === currentAsset.symbol,
  );
  const currentSymbolRef = useRef(currentAsset.symbol);
  currentSymbolRef.current = currentAsset.symbol;
  const currentPrice = prices[currentAsset.symbol] ?? currentAsset.price;

  useEffect(() => {
    if (mockMode) {
      setChartData(
        makeSeries(
          currentPrice,
          ASSETS.findIndex((asset) => asset.symbol === currentAsset.symbol) + 5,
          timeframe,
        ),
      );
      setChartError(false);
      setChartLoading(false);
      return;
    }
    let active = true;
    setChartLoading(true);
    setChartError(false);
    setChartData([]);
    fetchCandles(currentAsset.symbol, timeframe)
      .then((candles) => {
        if (!active) return;
        setChartData(candles);
        setLastUpdated(new Date());
      })
      .catch(() => active && setChartError(true))
      .finally(() => active && setChartLoading(false));
    return () => {
      active = false;
    };
  }, [currentAsset.symbol, timeframe, mockMode, chartRetry]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3600);
  }, []);

  useEffect(() => {
    const syncEmailAlerts = (event: Event) => {
      const alerts = (event as CustomEvent<Array<Record<string, unknown>>>)
        .detail;
      if (!Array.isArray(alerts)) return;
      const normalized = alerts.flatMap((alert) => {
        const referencePrice = Number(alert.reference ?? alert.referencePrice);
        if (!Number.isFinite(referencePrice) || referencePrice <= 0) return [];
        return [{ ...alert, referencePrice }];
      });
      void fetch("/api/email/alerts", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alerts: normalized }),
      })
        .then((response) => {
          if (response.status >= 500)
            showToast(t("dashboard.alertSyncFailed"));
        })
        .catch(() => showToast(t("dashboard.alertSyncFailed")));
    };
    window.addEventListener("northstar:alerts-updated", syncEmailAlerts);
    return () =>
      window.removeEventListener("northstar:alerts-updated", syncEmailAlerts);
  }, [showToast, t]);

  useEffect(() => {
    if (mockMode) {
      setFeedState("simulated");
      const updateSimulation = () => {
        if (document.hidden) return;
        setLastUpdated(new Date());
        const now = Date.now();
        const next = { ...pricesRef.current };
        const nextChanges: Record<string, number> = {};
        const nextVolumes: Record<string, number> = {};
        for (const asset of ASSETS) {
          const wave = Math.sin(now / 9000 + asset.price);
          next[asset.symbol] = asset.price * (1 + wave * 0.003);
          nextChanges[asset.symbol] = asset.change + wave * 0.14;
          nextVolumes[asset.symbol] =
            asset.volume24h * (1 + Math.cos(now / 12000 + asset.price) * 0.025);
        }
        const overriddenPrices = withPriceOverrides(
          next,
          marketOverridesRef.current,
        );
        pricesRef.current = overriddenPrices;
        setPrices(overriddenPrices);
        setMarketChanges(
          withChangeOverrides(nextChanges, marketOverridesRef.current),
        );
        setMarketVolumes(nextVolumes);
        setChartData((rows) => {
          if (!rows.length) return rows;
          const last = rows[rows.length - 1];
          const latest = next[currentAsset.symbol];
          return [
            ...rows.slice(0, -1),
            {
              ...last,
              close: latest,
              high: Math.max(last.high, latest),
              low: Math.min(last.low, latest),
            },
          ];
        });
      };
      const timer = setInterval(updateSimulation, 1400);
      const onVisibilityChange = () => {
        setFeedState(document.hidden ? "offline" : "simulated");
        if (!document.hidden) updateSimulation();
      };
      document.addEventListener("visibilitychange", onVisibilityChange);
      return () => {
        clearInterval(timer);
        document.removeEventListener("visibilitychange", onVisibilityChange);
      };
    }

    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    receivedFeedSymbols.current.clear();
    let backoff = 1000;
    let closed = false;
    void fetchTickers(ASSETS.map((asset) => asset.symbol))
      .then((tickers) =>
        Object.entries(tickers).map(
          ([symbol, ticker]) =>
            [symbol, ticker.price, ticker.change24h, ticker.volume24h] as const,
        ),
      )
      .then((snapshot) => {
        if (closed) return;
        const next = { ...pricesRef.current };
        const nextChanges = { ...marketChanges };
        const nextVolumes = { ...marketVolumes };
        snapshot.forEach(([symbol, price, change, volume]) => {
          if (!receivedFeedSymbols.current.has(symbol)) {
            next[symbol] = price;
            nextChanges[symbol] = change;
            nextVolumes[symbol] = volume;
          }
        });
        const overriddenPrices = withPriceOverrides(
          next,
          marketOverridesRef.current,
        );
        pricesRef.current = overriddenPrices;
        setPrices(overriddenPrices);
        setMarketChanges(
          withChangeOverrides(nextChanges, marketOverridesRef.current),
        );
        setMarketVolumes(nextVolumes);
        setLastUpdated(new Date());
      })
      .catch(() => undefined);

    const connect = () => {
      if (closed || document.hidden) return;
      setFeedState(backoff > 1000 ? "reconnecting" : "connecting");
      socket = new WebSocket(
        `${BINANCE_STREAM}?streams=${ASSETS.map((asset) => `${asset.symbol.toLowerCase()}usdt@ticker`).join("/")}`,
      );
      socket.onopen = () => {
        backoff = 1000;
        setFeedState("live");
      };
      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as {
            data?: { s?: string; c?: string; P?: string; q?: string };
          };
          const ticker = payload.data;
          if (!ticker?.s || !ticker.c) return;
          const symbol = ticker.s.replace("USDT", "");
          if (!ASSETS.some((asset) => asset.symbol === symbol)) return;
          receivedFeedSymbols.current.add(symbol);
          pendingMarketData.current[symbol] = Number(ticker.c);
          if (ticker.P) pendingMarketChanges.current[symbol] = Number(ticker.P);
          if (ticker.q) pendingMarketVolumes.current[symbol] = Number(ticker.q);
          if (!flushTimer.current)
            flushTimer.current = setTimeout(
              () => {
                const batch = pendingMarketData.current;
                const changeBatch = pendingMarketChanges.current;
                const volumeBatch = pendingMarketVolumes.current;
                pendingMarketData.current = {};
                pendingMarketChanges.current = {};
                pendingMarketVolumes.current = {};
                flushTimer.current = null;
                const next = withPriceOverrides(
                  { ...pricesRef.current, ...batch },
                  marketOverridesRef.current,
                );
                pricesRef.current = next;
                setPrices(next);
                setMarketChanges((current) =>
                  withChangeOverrides(
                    { ...current, ...changeBatch },
                    marketOverridesRef.current,
                  ),
                );
                setMarketVolumes((current) => ({ ...current, ...volumeBatch }));
                setLastUpdated(new Date());
                setFeedState("live");
                const latest = batch[currentSymbolRef.current];
                if (latest)
                  setChartData((rows) => {
                    const last = rows[rows.length - 1];
                    return rows.length
                      ? [
                          ...rows.slice(0, -1),
                          {
                            ...last,
                            close: latest,
                            high: Math.max(last.high, latest),
                            low: Math.min(last.low, latest),
                          },
                        ]
                      : rows;
                  });
              },
              document.hidden ? 1200 : 350,
            );
        } catch {
          setFeedState("reconnecting");
        }
      };
      socket.onclose = () => {
        if (closed) return;
        if (document.hidden) {
          setFeedState("offline");
          return;
        }
        setFeedState("reconnecting");
        reconnectTimer = setTimeout(() => {
          backoff = Math.min(backoff * 2, 30_000);
          connect();
        }, backoff);
      };
      socket.onerror = () => socket?.close();
    };
    const onVisibilityChange = () => {
      if (document.hidden) socket?.close();
      else if (!socket || socket.readyState === WebSocket.CLOSED) {
        backoff = 1000;
        connect();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    connect();
    return () => {
      closed = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (flushTimer.current) clearTimeout(flushTimer.current);
      socket?.close();
    };
  }, [mockMode]);

  useEffect(() => {
    if (mockMode || feedState !== "live") return;
    const timer = setInterval(() => {
      if (Date.now() - lastUpdated.getTime() > 30_000) setFeedState("delayed");
    }, 5000);
    return () => clearInterval(timer);
  }, [feedState, lastUpdated, mockMode]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === "Escape") {
        setSearchOpen(false);
        setSettingsOpen(false);
        if (location.pathname === "/account") {
          navigate(accountReturnPathRef.current, { replace: true });
        }
        setAccountOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [location.pathname, navigate]);

  const navigateToScreen = (screen: Screen) => {
    setActiveScreen(screen);
    setSelectedAsset(null);
    setAccountOpen(false);
    setMobileMenu(false);
    navigate(SCREEN_PATHS[screen]);
  };

  const openAccount = () => {
    accountReturnPathRef.current =
      location.pathname === "/account" ? "/dashboard" : location.pathname;
    setAccountMode("auth");
    navigate("/account");
  };

  const closeAccount = () => {
    setAccountOpen(false);
    navigate(accountReturnPathRef.current, { replace: true });
  };

  const toggleWatch = (symbol: string) => {
    const removing = watchlist.includes(symbol);
    setWatchlist((list) =>
      removing ? list.filter((item) => item !== symbol) : [...list, symbol],
    );
    showToast(
      removing
        ? t("watchlist.removed", { symbol })
        : t("watchlist.added", { symbol }),
    );
  };

  const openAsset = (symbol: string) => {
    returnScreenRef.current = activeScreen;
    setSelectedAsset(symbol);
    setActiveScreen("Overview");
    navigate(`/assets/${symbol.toLowerCase()}`);
    setSearchOpen(false);
    setSearchText("");
    setRecentSearches((items) =>
      [symbol, ...items.filter((item) => item !== symbol)].slice(0, 5),
    );
  };

  const searchResults = marketAssets.filter((asset) =>
    `${asset.symbol} ${asset.name}`
      .toLowerCase()
      .includes(searchText.toLowerCase()),
  );
  const watchAssets = watchlist
    .map(assetFor)
    .sort((a, b) =>
      sortBy === "change"
        ? b.change - a.change
        : (prices[b.symbol] ?? b.price) - (prices[a.symbol] ?? a.price),
    );
  // Biggest moves either way, by absolute 24h change.
  const movers = [...marketAssets]
    .filter((asset) => Number.isFinite(asset.change))
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
    .slice(0, 4);
  // Tracked assets' combined 7-day trend, weighted by market cap.
  const totalTrend = (() => {
    const series = marketAssets.filter(
      (asset) => asset.sparkline?.length && Number.isFinite(asset.marketCap),
    );
    if (!series.length) return undefined;
    const length = Math.min(...series.map((asset) => asset.sparkline!.length));
    return Array.from({ length }, (_, index) =>
      series.reduce((sum, asset) => {
        const line = asset.sparkline!.slice(-length);
        return sum + (line[index] / asset.price) * asset.marketCap;
      }, 0),
    );
  })();
  // The personal tracker, valued at live prices with a real 7-day history.
  const holdings = readHoldings();
  const portfolioValue = holdings.reduce(
    (sum, holding) =>
      sum + holding.quantity * (prices[holding.symbol] ?? assetFor(holding.symbol).price),
    0,
  );
  const portfolioHistory = holdingsHistory(
    holdings,
    Object.fromEntries(
      marketAssets.map((asset) => [
        asset.symbol,
        (asset.sparkline ?? []).map((close, index, all) => ({
          time: Date.now() - (all.length - 1 - index) * 3_600_000,
          close,
        })),
      ]),
    ),
  ).map((point) => point.value);
  const portfolioStart = portfolioHistory[0];
  const portfolioChange =
    portfolioStart && Number.isFinite(portfolioValue)
      ? portfolioValue - portfolioStart
      : NaN;
  return (
    <div className="app-shell">
      <aside className={mobileMenu ? "sidebar mobile-open" : "sidebar"}>
        <div className="brand-row">
          <div className="brand-mark">
            <Activity size={19} strokeWidth={2.5} />
          </div>
          <span className="brand-name">
            northstar<span>.</span>
          </span>
          <button
            className="mobile-close icon-button"
            aria-label={t("dashboard.closeNavigation")}
            onClick={() => setMobileMenu(false)}
          >
            <X size={18} />
          </button>
        </div>
        <div className="workspace-label">{t("dashboard.workspaceEyebrow")}</div>
        <nav className="primary-nav" aria-label={t("dashboard.mainNavigation")}>
          {(
            [
              ["Overview", LayoutDashboard],
              ["Markets", Globe2],
              ["Portfolio", CreditCard],
              ["Alerts", Bell],
              ["Screener", SlidersHorizontal],
              ["Send funds", Send],
              ["Withdraw", ArrowUpFromLine],
            ] as const
          ).map(([label, Icon]) => (
            <button
              key={label}
              onClick={() => {
                if (label === "Send funds" || label === "Withdraw") {
                  setMobileMenu(false);
                  navigate(label === "Send funds" ? "/send" : "/withdraw");
                } else {
                  navigateToScreen(label);
                }
              }}
              className={`nav-item ${activeScreen === label && !selectedAsset ? "selected" : ""}`}
            >
              <Icon size={17} strokeWidth={1.8} />
              <span>{t(SCREEN_KEYS[label])}</span>
              {label === "Alerts" && alertCount > 0 && (
                <span className="nav-count">{alertCount}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-help">
            <div className="help-icon">
              <CircleHelp size={17} />
            </div>
            <div>
              <b>{t("dashboard.helpTitle")}</b>
              <span>{t("dashboard.helpText")}</span>
            </div>
            <ChevronRight size={15} />
          </div>
          <button
            className="profile-row"
            aria-haspopup="dialog"
            aria-label={t("dashboard.openAccount")}
            onClick={openAccount}
          >
            <div className="profile-avatar">
              {authLoading ? "…" : (user?.email?.[0]?.toUpperCase() ?? "G")}
            </div>
            <div className="profile-copy">
              <b>{user?.email ?? t("dashboard.accountFallback")}</b>
              <span>
                {authLoading
                  ? t("dashboard.checkingAccount")
                  : user
                    ? t("dashboard.manageAccount")
                    : t("common.signInOrCreate")}
              </span>
            </div>
            <MoreHorizontal size={18} />
          </button>
        </div>
      </aside>
      {mobileMenu && (
        <button
          className="mobile-scrim"
          aria-label={t("dashboard.closeNavigation")}
          onClick={() => setMobileMenu(false)}
        />
      )}

      <main className="main-shell">
        <header className="topbar">
          <button
            className="mobile-menu-button icon-button"
            aria-label={t("dashboard.openNavigation")}
            onClick={() => setMobileMenu(true)}
          >
            <Menu size={20} />
          </button>
          <div className="breadcrumb">
            <span>{t("dashboard.workspace")}</span>
            <ChevronRight size={14} />
            <b>
              {selectedAsset ? currentAsset.name : t(SCREEN_KEYS[activeScreen])}
            </b>
          </div>
          <div className="topbar-actions">
            <button
              className="search-trigger"
              onClick={() => setSearchOpen(true)}
              aria-label={t("search.open")}
            >
              <Search size={16} />
              <span>{t("search.trigger")}</span>
              <kbd>
                <Command size={11} /> K
              </kbd>
            </button>
            <button
              className="icon-button settings-trigger"
              aria-label={t("settings.open")}
              onClick={() => setSettingsOpen(true)}
            >
              <Settings2 size={18} />
            </button>
          </div>
        </header>

        <div className="page-content">
          {selectedAsset ? (
            <>
              <button
                className="back-link"
                onClick={() => navigateToScreen(returnScreenRef.current)}
              >
                <ArrowLeft size={15} /> {t("dashboard.allMarkets")}
              </button>
              <div className="asset-detail-heading">
                <div className="asset-detail-name">
                  <div
                    className={`asset-coin large coin-${currentAsset.symbol.toLowerCase()}`}
                  >
                    {currentAsset.short}
                  </div>
                  <div>
                    <div className="asset-title-line">
                      <h1>{currentAsset.name}</h1>
                      <span className="symbol-chip">{currentAsset.symbol}</span>
                    </div>
                    <span className="asset-subtitle">
                      {t("asset.digitalAsset")} <span>·</span>{" "}
                      {currentAsset.rank
                        ? t("asset.rank", { rank: currentAsset.rank })
                        : "—"}
                    </span>
                  </div>
                </div>
                <div className="asset-detail-price">
                  <strong>{formatPrice(currentPrice)}</strong>
                  <span
                    className={
                      currentAsset.change >= 0
                        ? "positive-text"
                        : "negative-text"
                    }
                  >
                    {formatChange(currentAsset.change)}{" "}
                    <span>{t("common.today")}</span>
                  </span>
                </div>
              </div>
              <div className="detail-stat-grid">
                {(
                  [
                    [
                      "marketCap",
                      formatCompactUsd(currentAsset.marketCap),
                      currentAsset.rank
                        ? t("asset.marketCapRank", { rank: currentAsset.rank })
                        : "",
                    ],
                    [
                      "volume",
                      formatCompactUsd(currentAsset.volume24h),
                      Number.isFinite(currentAsset.marketCap)
                        ? t("asset.volumeShare", {
                            percent: (
                              (currentAsset.volume24h / currentAsset.marketCap) *
                              100
                            ).toFixed(2),
                          })
                        : "",
                    ],
                    [
                      "supply",
                      currentAsset.circulatingSupply
                        ? `${numberFormat({ notation: "compact", maximumFractionDigits: 2 }).format(currentAsset.circulatingSupply)} ${currentAsset.symbol}`
                        : "—",
                      currentAsset.circulatingSupply && currentAsset.maxSupply
                        ? t("asset.supplyShare", {
                            percent: (
                              (currentAsset.circulatingSupply /
                                currentAsset.maxSupply) *
                              100
                            ).toFixed(1),
                          })
                        : t("asset.noMaxSupply"),
                    ],
                    [
                      "range",
                      currentAsset.low24h && currentAsset.high24h
                        ? `${formatPrice(currentAsset.low24h)} — ${formatPrice(currentAsset.high24h)}`
                        : "—",
                      t("asset.rangeCaption"),
                    ],
                  ] as const
                ).map(([label, value, caption]) => (
                  <div className="panel detail-stat" key={label}>
                    <span>{t(`asset.${label}`)}</span>
                    <b>{value}</b>
                    <small>{caption}</small>
                  </div>
                ))}
              </div>
              <PriceChart
                data={chartData}
                type={chartType}
                onTypeChange={setChartType}
                timeframe={timeframe}
                onTimeframeChange={setTimeframe}
                symbol={currentAsset.symbol}
                source={
                  currentAssetOverride?.price !== null &&
                  currentAssetOverride?.price !== undefined
                    ? t("chart.sourceAdmin")
                    : mockMode
                      ? t("chart.sourceSimulated")
                      : t("chart.sourceLive")
                }
                loading={chartLoading}
                error={chartError}
                onRetry={() => setChartRetry((value) => value + 1)}
                assets={marketAssets}
              />
              <div className="detail-lower-grid">
                <section className="panel detail-news">
                  <div className="section-heading">
                    <div>
                      <span className="eyebrow">{t("news.latestEyebrow")}</span>
                      <h2>{t("news.latestTitle")}</h2>
                    </div>
                    <button className="text-button">
                      {t("common.viewAll")} <ArrowRight size={14} />
                    </button>
                  </div>
                  {displayedNews.slice(0, 2).map((article) => (
                    <div className="news-row" key={article.id}>
                      <div className="news-marker">
                        <Activity size={16} />
                      </div>
                      <div>
                        <b>{article.title}</b>
                        <span>{article.summary}</span>
                      </div>
                      <ArrowUpRight size={15} />
                    </div>
                  ))}
                  {newsLoaded && displayedNews.length === 0 && (
                    <p className="muted-copy">
                      {t("news.nonePublished")}
                    </p>
                  )}
                </section>
                <section className="panel about-card">
                  <span className="eyebrow">
                    {t("asset.about", { name: currentAsset.name })}
                  </span>
                  <h2>{t("asset.closerLook")}</h2>
                  <p>{t("asset.aboutText", { name: currentAsset.name })}</p>
                  <button
                    className="text-button"
                    onClick={() => toggleWatch(currentAsset.symbol)}
                  >
                    <Bookmark size={14} />
                    {watchlist.includes(currentAsset.symbol)
                      ? t("watchlist.inList")
                      : t("watchlist.add")}
                  </button>
                </section>
              </div>
            </>
          ) : activeScreen !== "Overview" ? (
            <Suspense
              fallback={
                <div className="workspace-screen-loading">
                  <div className="chart-skeleton" />
                </div>
              }
            >
              <MarketWorkspace
                screen={activeScreen}
                assets={marketAssets}
                prices={prices}
                watchlist={watchlist}
                onToggleWatch={toggleWatch}
                onOpenAsset={openAsset}
                onAlertCountChange={setAlertCount}
              />
            </Suspense>
          ) : (
            <>
              <div className="welcome-row">
                <div>
                  <div className="eyebrow welcome-date">
                    {dateFormat({
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })
                      .format(new Date())
                      .toUpperCase()}{" "}
                    <span className="date-dot">·</span>{" "}
                    {dateFormat({
                      hour: "numeric",
                      minute: "2-digit",
                      timeZoneName: "short",
                    }).format(new Date())}
                  </div>
                  <h1>{t("dashboard.title")}</h1>
                  <p>{t("dashboard.subtitle")}</p>
                </div>
                <button className="button button-subtle date-select">
                  <span>
                    {t("dashboard.todayDate", {
                      date: dateFormat({ month: "short", day: "numeric" }).format(
                        new Date(),
                      ),
                    })}
                  </span>
                  <ChevronDown size={15} />
                </button>
              </div>
              <section className="market-strip" aria-label={t("dashboard.snapshot")}>
                <article className="market-summary">
                  <span className="summary-label">{t("dashboard.totalMarketCap")}</span>
                  <b>{globalMarket ? formatCompactUsd(globalMarket.totalMarketCap) : "—"}</b>
                  {globalMarket && (
                    <span
                      className={`summary-change ${globalMarket.marketCapChange24h >= 0 ? "positive-text" : "negative-text"}`}
                    >
                      {globalMarket.marketCapChange24h >= 0 ? (
                        <ArrowUpRight size={14} />
                      ) : (
                        <ArrowDownRight size={14} />
                      )}{" "}
                      {Math.abs(globalMarket.marketCapChange24h).toFixed(2)}%{" "}
                      <small>24h</small>
                    </span>
                  )}
                  <Sparkline
                    values={totalTrend}
                    className="tiny-trend"
                    label={t("dashboard.trackedTrend")}
                  />
                </article>
                <article className="market-summary">
                  <span className="summary-label">{t("dashboard.volume24h")}</span>
                  <b>{globalMarket ? formatCompactUsd(globalMarket.totalVolume) : "—"}</b>
                  {globalMarket && (
                    <span className="summary-change">
                      <small>
                        {t("dashboard.volumeShare", {
                          percent: (
                            (globalMarket.totalVolume / globalMarket.totalMarketCap) *
                            100
                          ).toFixed(1),
                        })}
                      </small>
                    </span>
                  )}
                </article>
                <article className="market-summary">
                  <span className="summary-label">{t("dashboard.btcDominance")}</span>
                  <b>
                    {globalMarket?.dominance.BTC
                      ? globalMarket.dominance.BTC.toFixed(1)
                      : "—"}
                    <span className="summary-percent">%</span>
                  </b>
                  {globalMarket && (
                    <>
                      <div
                        className="dominance-bar"
                        role="img"
                        aria-label={t("dashboard.dominanceLabel", {
                          btc: (globalMarket.dominance.BTC ?? 0).toFixed(1),
                          eth: (globalMarket.dominance.ETH ?? 0).toFixed(1),
                        })}
                      >
                        <span style={{ width: `${globalMarket.dominance.BTC ?? 0}%` }} />
                        <span style={{ width: `${globalMarket.dominance.ETH ?? 0}%` }} />
                      </div>
                      <span className="summary-change">
                        <small>
                          ETH {(globalMarket.dominance.ETH ?? 0).toFixed(1)}%
                        </small>
                      </span>
                    </>
                  )}
                </article>
                <article className="market-summary sentiment-card">
                  <span className="summary-label">{t("dashboard.sentiment")}</span>
                  <b>
                    {fearGreed
                      ? t(`dashboard.fearGreedLevels.${fearGreed.classification}`)
                      : "—"}
                  </b>
                  <div className="sentiment-meter">
                    <span style={{ width: `${fearGreed?.value ?? 0}%` }} />
                  </div>
                  <span className="sentiment-caption">
                    {t("dashboard.fearGreed")} <b>{fearGreed?.value ?? "—"}</b> / 100
                  </span>
                </article>
              </section>

              <div className="dashboard-grid">
                <div className="dashboard-main-column">
                  <PriceChart
                    data={chartData}
                    type={chartType}
                    onTypeChange={setChartType}
                    timeframe={timeframe}
                    onTimeframeChange={setTimeframe}
                    symbol="BTC"
                    source={
                      mockMode
                        ? t("chart.sourceSimulated")
                        : t("chart.sourceLive")
                    }
                    loading={chartLoading}
                    error={chartError}
                    onRetry={() => setChartRetry((value) => value + 1)}
                    assets={marketAssets}
                  />
                  <div className="below-chart-grid">
                    <section className="panel movers-panel">
                      <div className="section-heading">
                        <div>
                          <span className="eyebrow">{t("movers.eyebrow")}</span>
                          <h2>{t("movers.title")}</h2>
                        </div>
                        <button
                          className="text-button"
                          onClick={() => navigateToScreen("Markets")}
                        >
                          {t("dashboard.allMarkets")} <ArrowRight size={14} />
                        </button>
                      </div>
                      <div className="movers-list">
                        {movers.map((asset, index) => (
                          <button
                            className="mover-row"
                            key={asset.symbol}
                            onClick={() => openAsset(asset.symbol)}
                          >
                            <span className="mover-rank">0{index + 1}</span>
                            <div
                              className={`asset-coin coin-${asset.symbol.toLowerCase()}`}
                            >
                              {asset.short}
                            </div>
                            <div className="mover-name">
                              <b>{asset.name}</b>
                              <span>{asset.symbol} / USD</span>
                            </div>
                            <Sparkline values={asset.sparkline} className="tiny-trend" />
                            <span
                              className={
                                asset.change >= 0
                                  ? "change-value positive-text"
                                  : "change-value negative-text"
                              }
                            >
                              {formatChange(asset.change)}
                            </span>
                          </button>
                        ))}
                      </div>
                    </section>
                    <section className="panel news-panel">
                      <div className="section-heading">
                        <div>
                          <span className="eyebrow">{t("news.briefEyebrow")}</span>
                          <h2>{t("news.briefTitle")}</h2>
                        </div>
                        <button
                          className="icon-button small-icon"
                          aria-label={t("news.more")}
                        >
                          <Ellipsis size={18} />
                        </button>
                      </div>
                      <div className="feature-story">
                        <div className="story-art">
                          <span className="story-orbit orbit-one" />
                          <span className="story-orbit orbit-two" />
                          <span className="story-sun" />
                          <span className="story-line" />
                        </div>
                        {displayedNews[0] ? (
                          <>
                            <div className="story-category">
                              {displayedNews[0].category} <span>·</span>{" "}
                              {t("news.minRead", {
                                count: displayedNews[0].readMinutes,
                              })}
                            </div>
                            <h3>{displayedNews[0].title}</h3>
                            <p>{displayedNews[0].summary}</p>
                            <span className="story-link">
                              {t("news.marketBrief")} <ArrowRight size={14} />
                            </span>
                          </>
                        ) : (
                          <p className="muted-copy">
                            {t("news.noneYet")}
                          </p>
                        )}
                      </div>
                      <div className="news-byline">
                        <div className="author-avatar">N</div>
                        <span>
                          Northstar Research <i>·</i>{" "}
                          {t("news.minutesAgo", { count: 38 })}
                        </span>
                      </div>
                    </section>
                  </div>
                </div>
                <aside className="dashboard-side-column">
                  <section className="panel watchlist-panel">
                    <div className="section-heading watchlist-heading">
                      <div>
                        <span className="eyebrow">{t("watchlist.eyebrow")}</span>
                        <h2>
                          {t("watchlist.title")}{" "}
                          <span className="watch-count">
                            {watchlist.length}
                          </span>
                        </h2>
                      </div>
                      <button
                        className="icon-button small-icon"
                        aria-label={t("watchlist.add")}
                        onClick={() => setSearchOpen(true)}
                      >
                        <Plus size={18} />
                      </button>
                    </div>
                    <div className="watchlist-controls">
                      <span>{t("watchlist.asset")}</span>
                      <button
                        onClick={() =>
                          setSortBy(sortBy === "change" ? "price" : "change")
                        }
                      >
                        {t("watchlist.change24h")} <ChevronDown size={13} />
                      </button>
                    </div>
                    <div className="watchlist-rows">
                      {watchAssets.length ? (
                        watchAssets.map((asset) => (
                          <div className="watch-row" key={asset.symbol}>
                            <button
                              className="watch-asset"
                              onClick={() => openAsset(asset.symbol)}
                            >
                              <span
                                className={`asset-coin coin-${asset.symbol.toLowerCase()}`}
                              >
                                {asset.short}
                              </span>
                              <span className="watch-name">
                                <b>{asset.name}</b>
                                <small>{asset.symbol}</small>
                              </span>
                            </button>
                            <Sparkline values={asset.sparkline} className="tiny-trend" />
                            <div className="watch-price">
                              <b>
                                {formatPrice(
                                  prices[asset.symbol] ?? asset.price,
                                )}
                              </b>
                              <small
                                className={
                                  asset.change >= 0
                                    ? "positive-text"
                                    : "negative-text"
                                }
                              >
                                {formatChange(asset.change)}
                              </small>
                            </div>
                            <button
                              className="remove-watch"
                              aria-label={t("watchlist.removeLabel", {
                                symbol: asset.symbol,
                              })}
                              onClick={() => toggleWatch(asset.symbol)}
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))
                      ) : (
                        <div className="empty-watchlist">
                          <Bookmark size={19} />
                          <b>{t("watchlist.emptyTitle")}</b>
                          <span>{t("watchlist.emptyText")}</span>
                        </div>
                      )}
                    </div>
                    <button
                      className="watchlist-add"
                      onClick={() => setSearchOpen(true)}
                    >
                      <Plus size={15} /> {t("watchlist.addAsset")}
                    </button>
                  </section>
                  <section className="panel portfolio-card">
                    <div className="section-heading">
                      <div>
                        <span className="eyebrow">{t("portfolioCard.eyebrow")}</span>
                        <h2>{t("nav.overview")}</h2>
                      </div>
                      <button
                        className="icon-button small-icon"
                        aria-label={t("portfolioCard.options")}
                      >
                        <Ellipsis size={18} />
                      </button>
                    </div>
                    <div className="portfolio-total">
                      <b>{holdings.length ? formatPrice(portfolioValue) : "—"}</b>
                      {Number.isFinite(portfolioChange) && (
                        <span
                          className={`portfolio-change ${portfolioChange >= 0 ? "" : "negative-text"}`}
                        >
                          {portfolioChange >= 0 ? (
                            <ArrowUpRight size={14} />
                          ) : (
                            <ArrowDownRight size={14} />
                          )}{" "}
                          {formatUsd(Math.abs(portfolioChange))} (
                          {formatChange((portfolioChange / portfolioStart) * 100)})
                        </span>
                      )}
                    </div>
                    <div className="portfolio-chart">
                      <Sparkline
                        values={portfolioHistory}
                        filled
                        label={t("portfolioCard.trend")}
                      />
                    </div>
                    <div className="portfolio-footer">
                      <span>{t("chart.performance", { timeframe: "7D" })}</span>
                      <button onClick={() => navigateToScreen("Portfolio")}>
                        {t("portfolioCard.view")} <ArrowRight size={13} />
                      </button>
                    </div>
                  </section>
                  <div className="trust-note">
                    <div className="trust-lock">✓</div>
                    <span>
                      {t("dashboard.trustNote")} <b>{t("common.notAdvice")}</b>
                    </span>
                  </div>
                </aside>
              </div>
            </>
          )}
          <footer className="page-footer">
            <span>© {new Date().getFullYear()} Northstar Markets</span>
            <span>
              <span className="footer-status">
                <i /> {t("dashboard.operational")}
              </span>
              <i className="footer-divider">·</i> {t("dashboard.dataBy")}{" "}
              <i className="footer-divider">·</i> {t("common.notAdvice")}
            </span>
          </footer>
        </div>
      </main>

      <nav
        className="mobile-bottom-nav"
        aria-label={t("dashboard.mobileNavigation")}
      >
        {(
          [
            ["Overview", LayoutDashboard],
            ["Markets", Globe2],
            ["Portfolio", CreditCard],
            ["Alerts", Bell],
          ] as const
        ).map(([label, Icon]) => (
          <button
            key={label}
            className={activeScreen === label && !selectedAsset ? "active" : ""}
            onClick={() => navigateToScreen(label)}
            aria-label={t(SCREEN_KEYS[label])}
          >
            <Icon size={18} />
            <span>{t(SCREEN_KEYS[label])}</span>
          </button>
        ))}
      </nav>

      {searchOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSearchOpen(false);
          }}
        >
          <section
            className="search-modal"
            role="dialog"
            aria-modal="true"
            aria-label={t("search.label")}
          >
            <div className="search-modal-input">
              <Search size={19} />
              <input
                autoFocus
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder={t("search.placeholder")}
              />
              <kbd>ESC</kbd>
              <button
                className="icon-button"
                onClick={() => setSearchOpen(false)}
                aria-label={t("search.close")}
              >
                <X size={16} />
              </button>
            </div>
            <div className="search-modal-body">
              {!searchText && recentSearches.length > 0 && (
                <>
                  <div className="modal-section-label">{t("search.recent")}</div>
                  {recentSearches.map((symbol) => {
                    const asset = assetFor(symbol);
                    return (
                      <button
                        className="search-result"
                        key={symbol}
                        onClick={() => openAsset(symbol)}
                      >
                        <div
                          className={`asset-coin coin-${asset.symbol.toLowerCase()}`}
                        >
                          {asset.short}
                        </div>
                        <span>
                          <b>{asset.name}</b>
                          <small>{asset.symbol}</small>
                        </span>
                        <span className="result-shortcut">{t("search.recentTag")}</span>
                      </button>
                    );
                  })}
                </>
              )}
              {searchText && (
                <div className="modal-section-label">{t("search.assets")}</div>
              )}
              {(searchText ? searchResults : marketAssets.slice(0, 5)).map(
                (asset) => (
                  <div className="search-result-wrap" key={asset.symbol}>
                    <button
                      className="search-result"
                      onClick={() => openAsset(asset.symbol)}
                    >
                      <div
                        className={`asset-coin coin-${asset.symbol.toLowerCase()}`}
                      >
                        {asset.short}
                      </div>
                      <span>
                        <b>{asset.name}</b>
                        <small>{asset.symbol} · USD</small>
                      </span>
                      <span className="result-price">
                        {formatPrice(prices[asset.symbol] ?? asset.price)}
                      </span>
                      <ChevronRight size={15} />
                    </button>
                    <button
                      className="result-add"
                      aria-label={
                        watchlist.includes(asset.symbol)
                          ? t("watchlist.removeLabel", { symbol: asset.symbol })
                          : t("watchlist.addLabel", { symbol: asset.symbol })
                      }
                      onClick={() => toggleWatch(asset.symbol)}
                    >
                      {watchlist.includes(asset.symbol) ? (
                        <Check size={15} />
                      ) : (
                        <Plus size={15} />
                      )}
                    </button>
                  </div>
                ),
              )}
              {searchText && !searchResults.length && (
                <div className="search-empty">
                  <Search size={21} />
                  <b>{t("search.emptyTitle")}</b>
                  <span>{t("search.emptyText")}</span>
                </div>
              )}
            </div>
            <div className="search-modal-footer">
              <span>
                <kbd>↑</kbd>
                <kbd>↓</kbd> {t("search.navigate")}
              </span>
              <span>
                <kbd>↵</kbd> {t("search.openHint")}
              </span>
              <span>{t("search.across", { count: ASSETS.length })}</span>
            </div>
          </section>
        </div>
      )}

      {settingsOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSettingsOpen(false);
          }}
        >
          <section
            className="settings-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
          >
            <div className="settings-modal-heading">
              <div>
                <span className="eyebrow">{t("settings.eyebrow")}</span>
                <h2 id="settings-title">{t("settings.title")}</h2>
              </div>
              <button
                className="icon-button"
                onClick={() => setSettingsOpen(false)}
                aria-label={t("settings.close")}
              >
                <X size={18} />
              </button>
            </div>
            <div className="settings-section">
              <div>
                <b>{t("settings.appearance")}</b>
                <span>{t("settings.appearanceText")}</span>
              </div>
              <div className="theme-toggle">
                <button
                  className={theme === "light" ? "active" : ""}
                  onClick={() => setTheme("light")}
                >
                  <Sun size={15} /> {t("settings.light")}
                </button>
                <button
                  className={theme === "dark" ? "active" : ""}
                  onClick={() => setTheme("dark")}
                >
                  <Moon size={15} /> {t("settings.dark")}
                </button>
              </div>
            </div>
            <div className="settings-section">
              <div>
                <b>{t("common.language")}</b>
                <span>{t("settings.languageText")}</span>
              </div>
              <LanguageSwitcher className="settings-language" />
            </div>
            <div className="settings-section">
              <div>
                <b>{t("settings.marketData")}</b>
                <span>{t("settings.marketDataText")}</span>
              </div>
              <button
                className={mockMode ? "switch is-on" : "switch"}
                role="switch"
                aria-checked={mockMode}
                onClick={() => {
                  setMockMode(!mockMode);
                  showToast(
                    !mockMode
                      ? t("settings.liveEnabled")
                      : t("settings.simulationEnabled"),
                  );
                }}
              >
                <span />
              </button>
            </div>
            <div className="settings-detail">
              <div className="settings-detail-icon">
                <Activity size={16} />
              </div>
              <span>
                <b>
                  {mockMode ? t("settings.simulation") : "Binance WebSocket"}
                </b>
                <small>
                  {mockMode
                    ? t("settings.simulationText")
                    : t("settings.liveText")}
                </small>
              </span>
              <span
                className={`settings-state ${mockMode ? "simulated" : "live"}`}
              >
                <i />
                {mockMode ? t("settings.simulatedTag") : t("settings.publicTag")}
              </span>
            </div>
            <div className="settings-section">
              <div>
                <b>{t("settings.colorSafe")}</b>
                <span>{t("settings.colorSafeText")}</span>
              </div>
              <button
                className={colorSafe ? "switch is-on" : "switch"}
                role="switch"
                aria-checked={colorSafe}
                onClick={() => setColorSafe(!colorSafe)}
              >
                <span />
              </button>
            </div>
            <div className="settings-storage">
              <Bookmark size={15} />
              <span>
                {t("settings.storage")}
              </span>
            </div>
            {user?.app_metadata?.role === "admin" && (
              <button
                className="button button-subtle settings-done"
                onClick={() => {
                  setSettingsOpen(false);
                  navigate("/admin");
                }}
              >
                <ShieldCheck size={15} /> {t("settings.admin")}
              </button>
            )}
            <button
              className="button button-primary settings-done"
              onClick={() => setSettingsOpen(false)}
            >
              {t("common.done")}
            </button>
          </section>
        </div>
      )}

      {accountOpen && (
        <Suspense
          fallback={
            <div className="modal-backdrop">
              <div className="account-modal-loading" role="status">
                {t("dashboard.loadingEmail")}
              </div>
            </div>
          }
        >
          {accountMode === "auth" ? (
            <AuthDialog
              onClose={closeAccount}
              onEmailUpdates={() => setAccountMode("email")}
            />
          ) : (
            <EmailAccountDialog
              onClose={closeAccount}
              onAccount={() => setAccountMode("auth")}
            />
          )}
        </Suspense>
      )}

      {toast && (
        <div className="toast-notice" role="status">
          <span className="toast-check">
            <Check size={13} />
          </span>
          <span>{toast}</span>
          <button onClick={() => setToast("")}>{t("common.dismiss")}</button>
        </div>
      )}
    </div>
  );
}

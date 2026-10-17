import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
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
};
type Candle = {
  time: string;
  open: number;
  close: number;
  high: number;
  low: number;
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
const TIMEFRAMES = ["1D", "1W", "1M", "3M", "1Y", "5Y", "ALL"];
const SCREEN_PATHS: Record<Screen, string> = {
  Overview: "/",
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
  mock: "northstar-mock-mode",
  colorSafe: "northstar-color-safe",
  recent: "northstar-recent-searches",
};
const numberFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});
const currencyFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

function readStorage<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function formatPrice(value: number) {
  return value < 1
    ? new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 4,
        maximumFractionDigits: 4,
      }).format(value)
    : currencyFormat.format(value);
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
      time: new Date(
        Date.now() - (71 - index) * interval * 60_000,
      ).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }),
      open,
      close,
      high: Math.max(open, close) + spread,
      low: Math.min(open, close) - spread,
    };
  });
}

function TinyTrend({ positive, color }: { positive: boolean; color?: string }) {
  const points = positive
    ? "0,21 12,19 23,22 34,14 45,16 57,9 68,11 80,3"
    : "0,4 12,10 23,8 34,16 45,13 57,21 68,18 80,24";
  return (
    <svg className="tiny-trend" viewBox="0 0 80 28" aria-hidden="true">
      <polyline
        points={points}
        fill="none"
        stroke={color || (positive ? "var(--positive)" : "var(--negative)")}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
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
}: {
  data: Candle[];
  type: ChartType;
  onTypeChange: (value: ChartType) => void;
  timeframe: string;
  onTimeframeChange: (value: string) => void;
  symbol: string;
  source: string;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [movingAverage, setMovingAverage] = useState(false);
  const [volume, setVolume] = useState(false);
  const [rsi, setRsi] = useState(false);
  const [comparison, setComparison] = useState("");
  const svgRef = useRef<SVGSVGElement>(null);
  const plot = useMemo(() => {
    const values = data.flatMap((row) => [row.high, row.low]);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = (max - min) * 0.14 || max * 0.01;
    const top = max + pad;
    const bottom = min - pad;
    const x = (index: number) =>
      16 + (index / Math.max(data.length - 1, 1)) * 868;
    const y = (value: number) => 22 + ((top - value) / (top - bottom)) * 266;
    return { x, y, min: bottom, max: top };
  }, [data]);
  const points = data
    .map((point, index) => `${plot.x(index)},${plot.y(point.close)}`)
    .join(" ");
  const areaPoints = `16,300 ${points} 884,300`;
  const activeIndex = hoverIndex ?? data.length - 1;
  const active = data[activeIndex];
  const chartChange =
    data.length > 1
      ? (data[data.length - 1].close / data[0].open - 1) * 100
      : 0;
  const movingAveragePoints = data
    .map((_, index) => {
      const slice = data.slice(Math.max(0, index - 19), index + 1);
      return `${plot.x(index)},${plot.y(slice.reduce((sum, item) => sum + item.close, 0) / slice.length)}`;
    })
    .join(" ");
  const comparisonAsset = ASSETS.find((asset) => asset.symbol === comparison);
  const comparisonPoints =
    comparison && data.length
      ? data
          .map((_, index) => {
            const relative = index / Math.max(data.length - 1, 1);
            const normalized =
              data[0].close *
              (1 +
                (relative * (comparisonAsset?.change ?? 0)) / 100 +
                Math.sin(index * 0.24 + comparison.length) * 0.006);
            return `${plot.x(index)},${plot.y(normalized)}`;
          })
          .join(" ")
      : "";
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
  const rsiValue = data.length ? Math.round(rsiValueAt(data.length - 1)) : 0;
  const rsiPoints = data
    .map(
      (_, index) =>
        `${plot.x(index)},${8 + ((100 - rsiValueAt(index)) / 100) * 46}`,
    )
    .join(" ");

  const moveCrosshair = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current || !data.length) return;
    const bounds = svgRef.current.getBoundingClientRect();
    const relative = Math.min(
      Math.max((event.clientX - bounds.left) / bounds.width, 0),
      1,
    );
    setHoverIndex(Math.round(relative * (data.length - 1)));
  };

  return (
    <section className="panel chart-panel" aria-label={`${symbol} price chart`}>
      <div className="chart-panel-top">
        <div className="chart-heading">
          <span className="eyebrow">PRICE PERFORMANCE</span>
          <span className="chart-current">
            {symbol} <span>·</span> USD
          </span>
        </div>
        <div className="chart-tools">
          <div
            className="chart-type-control"
            role="group"
            aria-label="Chart style"
          >
            {(["Area", "Line", "Candles"] as ChartType[]).map((item) => (
              <button
                className={type === item ? "chart-type active" : "chart-type"}
                key={item}
                onClick={() => onTypeChange(item)}
              >
                {item}
              </button>
            ))}
          </div>
          <div className="chart-options-wrap">
            <button
              className="icon-button chart-options"
              aria-label="Chart options"
              aria-expanded={toolsOpen}
              onClick={() => setToolsOpen(!toolsOpen)}
            >
              <SlidersHorizontal size={16} />
            </button>
            {toolsOpen && (
              <div className="chart-options-menu">
                <span className="menu-label">INDICATORS</span>
                <button onClick={() => setMovingAverage(!movingAverage)}>
                  <span>
                    Moving average <small>20 period</small>
                  </span>
                  <i
                    className={
                      movingAverage ? "menu-check checked" : "menu-check"
                    }
                  >
                    {movingAverage && <Check size={11} />}
                  </i>
                </button>
                <button onClick={() => setVolume(!volume)}>
                  <span>
                    Volume <small>Trading activity</small>
                  </span>
                  <i className={volume ? "menu-check checked" : "menu-check"}>
                    {volume && <Check size={11} />}
                  </i>
                </button>
                <button onClick={() => setRsi(!rsi)}>
                  <span>
                    RSI <small>Momentum · 14</small>
                  </span>
                  <i className={rsi ? "menu-check checked" : "menu-check"}>
                    {rsi && <Check size={11} />}
                  </i>
                </button>
                <span className="menu-label compare-label">COMPARE ASSET</span>
                <select
                  aria-label="Compare with another asset"
                  value={comparison}
                  onChange={(event) => setComparison(event.target.value)}
                >
                  <option value="">Off</option>
                  {ASSETS.filter((asset) => asset.symbol !== symbol).map(
                    (asset) => (
                      <option key={asset.symbol} value={asset.symbol}>
                        {asset.name} ({asset.symbol})
                      </option>
                    ),
                  )}
                </select>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="chart-value-row" aria-live="polite">
        <strong>{formatPrice(data[data.length - 1]?.close ?? 0)}</strong>
        <span
          className={`change-pill ${chartChange >= 0 ? "positive" : "negative"}`}
        >
          {chartChange >= 0 ? (
            <ArrowUpRight size={14} />
          ) : (
            <ArrowDownRight size={14} />
          )}{" "}
          {chartChange >= 0 ? "+" : "−"}
          {Math.abs(chartChange).toFixed(2)}%
        </span>
        <span className="chart-value-note">{timeframe} performance</span>
      </div>
      <div className="chart-plot-wrap">
        {loading ? (
          <div className="chart-skeleton" aria-label="Loading chart" />
        ) : error ? (
          <div className="chart-error">
            <b>Chart data is unavailable</b>
            <span>Check your connection and try again.</span>
            <button className="button button-subtle" onClick={onRetry}>
              Retry <ArrowRight size={13} />
            </button>
          </div>
        ) : data.length ? (
          <>
            <svg
              ref={svgRef}
              className="price-chart"
              viewBox="0 0 900 330"
              preserveAspectRatio="none"
              onPointerMove={moveCrosshair}
              onPointerLeave={() => setHoverIndex(null)}
              role="img"
              aria-label={`${symbol} is up today; price range ${formatPrice(plot.min)} to ${formatPrice(plot.max)}. Use pointer to inspect chart values.`}
              tabIndex={0}
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
              <defs>
                <linearGradient id="chart-fill" x1="0" x2="0" y1="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor="var(--chart-line)"
                    stopOpacity=".22"
                  />
                  <stop
                    offset="100%"
                    stopColor="var(--chart-line)"
                    stopOpacity="0"
                  />
                </linearGradient>
              </defs>
              {[0, 1, 2, 3].map((line) => (
                <g key={line}>
                  <line
                    x1="16"
                    x2="884"
                    y1={35 + line * 78}
                    y2={35 + line * 78}
                    className="chart-gridline"
                  />
                  <text x="888" y={39 + line * 78} className="chart-axis-label">
                    {formatPrice(plot.max - ((plot.max - plot.min) * line) / 3)}
                  </text>
                </g>
              ))}
              {type === "Candles" ? (
                data.map((row, index) => {
                  const x = plot.x(index);
                  const candleWidth = Math.max(2.2, 560 / data.length);
                  const rising = row.close >= row.open;
                  const color = rising ? "var(--positive)" : "var(--negative)";
                  return (
                    <g key={`${row.time}-${index}`}>
                      <line
                        x1={x}
                        x2={x}
                        y1={plot.y(row.high)}
                        y2={plot.y(row.low)}
                        stroke={color}
                        strokeWidth="1.4"
                      />
                      <rect
                        x={x - candleWidth / 2}
                        y={Math.min(plot.y(row.open), plot.y(row.close))}
                        width={candleWidth}
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
                    <polygon points={areaPoints} fill="url(#chart-fill)" />
                  )}
                  <polyline
                    points={points}
                    fill="none"
                    stroke="var(--chart-line)"
                    strokeWidth="2.4"
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
              {comparison && (
                <polyline
                  points={comparisonPoints}
                  fill="none"
                  stroke="var(--comparison-line)"
                  strokeWidth="1.7"
                  strokeDasharray="4 4"
                  vectorEffect="non-scaling-stroke"
                />
              )}
              {volume &&
                data.map((row, index) => (
                  <rect
                    key={`volume-${index}`}
                    x={plot.x(index) - 2}
                    y={
                      292 -
                      Math.min(
                        18,
                        (Math.abs(row.close - row.open) / row.close) * 4600,
                      )
                    }
                    width="4"
                    height={Math.max(
                      2,
                      Math.min(
                        18,
                        (Math.abs(row.close - row.open) / row.close) * 4600,
                      ),
                    )}
                    fill={
                      row.close >= row.open
                        ? "var(--positive)"
                        : "var(--negative)"
                    }
                    opacity=".55"
                  />
                ))}
              {hoverIndex !== null && (
                <>
                  <line
                    x1={plot.x(activeIndex)}
                    x2={plot.x(activeIndex)}
                    y1="12"
                    y2="300"
                    className="chart-crosshair"
                  />
                  <circle
                    cx={plot.x(activeIndex)}
                    cy={plot.y(active.close)}
                    r="4.5"
                    className="chart-marker"
                  />
                </>
              )}
              <text x="16" y="322" className="chart-axis-label">
                {timeframe === "1D" ? "12:00 AM" : "Earlier"}
              </text>
              <text
                x="450"
                y="322"
                textAnchor="middle"
                className="chart-axis-label"
              >
                {timeframe === "1D" ? "12:00 PM" : "Mid period"}
              </text>
              <text
                x="884"
                y="322"
                textAnchor="end"
                className="chart-axis-label"
              >
                Now
              </text>
            </svg>
            {hoverIndex !== null && (
              <div className="chart-tooltip">
                <span>{active?.time}</span>
                <b>{formatPrice(active?.close ?? 0)}</b>
                <small>
                  O {formatPrice(active?.open ?? 0)} · H{" "}
                  {formatPrice(active?.high ?? 0)} · L{" "}
                  {formatPrice(active?.low ?? 0)}
                </small>
              </div>
            )}
          </>
        ) : (
          <div className="chart-empty">
            <Activity size={20} />
            <b>No data for this range</b>
            <span>Try another timeframe.</span>
          </div>
        )}
      </div>
      {rsi && (
        <div className="rsi-panel">
          <span>
            RSI (14) <b>{rsiValue}</b>
          </span>
          <svg
            viewBox="0 0 900 64"
            preserveAspectRatio="none"
            aria-label="Relative strength index"
          >
            <line x1="16" x2="884" y1="22" y2="22" className="chart-gridline" />
            <line x1="16" x2="884" y1="40" y2="40" className="chart-gridline" />
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
      {(movingAverage || comparison) && (
        <div className="chart-legend">
          {movingAverage && (
            <span>
              <i className="legend-ma" />
              MA (20)
            </span>
          )}
          {comparison && (
            <span>
              <i className="legend-compare" />
              {comparisonAsset?.symbol} normalized
            </span>
          )}
        </div>
      )}
      <div className="chart-footer">
        <div
          className="timeframe-control"
          role="group"
          aria-label="Chart timeframe"
        >
          {TIMEFRAMES.map((item) => (
            <button
              key={item}
              className={timeframe === item ? "timeframe active" : "timeframe"}
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
  const { user, isLoading: authLoading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { symbol: assetRouteSymbol } = useParams<{ symbol: string }>();
  const returnScreenRef = useRef<Screen>("Overview");
  const accountReturnPathRef = useRef("/");
  const [watchlist, setWatchlist] = useState<string[]>(() =>
    readStorage(STORAGE.watchlist, ["BTC", "ETH", "SOL", "LINK"]),
  );
  const [prices, setPrices] = useState<Record<string, number>>(() =>
    Object.fromEntries(ASSETS.map((asset) => [asset.symbol, asset.price])),
  );
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
  const [chartData, setChartData] = useState<Candle[]>(() =>
    makeSeries(ASSETS[0].price, 5),
  );
  const [chartLoading, setChartLoading] = useState(false);
  const [chartError, setChartError] = useState(false);
  const [chartRetry, setChartRetry] = useState(0);
  const [mockMode, setMockMode] = useState(() =>
    readStorage(STORAGE.mock, true),
  );
  const [theme, setTheme] = useState(() => readStorage(STORAGE.theme, "dark"));
  const [colorSafe, setColorSafe] = useState(() =>
    readStorage(STORAGE.colorSafe, false),
  );
  const [feedState, setFeedState] = useState<FeedState>("simulated");
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
  const [timeframe, setTimeframe] = useState("1D");
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
      navigate("/");
      return;
    }
    setSelectedAsset(null);
    const screen = PATH_SCREENS[location.pathname];
    if (screen) setActiveScreen(screen);
    else navigate("/");
  }, [assetRouteSymbol, location.pathname, location.state, navigate]);

  const marketAssets = useMemo(
    () =>
      ASSETS.map((asset) => ({
        ...asset,
        change: marketChanges[asset.symbol] ?? asset.change,
        volume24h: marketVolumes[asset.symbol] ?? asset.volume24h,
      })),
    [marketChanges, marketVolumes],
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
    const controller = new AbortController();
    const interval =
      (
        {
          "1D": "15m",
          "1W": "2h",
          "1M": "12h",
          "3M": "1d",
          "1Y": "1w",
          "5Y": "1M",
          ALL: "1M",
        } as Record<string, string>
      )[timeframe] ?? "15m";
    setChartLoading(true);
    setChartError(false);
    void fetch(
      `https://api.binance.com/api/v3/klines?symbol=${currentAsset.symbol}USDT&interval=${interval}&limit=72`,
      { signal: controller.signal },
    )
      .then((response) => {
        if (!response.ok) throw new Error("Chart history unavailable");
        return response.json() as Promise<
          Array<
            [
              number,
              string,
              string,
              string,
              string,
              string,
              number,
              ...unknown[],
            ]
          >
        >;
      })
      .then((rows) => {
        if (controller.signal.aborted) return;
        setChartData(
          rows.map(([time, open, high, low, close]) => ({
            time: new Date(time).toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            }),
            open: Number(open),
            high: Number(high),
            low: Number(low),
            close: Number(close),
          })),
        );
        setLastUpdated(new Date());
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name !== "AbortError")
          setChartError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setChartLoading(false);
      });
    return () => controller.abort();
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
            showToast(
              "Email alerts could not be synced. Open email preferences to retry.",
            );
        })
        .catch(() =>
          showToast(
            "Email alerts could not be synced. Open email preferences to retry.",
          ),
        );
    };
    window.addEventListener("northstar:alerts-updated", syncEmailAlerts);
    return () =>
      window.removeEventListener("northstar:alerts-updated", syncEmailAlerts);
  }, [showToast]);

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
    const controller = new AbortController();
    receivedFeedSymbols.current.clear();
    let backoff = 1000;
    let closed = false;
    void Promise.all(
      ASSETS.map(async (asset) => {
        const response = await fetch(
          `https://api.binance.com/api/v3/ticker/24hr?symbol=${asset.symbol}USDT`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error("Market snapshot unavailable");
        const ticker = (await response.json()) as {
          lastPrice: string;
          priceChangePercent: string;
          quoteVolume: string;
        };
        return [
          asset.symbol,
          Number(ticker.lastPrice),
          Number(ticker.priceChangePercent),
          Number(ticker.quoteVolume),
        ] as const;
      }),
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
        "wss://stream.binance.com:9443/stream?streams=btcusdt@ticker/ethusdt@ticker/solusdt@ticker/bnbusdt@ticker/xrpusdt@ticker/adausdt@ticker/avaxusdt@ticker/linkusdt@ticker",
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
      controller.abort();
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
      location.pathname === "/account" ? "/" : location.pathname;
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
        ? `${symbol} removed from watchlist`
        : `${symbol} added to watchlist`,
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
  const movers = [...marketAssets]
    .sort((a, b) => b.change - a.change)
    .slice(0, 4);
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
            aria-label="Close navigation"
            onClick={() => setMobileMenu(false)}
          >
            <X size={18} />
          </button>
        </div>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="primary-nav" aria-label="Main navigation">
          {(
            [
              ["Overview", LayoutDashboard],
              ["Markets", Globe2],
              ["Portfolio", CreditCard],
              ["Alerts", Bell],
              ["Screener", SlidersHorizontal],
              ["Send funds", Send],
            ] as const
          ).map(([label, Icon]) => (
            <button
              key={label}
              onClick={() => {
                if (label === "Send funds") {
                  setMobileMenu(false);
                  navigate("/send");
                } else {
                  navigateToScreen(label);
                }
              }}
              className={`nav-item ${activeScreen === label && !selectedAsset ? "selected" : ""}`}
            >
              <Icon size={17} strokeWidth={1.8} />
              <span>{label}</span>
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
              <b>Need a hand?</b>
              <span>Visit our help center</span>
            </div>
            <ChevronRight size={15} />
          </div>
          <button
            className="profile-row"
            aria-haspopup="dialog"
            aria-label="Open account"
            onClick={openAccount}
          >
            <div className="profile-avatar">
              {authLoading ? "…" : (user?.email?.[0]?.toUpperCase() ?? "G")}
            </div>
            <div className="profile-copy">
              <b>{user?.email ?? "Northstar account"}</b>
              <span>
                {authLoading
                  ? "Checking account"
                  : user
                    ? "Manage account"
                    : "Sign in or create account"}
              </span>
            </div>
            <MoreHorizontal size={18} />
          </button>
        </div>
      </aside>
      {mobileMenu && (
        <button
          className="mobile-scrim"
          aria-label="Close navigation"
          onClick={() => setMobileMenu(false)}
        />
      )}

      <main className="main-shell">
        <header className="topbar">
          <button
            className="mobile-menu-button icon-button"
            aria-label="Open navigation"
            onClick={() => setMobileMenu(true)}
          >
            <Menu size={20} />
          </button>
          <div className="breadcrumb">
            <span>Workspace</span>
            <ChevronRight size={14} />
            <b>{selectedAsset ? currentAsset.name : activeScreen}</b>
          </div>
          <div className="topbar-actions">
            <button
              className="search-trigger"
              onClick={() => setSearchOpen(true)}
              aria-label="Search assets"
            >
              <Search size={16} />
              <span>Search anything...</span>
              <kbd>
                <Command size={11} /> K
              </kbd>
            </button>
            <button
              className="icon-button settings-trigger"
              aria-label="Open settings"
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
                <ArrowLeft size={15} /> All markets
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
                      Digital asset <span>·</span> Rank #
                      {currentAsset.symbol === "BTC"
                        ? "1"
                        : currentAsset.symbol === "ETH"
                          ? "2"
                          : "8"}
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
                    {currentAsset.change >= 0 ? "+" : "−"}
                    {Math.abs(currentAsset.change).toFixed(2)}%{" "}
                    <span>today</span>
                  </span>
                </div>
              </div>
              <div className="detail-stat-grid">
                {[
                  ["Market cap", "$1.32T", "#1 by market cap"],
                  ["24h volume", "$28.46B", "+12.8% vs yesterday"],
                  ["Circulating supply", "19.68M BTC", "93.7% of max supply"],
                  ["24h range", "$65,842 — $68,105", "Low to high"],
                ].map(([label, value, caption]) => (
                  <div className="panel detail-stat" key={label}>
                    <span>{label}</span>
                    <b>
                      {label === "Market cap"
                        ? currentAsset.symbol === "BTC"
                          ? value
                          : "$68.42B"
                        : value}
                    </b>
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
                    ? "Admin-managed price"
                    : mockMode
                      ? "Simulated candles"
                      : "Binance · USDT (USD est.)"
                }
                loading={chartLoading}
                error={chartError}
                onRetry={() => setChartRetry((value) => value + 1)}
              />
              <div className="detail-lower-grid">
                <section className="panel detail-news">
                  <div className="section-heading">
                    <div>
                      <span className="eyebrow">LATEST COVERAGE</span>
                      <h2>News & insights</h2>
                    </div>
                    <button className="text-button">
                      View all <ArrowRight size={14} />
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
                      No stories have been published yet.
                    </p>
                  )}
                </section>
                <section className="panel about-card">
                  <span className="eyebrow">
                    ABOUT {currentAsset.name.toUpperCase()}
                  </span>
                  <h2>A closer look</h2>
                  <p>
                    {currentAsset.name} is one of the most actively followed
                    digital assets on the market. Review its price history,
                    liquidity, and market context before making decisions.
                  </p>
                  <button
                    className="text-button"
                    onClick={() => toggleWatch(currentAsset.symbol)}
                  >
                    <Bookmark size={14} />
                    {watchlist.includes(currentAsset.symbol)
                      ? "In your watchlist"
                      : "Add to watchlist"}
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
                    {new Intl.DateTimeFormat("en-US", {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })
                      .format(new Date())
                      .toUpperCase()}{" "}
                    <span className="date-dot">·</span>{" "}
                    {new Intl.DateTimeFormat("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                      timeZoneName: "short",
                    }).format(new Date())}
                  </div>
                  <h1>Market overview</h1>
                  <p>A clearer view of what’s moving today.</p>
                </div>
                <button className="button button-subtle date-select">
                  <span>
                    Today,{" "}
                    {new Intl.DateTimeFormat("en-US", {
                      month: "short",
                      day: "numeric",
                    }).format(new Date())}
                  </span>
                  <ChevronDown size={15} />
                </button>
              </div>
              <section className="market-strip" aria-label="Market snapshot">
                <article className="market-summary">
                  <span className="summary-label">TOTAL MARKET CAP</span>
                  <b>$2.42T</b>
                  <span className="summary-change positive-text">
                    <ArrowUpRight size={14} /> 1.84% <small>24h</small>
                  </span>
                  <TinyTrend positive />
                </article>
                <article className="market-summary">
                  <span className="summary-label">24H VOLUME</span>
                  <b>$68.7B</b>
                  <span className="summary-change positive-text">
                    <ArrowUpRight size={14} /> 8.23% <small>24h</small>
                  </span>
                  <TinyTrend positive />
                </article>
                <article className="market-summary">
                  <span className="summary-label">BTC DOMINANCE</span>
                  <b>
                    54.2<span className="summary-percent">%</span>
                  </b>
                  <span className="summary-change negative-text">
                    <ArrowDownRight size={14} /> 0.31% <small>24h</small>
                  </span>
                  <TinyTrend positive color="var(--text-muted)" />
                </article>
                <article className="market-summary sentiment-card">
                  <span className="summary-label">MARKET SENTIMENT</span>
                  <b>Optimistic</b>
                  <div className="sentiment-meter">
                    <span />
                  </div>
                  <span className="sentiment-caption">
                    Fear & Greed Index <b>68</b> / 100
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
                        ? "Simulated candles"
                        : "Binance · USDT (USD est.)"
                    }
                    loading={chartLoading}
                    error={chartError}
                    onRetry={() => setChartRetry((value) => value + 1)}
                  />
                  <div className="below-chart-grid">
                    <section className="panel movers-panel">
                      <div className="section-heading">
                        <div>
                          <span className="eyebrow">MARKET PULSE</span>
                          <h2>Top movers</h2>
                        </div>
                        <button
                          className="text-button"
                          onClick={() => navigateToScreen("Markets")}
                        >
                          All markets <ArrowRight size={14} />
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
                            <TinyTrend positive={asset.change > 0} />
                            <span
                              className={
                                asset.change > 0
                                  ? "change-value positive-text"
                                  : "change-value negative-text"
                              }
                            >
                              {asset.change > 0 ? "+" : ""}
                              {asset.change.toFixed(2)}%
                            </span>
                          </button>
                        ))}
                      </div>
                    </section>
                    <section className="panel news-panel">
                      <div className="section-heading">
                        <div>
                          <span className="eyebrow">THE DAILY BRIEF</span>
                          <h2>Worth a read</h2>
                        </div>
                        <button
                          className="icon-button small-icon"
                          aria-label="More news"
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
                              {displayedNews[0].readMinutes} MIN READ
                            </div>
                            <h3>{displayedNews[0].title}</h3>
                            <p>{displayedNews[0].summary}</p>
                            <span className="story-link">
                              Market brief <ArrowRight size={14} />
                            </span>
                          </>
                        ) : (
                          <p className="muted-copy">
                            No published stories yet.
                          </p>
                        )}
                      </div>
                      <div className="news-byline">
                        <div className="author-avatar">N</div>
                        <span>
                          Northstar Research <i>·</i> 38 min ago
                        </span>
                      </div>
                    </section>
                  </div>
                </div>
                <aside className="dashboard-side-column">
                  <section className="panel watchlist-panel">
                    <div className="section-heading watchlist-heading">
                      <div>
                        <span className="eyebrow">YOUR MARKET</span>
                        <h2>
                          Watchlist{" "}
                          <span className="watch-count">
                            {watchlist.length}
                          </span>
                        </h2>
                      </div>
                      <button
                        className="icon-button small-icon"
                        aria-label="Add to watchlist"
                        onClick={() => setSearchOpen(true)}
                      >
                        <Plus size={18} />
                      </button>
                    </div>
                    <div className="watchlist-controls">
                      <span>Asset</span>
                      <button
                        onClick={() =>
                          setSortBy(sortBy === "change" ? "price" : "change")
                        }
                      >
                        24h change <ChevronDown size={13} />
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
                            <TinyTrend positive={asset.change > 0} />
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
                                {asset.change >= 0 ? "+" : ""}
                                {asset.change.toFixed(2)}%
                              </small>
                            </div>
                            <button
                              className="remove-watch"
                              aria-label={`Remove ${asset.symbol} from watchlist`}
                              onClick={() => toggleWatch(asset.symbol)}
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))
                      ) : (
                        <div className="empty-watchlist">
                          <Bookmark size={19} />
                          <b>Your watchlist is empty</b>
                          <span>Add assets to keep them close.</span>
                        </div>
                      )}
                    </div>
                    <button
                      className="watchlist-add"
                      onClick={() => setSearchOpen(true)}
                    >
                      <Plus size={15} /> Add an asset
                    </button>
                  </section>
                  <section className="panel portfolio-card">
                    <div className="section-heading">
                      <div>
                        <span className="eyebrow">YOUR PORTFOLIO</span>
                        <h2>Overview</h2>
                      </div>
                      <button
                        className="icon-button small-icon"
                        aria-label="Portfolio options"
                      >
                        <Ellipsis size={18} />
                      </button>
                    </div>
                    <div className="portfolio-total">
                      <b>
                        $24,680<span>.52</span>
                      </b>
                      <span className="portfolio-change">
                        <ArrowUpRight size={14} /> $1,240.18 (5.29%)
                      </span>
                    </div>
                    <div className="portfolio-chart">
                      <svg
                        viewBox="0 0 340 78"
                        preserveAspectRatio="none"
                        aria-label="Portfolio value has trended upward this month"
                      >
                        <defs>
                          <linearGradient
                            id="portfolio-gradient"
                            x1="0"
                            x2="0"
                            y1="0"
                            y2="1"
                          >
                            <stop
                              offset="0"
                              stopColor="var(--chart-line)"
                              stopOpacity=".19"
                            />
                            <stop
                              offset="100%"
                              stopColor="var(--chart-line)"
                              stopOpacity="0"
                            />
                          </linearGradient>
                        </defs>
                        <path
                          d="M0 64 C22 57 29 62 46 50 S78 45 96 54 S124 37 143 40 S174 27 190 35 S226 14 244 24 S273 10 294 21 S322 5 340 9 V78 H0Z"
                          fill="url(#portfolio-gradient)"
                        />
                        <path
                          d="M0 64 C22 57 29 62 46 50 S78 45 96 54 S124 37 143 40 S174 27 190 35 S226 14 244 24 S273 10 294 21 S322 5 340 9"
                          fill="none"
                          stroke="var(--chart-line)"
                          strokeWidth="2"
                          vectorEffect="non-scaling-stroke"
                        />
                      </svg>
                    </div>
                    <div className="portfolio-footer">
                      <span>1M performance</span>
                      <button onClick={() => navigateToScreen("Portfolio")}>
                        View portfolio <ArrowRight size={13} />
                      </button>
                    </div>
                  </section>
                  <div className="trust-note">
                    <div className="trust-lock">✓</div>
                    <span>
                      Live tickers via Binance. Market summaries and portfolio
                      values are illustrative. <b>Not financial advice.</b>
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
                <i /> All systems operational
              </span>
              <i className="footer-divider">·</i> Data by Binance{" "}
              <i className="footer-divider">·</i> Not financial advice
            </span>
          </footer>
        </div>
      </main>

      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
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
            aria-label={label}
          >
            <Icon size={18} />
            <span>{label}</span>
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
            aria-label="Search markets"
          >
            <div className="search-modal-input">
              <Search size={19} />
              <input
                autoFocus
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Search assets, symbols..."
              />
              <kbd>ESC</kbd>
              <button
                className="icon-button"
                onClick={() => setSearchOpen(false)}
                aria-label="Close search"
              >
                <X size={16} />
              </button>
            </div>
            <div className="search-modal-body">
              {!searchText && recentSearches.length > 0 && (
                <>
                  <div className="modal-section-label">RECENT SEARCHES</div>
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
                        <span className="result-shortcut">Recent</span>
                      </button>
                    );
                  })}
                </>
              )}
              {searchText && <div className="modal-section-label">ASSETS</div>}
              {(searchText ? searchResults : ASSETS.slice(0, 5)).map(
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
                      aria-label={`${watchlist.includes(asset.symbol) ? "Remove" : "Add"} ${asset.symbol} ${watchlist.includes(asset.symbol) ? "from" : "to"} watchlist`}
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
                  <b>No assets found</b>
                  <span>Try a symbol like BTC or ETH.</span>
                </div>
              )}
            </div>
            <div className="search-modal-footer">
              <span>
                <kbd>↑</kbd>
                <kbd>↓</kbd> to navigate
              </span>
              <span>
                <kbd>↵</kbd> to open
              </span>
              <span>Search across 8 markets</span>
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
                <span className="eyebrow">PREFERENCES</span>
                <h2 id="settings-title">Settings</h2>
              </div>
              <button
                className="icon-button"
                onClick={() => setSettingsOpen(false)}
                aria-label="Close settings"
              >
                <X size={18} />
              </button>
            </div>
            <div className="settings-section">
              <div>
                <b>Appearance</b>
                <span>Choose a comfortable look.</span>
              </div>
              <div className="theme-toggle">
                <button
                  className={theme === "light" ? "active" : ""}
                  onClick={() => setTheme("light")}
                >
                  <Sun size={15} /> Light
                </button>
                <button
                  className={theme === "dark" ? "active" : ""}
                  onClick={() => setTheme("dark")}
                >
                  <Moon size={15} /> Dark
                </button>
              </div>
            </div>
            <div className="settings-section">
              <div>
                <b>Market data</b>
                <span>Choose how prices update on this device.</span>
              </div>
              <button
                className={mockMode ? "switch is-on" : "switch"}
                role="switch"
                aria-checked={mockMode}
                onClick={() => {
                  setMockMode(!mockMode);
                  showToast(
                    !mockMode
                      ? "Live Binance feed enabled"
                      : "Simulation mode enabled",
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
                <b>{mockMode ? "Simulation mode" : "Binance WebSocket"}</b>
                <small>
                  {mockMode
                    ? "Prices move locally for demos and offline use."
                    : "Public market feed. No API key required."}
                </small>
              </span>
              <span
                className={`settings-state ${mockMode ? "simulated" : "live"}`}
              >
                <i />
                {mockMode ? "SIMULATED" : "PUBLIC"}
              </span>
            </div>
            <div className="settings-section">
              <div>
                <b>Color-safe palette</b>
                <span>Use an alternate up/down color pairing.</span>
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
                Your watchlist, theme, and market preferences stay in this
                browser. Account sign-in is handled securely by Supabase.
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
                <ShieldCheck size={15} /> Admin workspace
              </button>
            )}
            <button
              className="button button-primary settings-done"
              onClick={() => setSettingsOpen(false)}
            >
              Done
            </button>
          </section>
        </div>
      )}

      {accountOpen && (
        <Suspense
          fallback={
            <div className="modal-backdrop">
              <div className="account-modal-loading" role="status">
                Loading email preferences…
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
          <button onClick={() => setToast("")}>Dismiss</button>
        </div>
      )}
    </div>
  );
}

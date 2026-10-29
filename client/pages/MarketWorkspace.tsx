import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { InvestmentPriceChart } from "@/components/InvestmentPriceChart";
import { PendingTransfers } from "@/components/funds/PendingTransfers";
import { useMyDeposits } from "@/hooks/use-my-deposits";
import {
  Activity,
  ArrowDown,
  ArrowDownRight,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  Bell,
  Bookmark,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  CircleAlert,
  Edit3,
  Filter,
  LoaderCircle,
  Plus,
  ArrowUpFromLine,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { authorizedFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import i18n from "@/i18n";
import { dateFormat, formatUsd, numberFormat, usdFormat } from "@/i18n/format";
import { MarketChart } from "@/components/market/MarketChart";
import { Sparkline } from "@/components/market/Sparkline";
import {
  HOLDINGS_STORAGE,
  holdingsHistory,
  readHoldings,
  type Holding,
} from "@/lib/holdings";
import { fetchCandles, type Candle, type Timeframe } from "@/lib/market";

type Asset = {
  symbol: string;
  name: string;
  price: number;
  change: number;
  marketCap: number;
  short: string;
  volume24h: number;
  sparkline?: number[];
};
type Screen = "Markets" | "Portfolio" | "Alerts" | "Screener";
type Props = {
  screen: Screen;
  assets: Asset[];
  prices: Record<string, number>;
  watchlist: string[];
  onToggleWatch: (symbol: string) => void;
  onOpenAsset: (symbol: string) => void;
  onAlertCountChange: (count: number) => void;
};
type ManagedInvestment = {
  id: string;
  symbol: string;
  investedUsd: string;
  returnUsd: string;
  totalUsd: string;
  movementDirection: "up" | "down" | "continuous" | "paused";
  movementAmount: string;
  movementIntervalSeconds: number;
  history: { recordedAt: string; balanceUsd: string }[];
  updatedAt: string;
};
type ManagedInvestmentPortfolio = {
  investments: ManagedInvestment[];
  totals: {
    investedUsd: number;
    returnUsd: number;
    totalUsd: number;
  };
};
type AlertKind = "above" | "below" | "up" | "down";
type PriceAlert = {
  id: string;
  symbol: string;
  kind: AlertKind;
  target: number;
  reference: number;
  enabled: boolean;
  createdAt: number;
};
type SavedFilter = {
  id: string;
  name: string;
  minimumPrice: string;
  maximumPrice: string;
  minimumChange: string;
  minimumMarketCap?: string;
  minimumVolume?: string;
  direction: "all" | "gainers" | "losers";
};

const ALERT_STORAGE = "northstar-alerts";
const SCREENER_STORAGE = "northstar-saved-screens";
// Formatters follow the active language, so build them at call time.
// Values can be NaN while live data loads; show a dash instead of "NaN".
const money = {
  format: (value: number) =>
    Number.isFinite(value)
      ? formatUsd(value, {
          minimumFractionDigits: value > 0 && value < 1 ? 4 : 2,
          maximumFractionDigits: value > 0 && value < 1 ? 4 : 2,
        })
      : "—",
};
const compactMoney = {
  format: (value: number) =>
    Number.isFinite(value)
      ? usdFormat({ notation: "compact", maximumFractionDigits: 1 }).format(value)
      : "—",
};
const number = {
  format: (value: number) =>
    numberFormat({ maximumFractionDigits: 4 }).format(value),
};

function readLocal<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function AssetAvatar({
  asset,
  large = false,
}: {
  asset: Asset;
  large?: boolean;
}) {
  return (
    <span
      className={`asset-coin coin-${asset.symbol.toLowerCase()}${large ? " large" : ""}`}
    >
      {asset.short}
    </span>
  );
}

function ScreenHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="workspace-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action && <div className="workspace-heading-action">{action}</div>}
    </div>
  );
}

function Change({ value }: { value: number }) {
  if (!Number.isFinite(value)) return <span>—</span>;
  return (
    <span className={value >= 0 ? "positive-text" : "negative-text"}>
      {value >= 0 ? "+" : "−"}
      {Math.abs(value).toFixed(2)}%
    </span>
  );
}

function MarketsView({
  assets,
  prices,
  watchlist,
  onToggleWatch,
  onOpenAsset,
}: Props) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [direction, setDirection] = useState<"all" | "gainers" | "losers">(
    "all",
  );
  const [sort, setSort] = useState<"marketCap" | "price" | "change" | "volume">(
    "marketCap",
  );
  const [descending, setDescending] = useState(true);
  const [watchOnly, setWatchOnly] = useState(false);
  const rows = useMemo(
    () =>
      assets
        .filter((asset) => {
          const matchesQuery = `${asset.name} ${asset.symbol}`
            .toLowerCase()
            .includes(query.toLowerCase());
          const change = asset.change;
          return (
            matchesQuery &&
            (direction === "all" ||
              (direction === "gainers" ? change >= 0 : change < 0)) &&
            (!watchOnly || watchlist.includes(asset.symbol))
          );
        })
        .sort((left, right) => {
          const values = {
            marketCap: (asset: Asset) => asset.marketCap,
            price: (asset: Asset) => prices[asset.symbol] ?? asset.price,
            change: (asset: Asset) => asset.change,
            volume: (asset: Asset) => asset.volume24h,
          };
          const difference = values[sort](left) - values[sort](right);
          return descending ? -difference : difference;
        }),
    [assets, direction, descending, prices, query, sort, watchOnly, watchlist],
  );
  const sortRows = (column: typeof sort) => {
    if (sort === column) setDescending(!descending);
    else {
      setSort(column);
      setDescending(true);
    }
  };
  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        event.key === "/" &&
        !(target instanceof HTMLInputElement) &&
        !(target instanceof HTMLTextAreaElement)
      ) {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  return (
    <div className="workspace-view">
      <ScreenHeading
        eyebrow={t("markets.eyebrow")}
        title={t("nav.markets")}
        description={t("markets.description")}
        action={
          <button
            className={
              watchOnly ? "button button-primary" : "button button-subtle"
            }
            onClick={() => setWatchOnly(!watchOnly)}
          >
            <Bookmark size={14} />{" "}
            {watchOnly ? t("markets.watchlistOnly") : t("markets.myWatchlist")}
          </button>
        }
      />
      <div className="workspace-stat-row">
        <div className="panel workspace-stat">
          <span>{t("markets.tracked")}</span>
          <b>{assets.length}</b>
          <small>{t("markets.trackedHint")}</small>
        </div>
        <div className="panel workspace-stat">
          <span>{t("markets.gainers")}</span>
          <b className="positive-text">
            {assets.filter((asset) => asset.change > 0).length}
          </b>
          <small>{t("markets.last24h")}</small>
        </div>
        <div className="panel workspace-stat">
          <span>{t("markets.losers")}</span>
          <b className="negative-text">
            {assets.filter((asset) => asset.change < 0).length}
          </b>
          <small>{t("markets.last24h")}</small>
        </div>
        <div className="panel workspace-stat">
          <span>{t("markets.trackedVolume")}</span>
          <b>
            {compactMoney.format(
              assets.reduce((sum, asset) => sum + asset.volume24h, 0),
            )}
          </b>
          <small>{t("markets.trackedVolumeHint")}</small>
        </div>
      </div>
      <section className="panel data-panel">
        <div className="data-toolbar">
          <div
            className="data-filter-pills"
            role="group"
            aria-label={t("markets.filter")}
          >
            {(
              [
                ["all", t("markets.allAssets")],
                ["gainers", t("markets.gainers")],
                ["losers", t("markets.losers")],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                className={
                  direction === value ? "filter-pill active" : "filter-pill"
                }
                onClick={() => setDirection(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="table-search">
            <Search size={15} />
            <input
              ref={searchInputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("markets.findPlaceholder")}
              aria-label={t("markets.find")}
            />
            <kbd>/</kbd>
          </label>
        </div>
        <div className="table-scroll">
          <table className="market-table markets-directory-table">
            <thead>
              <tr>
                <th className="star-column">
                  <span className="sr-only">{t("watchlist.title")}</span>
                </th>
                <th>{t("watchlist.asset")}</th>
                <th>
                  <button onClick={() => sortRows("price")}>
                    {t("table.price")}{" "}
                    <SortMark
                      active={sort === "price"}
                      descending={descending}
                    />
                  </button>
                </th>
                <th>
                  <button onClick={() => sortRows("change")}>
                    {t("watchlist.change24h")}{" "}
                    <SortMark
                      active={sort === "change"}
                      descending={descending}
                    />
                  </button>
                </th>
                <th>
                  <button onClick={() => sortRows("marketCap")}>
                    {t("asset.marketCap")}{" "}
                    <SortMark
                      active={sort === "marketCap"}
                      descending={descending}
                    />
                  </button>
                </th>
                <th>
                  <button onClick={() => sortRows("volume")}>
                    {t("asset.volume")}{" "}
                    <SortMark
                      active={sort === "volume"}
                      descending={descending}
                    />
                  </button>
                </th>
                <th>{t("table.trend")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((asset, index) => {
                const current = prices[asset.symbol] ?? asset.price;
                const cap = asset.marketCap * (current / asset.price);
                return (
                  <tr key={asset.symbol}>
                    <td className="star-column">
                      <button
                        className={
                          watchlist.includes(asset.symbol)
                            ? "table-star saved"
                            : "table-star"
                        }
                        aria-label={
                          watchlist.includes(asset.symbol)
                            ? t("watchlist.removeLabel", { symbol: asset.symbol })
                            : t("watchlist.addLabel", { symbol: asset.symbol })
                        }
                        onClick={() => onToggleWatch(asset.symbol)}
                      >
                        <Star
                          size={15}
                          fill={
                            watchlist.includes(asset.symbol)
                              ? "currentColor"
                              : "none"
                          }
                        />
                      </button>
                    </td>
                    <td>
                      <button
                        className="table-asset"
                        onClick={() => onOpenAsset(asset.symbol)}
                      >
                        <AssetAvatar asset={asset} />
                        <span>
                          <b>{asset.name}</b>
                          <small>
                            {asset.symbol} <i>·</i> USD
                          </small>
                        </span>
                      </button>
                    </td>
                    <td className="numeric-cell">{money.format(current)}</td>
                    <td className="numeric-cell">
                      <Change value={asset.change} />
                    </td>
                    <td className="numeric-cell">{compactMoney.format(cap)}</td>
                    <td className="numeric-cell">
                      {compactMoney.format(asset.volume24h)}
                    </td>
                    <td>
                      <Sparkline
                        values={asset.sparkline}
                        className="market-sparkline"
                        label={
                          asset.change >= 0 ? t("table.trendUp") : t("table.trendDown")
                        }
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && (
          <div className="table-empty">
            <Search size={19} />
            <b>{t("markets.emptyTitle")}</b>
            <span>{t("markets.emptyText")}</span>
            <button
              className="text-button"
              onClick={() => {
                setQuery("");
                setDirection("all");
                setWatchOnly(false);
              }}
            >
              {t("markets.clearFilters")}
            </button>
          </div>
        )}
        <div className="table-footnote">
          <span>
            <span className="source-dot" /> {t("markets.source")}
          </span>
          <span>
            {t("markets.showing", { shown: rows.length, count: assets.length })}
          </span>
        </div>
      </section>
    </div>
  );
}

function SortMark({
  active,
  descending,
}: {
  active: boolean;
  descending: boolean;
}) {
  return active ? (
    descending ? (
      <ArrowDown size={12} />
    ) : (
      <ArrowUp size={12} />
    )
  ) : (
    <ChevronDown size={12} />
  );
}

const PORTFOLIO_ERROR_CODES = [
  "authentication_required",
  "investment_service_unavailable",
  "investment_portfolio_unavailable",
  "investment_chart_migration_required",
] as const;

function portfolioErrors(): Record<string, string> {
  return Object.fromEntries(
    PORTFOLIO_ERROR_CODES.map((code) => [
      code,
      i18n.t(`portfolio.errors.${code}`),
    ]),
  );
}

const PORTFOLIO_PERIODS = ["1W", "1M", "3M", "1Y", "ALL"] as const;
type PortfolioPeriod = (typeof PORTFOLIO_PERIODS)[number];
const PERIOD_TIMEFRAMES: Record<PortfolioPeriod, Timeframe> = {
  "1W": "1W",
  "1M": "1M",
  "3M": "3M",
  "1Y": "1Y",
  ALL: "5Y",
};

/** What the tracked holdings would have been worth over the period. */
function useHoldingsPerformance(
  holdings: Holding[],
  period: PortfolioPeriod,
) {
  const symbols = [...new Set(holdings.map((holding) => holding.symbol))].join(",");
  const [state, setState] = useState<{
    key: string;
    series: Record<string, Candle[]>;
    error: boolean;
  }>({ key: "", series: {}, error: false });
  const key = `${symbols}:${period}`;
  useEffect(() => {
    if (!symbols) return;
    let active = true;
    Promise.all(
      symbols.split(",").map((symbol) =>
        fetchCandles(symbol, PERIOD_TIMEFRAMES[period]).then(
          (candles) => [symbol, candles] as const,
        ),
      ),
    )
      .then((rows) => active && setState({ key, series: Object.fromEntries(rows), error: false }))
      .catch(() => active && setState({ key, series: {}, error: true }));
    return () => {
      active = false;
    };
  }, [key, symbols, period]);
  const candles = useMemo<Candle[]>(() => {
    if (state.key !== key) return [];
    return holdingsHistory(holdings, state.series).map((point) => ({
      time: point.time,
      open: point.value,
      high: point.value,
      low: point.value,
      close: point.value,
      volume: 0,
    }));
  }, [holdings, key, state]);
  return {
    candles,
    loading: Boolean(symbols) && state.key !== key,
    error: state.key === key && state.error,
  };
}

function PortfolioView({ assets, prices }: Props) {
  const { t } = useTranslation();
  const { user, isLoading: authLoading } = useAuth();
  const [managedPortfolio, setManagedPortfolio] =
    useState<ManagedInvestmentPortfolio | null>(null);
  const [managedLoading, setManagedLoading] = useState(false);
  const [managedError, setManagedError] = useState("");
  const [managedRevision, setManagedRevision] = useState(0);
  const { deposits: myDeposits } = useMyDeposits();
  const confirmedTransferCount = myDeposits.filter(
    (deposit) => deposit.status === "confirmed",
  ).length;
  const lastConfirmedCount = useRef<number | null>(null);
  // Reload investments when an admin confirms one of the user's transfers.
  useEffect(() => {
    if (
      lastConfirmedCount.current !== null &&
      confirmedTransferCount > lastConfirmedCount.current
    ) {
      setManagedRevision((revision) => revision + 1);
    }
    lastConfirmedCount.current = confirmedTransferCount;
  }, [confirmedTransferCount]);
  const manualManagedRefresh = useRef(false);
  const [holdings, setHoldings] = useState<Holding[]>(readHoldings);
  const [newSymbol, setNewSymbol] = useState("BTC");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ quantity: "", averageCost: "" });
  const [period, setPeriod] = useState<PortfolioPeriod>("1M");
  const performance = useHoldingsPerformance(holdings, period);
  useEffect(() => {
    if (!user) {
      setManagedPortfolio(null);
      setManagedError("");
      setManagedLoading(false);
      return;
    }
    let active = true;
    const refreshPortfolio = async (showLoading: boolean) => {
      if (showLoading) setManagedLoading(true);
      try {
        const result = await authorizedFetch<ManagedInvestmentPortfolio>(
          "/api/investments/mine",
          {},
          portfolioErrors(),
        );
        if (active) {
          setManagedPortfolio(result);
          setManagedError("");
          if (showLoading && manualManagedRefresh.current) {
            toast.success(i18n.t("portfolio.updated"));
          }
        }
      } catch (requestError) {
        if (active) {
          setManagedError(
            requestError instanceof Error
              ? requestError.message
              : i18n.t("portfolio.loadFailed"),
          );
        }
      } finally {
        if (active && showLoading) {
          manualManagedRefresh.current = false;
          setManagedLoading(false);
        }
      }
    };
    void refreshPortfolio(true);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refreshPortfolio(false);
      }
    }, 10_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [managedRevision, user]);
  useEffect(
    () => localStorage.setItem(HOLDINGS_STORAGE, JSON.stringify(holdings)),
    [holdings],
  );
  const rows = holdings
    .map((holding) => {
      const asset =
        assets.find((item) => item.symbol === holding.symbol) ?? assets[0];
      const current = prices[holding.symbol] ?? asset.price;
      const value = holding.quantity * current;
      const cost = holding.quantity * holding.averageCost;
      return {
        ...holding,
        asset,
        current,
        value,
        cost,
        pnl: value - cost,
        pnlPercent: cost ? ((value - cost) / cost) * 100 : 0,
      };
    })
    .sort((a, b) => b.value - a.value);
  const totalValue = rows.reduce((sum, holding) => sum + holding.value, 0);
  const totalCost = rows.reduce((sum, holding) => sum + holding.cost, 0);
  const totalPnl = totalValue - totalCost;
  const pnlPercent = totalCost ? (totalPnl / totalCost) * 100 : 0;
  const addHolding = () => {
    const existing = holdings.find((holding) => holding.symbol === newSymbol);
    if (existing) {
      setEditing(existing.symbol);
      setDraft({
        quantity: String(existing.quantity),
        averageCost: String(existing.averageCost),
      });
      return;
    }
    const asset = assets.find((item) => item.symbol === newSymbol) ?? assets[0];
    setHoldings((items) => [
      ...items,
      {
        id: `holding-${newSymbol.toLowerCase()}-${Date.now()}`,
        symbol: newSymbol,
        quantity: 1,
        averageCost: prices[newSymbol] ?? asset.price,
      },
    ]);
    setEditing(newSymbol);
    setDraft({
      quantity: "1",
      averageCost: String(prices[newSymbol] ?? asset.price),
    });
  };
  const startEdit = (symbol: string, quantity: number, averageCost: number) => {
    setEditing(symbol);
    setDraft({ quantity: String(quantity), averageCost: String(averageCost) });
  };
  const saveEdit = (symbol: string) => {
    const quantity = Number(draft.quantity);
    const averageCost = Number(draft.averageCost);
    if (
      !Number.isFinite(quantity) ||
      !Number.isFinite(averageCost) ||
      quantity <= 0 ||
      averageCost <= 0
    )
      return;
    setHoldings((items) =>
      items.map((item) =>
        item.symbol === symbol ? { ...item, quantity, averageCost } : item,
      ),
    );
    setEditing(null);
  };
  const removeHolding = (symbol: string) => {
    if (!window.confirm(t("portfolio.confirmRemove", { symbol }))) return;
    setHoldings((items) => items.filter((item) => item.symbol !== symbol));
  };
  const circumference = 2 * Math.PI * 48;
  let consumed = 0;
  return (
    <div className="workspace-view">
      <ScreenHeading
        eyebrow={t("portfolio.eyebrow")}
        title={t("nav.portfolio")}
        description={t("portfolio.description")}
        action={
          <div className="portfolio-heading-actions">
            <span className="local-privacy-label">
              <Bookmark size={13} /> {t("portfolio.localLabel")}
            </span>
            <button
              className="button button-subtle"
              disabled={holdings.length === 0}
              onClick={() => {
                if (
                  window.confirm(
                    t("portfolio.confirmClear"),
                  )
                ) {
                  setHoldings([]);
                  setEditing(null);
                }
              }}
            >
              <Trash2 size={13} /> {t("portfolio.clearTracker")}
            </button>
          </div>
        }
      />
      <section className="panel managed-investments-panel">
        <div className="data-panel-heading">
          <div>
            <span className="eyebrow">{t("portfolio.accountEyebrow")}</span>
            <h2>{t("home.preview.title")}</h2>
          </div>
          {user && (
            <div className="managed-investments-actions">
              <Link className="button button-primary button-small" to="/send">
                <Plus size={13} /> {t("home.footer.invest")}
              </Link>
              <Link
                className="button button-subtle button-small"
                to="/withdraw"
              >
                <ArrowUpFromLine size={13} /> {t("nav.withdraw")}
              </Link>
              <button
                className="button button-subtle button-small"
                disabled={managedLoading}
                onClick={() => {
                  manualManagedRefresh.current = true;
                  setManagedRevision((revision) => revision + 1);
                }}
              >
                {managedLoading ? (
                  <LoaderCircle className="admin-spinner" size={13} />
                ) : (
                  <RefreshCw size={13} />
                )}
                {t("common.refresh")}
              </button>
            </div>
          )}
        </div>
        <p className="managed-investments-description">
          {t("portfolio.managedDescription")}
        </p>
        {user && <PendingTransfers deposits={myDeposits} />}
        {authLoading || managedLoading ? (
          <div className="managed-investments-message" role="status">
            <LoaderCircle className="admin-spinner" size={16} />
            {t("portfolio.loading")}
          </div>
        ) : !user ? (
          <div className="managed-investments-message">
            <span>{t("portfolio.signInPrompt")}</span>
            <Link className="button button-primary button-small" to="/account">
              {t("common.signIn")}
            </Link>
          </div>
        ) : managedError ? (
          <div className="managed-investments-message error" role="alert">
            <CircleAlert size={15} /> {managedError}
          </div>
        ) : managedPortfolio?.investments.length ? (
          <>
            <div className="managed-investment-totals">
              <div>
                <span>{t("portfolio.invested")}</span>
                <b>{money.format(managedPortfolio.totals.investedUsd)}</b>
              </div>
              <div>
                <span>{t("portfolio.returnAssigned")}</span>
                <b
                  className={
                    managedPortfolio.totals.returnUsd >= 0
                      ? "positive-text"
                      : "negative-text"
                  }
                >
                  {managedPortfolio.totals.returnUsd >= 0 ? "+" : "−"}
                  {money.format(Math.abs(managedPortfolio.totals.returnUsd))}
                </b>
              </div>
              <div>
                <span>{t("portfolio.currentValue")}</span>
                <b>{money.format(managedPortfolio.totals.totalUsd)}</b>
              </div>
            </div>
            <InvestmentPriceChart investments={managedPortfolio.investments} />
            <div className="table-scroll">
              <table className="market-table managed-investments-table">
                <thead>
                  <tr>
                    <th>{t("watchlist.asset")}</th>
                    <th>{t("portfolio.investedUsd")}</th>
                    <th>{t("portfolio.returnUsd")}</th>
                    <th>{t("portfolio.totalUsd")}</th>
                    <th>{t("portfolio.lastUpdated")}</th>
                  </tr>
                </thead>
                <tbody>
                  {managedPortfolio.investments.map((investment) => (
                    <tr key={investment.id}>
                      <td>
                        <b>{investment.symbol}</b>
                      </td>
                      <td>{money.format(Number(investment.investedUsd))}</td>
                      <td
                        className={
                          Number(investment.returnUsd) >= 0
                            ? "positive-text"
                            : "negative-text"
                        }
                      >
                        {Number(investment.returnUsd) >= 0 ? "+" : "−"}
                        {money.format(Math.abs(Number(investment.returnUsd)))}
                      </td>
                      <td>
                        <b>{money.format(Number(investment.totalUsd))}</b>
                      </td>
                      <td>
                        {dateFormat({ dateStyle: "medium" }).format(
                          new Date(investment.updatedAt),
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="managed-investments-message">
            <span>
              {t("portfolio.empty")}
            </span>
            <Link className="button button-primary button-small" to="/send">
              <Plus size={13} /> {t("home.footer.invest")}
            </Link>
          </div>
        )}
      </section>
      <div className="portfolio-overview-grid">
        <section className="panel portfolio-value-card">
          <span className="eyebrow">{t("portfolio.totalValue")}</span>
          <div className="portfolio-big-value">{money.format(totalValue)}</div>
          <div
            className={
              totalPnl >= 0
                ? "portfolio-pnl positive-text"
                : "portfolio-pnl negative-text"
            }
          >
            {totalPnl >= 0 ? (
              <ArrowUpRight size={15} />
            ) : (
              <ArrowDownRight size={15} />
            )}
            {money.format(Math.abs(totalPnl))} ({pnlPercent >= 0 ? "+" : "−"}
            {Math.abs(pnlPercent).toFixed(2)}%) <span>{t("portfolio.allTime")}</span>
          </div>
          <MarketChart
            candles={performance.candles}
            loading={performance.loading}
            error={performance.error}
            label={t("nav.portfolio")}
            className="performance-chart"
          />
          <div className="performance-periods" role="group" aria-label={t("chart.timeframe")}>
            {PORTFOLIO_PERIODS.map((value) => (
              <button
                key={value}
                className={period === value ? "active" : ""}
                aria-pressed={period === value}
                onClick={() => setPeriod(value)}
              >
                {value}
              </button>
            ))}
          </div>
          <span className="portfolio-illustrative-note">
            {t("portfolio.illustrative")}
          </span>
        </section>
        <section className="panel allocation-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">{t("portfolio.byAsset")}</span>
              <h2>{t("portfolio.allocation")}</h2>
            </div>
          </div>
          {rows.length ? (
            <>
              <div className="allocation-content">
                <svg
                  className="allocation-donut"
                  viewBox="0 0 120 120"
                  role="img"
                  aria-label={t("portfolio.allocationLabel")}
                >
                  <circle
                    cx="60"
                    cy="60"
                    r="48"
                    fill="none"
                    stroke="hsl(var(--secondary))"
                    strokeWidth="12"
                  />
                  {rows.map((holding, index) => {
                    const share = totalValue ? holding.value / totalValue : 0;
                    const segment = share * circumference;
                    const offset = -consumed;
                    consumed += segment;
                    return (
                      <circle
                        key={holding.symbol}
                        cx="60"
                        cy="60"
                        r="48"
                        fill="none"
                        stroke={`var(--allocation-${index % 5})`}
                        strokeWidth="12"
                        strokeDasharray={`${segment} ${circumference - segment}`}
                        strokeDashoffset={offset}
                        transform="rotate(-90 60 60)"
                      />
                    );
                  })}
                  <text
                    x="60"
                    y="57"
                    textAnchor="middle"
                    className="donut-total-label"
                  >
                    {compactMoney.format(totalValue)}
                  </text>
                  <text
                    x="60"
                    y="70"
                    textAnchor="middle"
                    className="donut-caption"
                  >
                    {t("portfolio.totalValueShort")}
                  </text>
                </svg>
                <div className="allocation-legend">
                  {rows.map((holding, index) => (
                    <div key={holding.symbol}>
                      <i
                        className={`allocation-dot allocation-dot-${index % 5}`}
                      />
                      <span>{holding.asset.name}</span>
                      <b>
                        {totalValue
                          ? ((holding.value / totalValue) * 100).toFixed(1)
                          : "0.0"}
                        %
                      </b>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="table-empty">
              <Bookmark size={18} />
              <b>{t("portfolio.noHoldings")}</b>
              <span>{t("portfolio.noHoldingsText")}</span>
            </div>
          )}
          <div className="allocation-total-row">
            <span>{t("portfolio.invested")}</span>
            <b>{money.format(totalCost)}</b>
          </div>
        </section>
      </div>
      <section className="panel data-panel holdings-panel">
        <div className="data-panel-heading">
          <div>
            <span className="eyebrow">{t("portfolio.positions")}</span>
            <h2>
              {t("portfolio.holdings")}{" "}
              <span className="watch-count">{rows.length}</span>
            </h2>
          </div>
          <div className="add-holding-control">
            <label className="sr-only" htmlFor="new-holding">
              {t("portfolio.assetToAdd")}
            </label>
            <select
              id="new-holding"
              value={newSymbol}
              onChange={(event) => setNewSymbol(event.target.value)}
            >
              {assets.map((asset) => (
                <option key={asset.symbol} value={asset.symbol}>
                  {asset.name} ({asset.symbol})
                </option>
              ))}
            </select>
            <button className="button button-primary" onClick={addHolding}>
              <Plus size={14} /> {t("portfolio.addAsset")}
            </button>
          </div>
        </div>
        <div className="table-scroll">
          <table className="market-table holdings-table">
            <thead>
              <tr>
                <th>{t("watchlist.asset")}</th>
                <th>{t("portfolio.quantity")}</th>
                <th>{t("portfolio.avgCost")}</th>
                <th>{t("portfolio.currentPrice")}</th>
                <th>{t("portfolio.marketValue")}</th>
                <th>{t("portfolio.pnl")}</th>
                <th aria-label={t("table.actions")} />
              </tr>
            </thead>
            <tbody>
              {rows.map((holding) => (
                <tr key={holding.id}>
                  <td>
                    <div className="table-asset">
                      <AssetAvatar asset={holding.asset} />
                      <span>
                        <b>{holding.asset.name}</b>
                        <small>{holding.symbol}</small>
                      </span>
                    </div>
                  </td>
                  <td>
                    {editing === holding.symbol ? (
                      <input
                        className="holding-edit-input"
                        type="number"
                        min="0.000001"
                        step="any"
                        aria-label={t("portfolio.quantityLabel", { symbol: holding.symbol })}
                        value={draft.quantity}
                        onChange={(event) =>
                          setDraft((value) => ({
                            ...value,
                            quantity: event.target.value,
                          }))
                        }
                      />
                    ) : (
                      number.format(holding.quantity)
                    )}
                  </td>
                  <td>
                    {editing === holding.symbol ? (
                      <input
                        className="holding-edit-input"
                        type="number"
                        min="0.01"
                        step="any"
                        aria-label={t("portfolio.avgCostLabel", { symbol: holding.symbol })}
                        value={draft.averageCost}
                        onChange={(event) =>
                          setDraft((value) => ({
                            ...value,
                            averageCost: event.target.value,
                          }))
                        }
                      />
                    ) : (
                      money.format(holding.averageCost)
                    )}
                  </td>
                  <td>{money.format(holding.current)}</td>
                  <td>
                    <b>{money.format(holding.value)}</b>
                  </td>
                  <td>
                    <div className="pnl-cell">
                      <Change value={holding.pnlPercent} />
                      <small
                        className={
                          holding.pnl >= 0 ? "positive-text" : "negative-text"
                        }
                      >
                        {holding.pnl >= 0 ? "+" : "−"}
                        {money.format(Math.abs(holding.pnl))}
                      </small>
                    </div>
                  </td>
                  <td>
                    <div className="row-actions">
                      {editing === holding.symbol ? (
                        <button
                          aria-label={t("portfolio.saveLabel", { symbol: holding.symbol })}
                          onClick={() => saveEdit(holding.symbol)}
                        >
                          <Check size={14} />
                        </button>
                      ) : (
                        <button
                          aria-label={t("portfolio.editLabel", { symbol: holding.symbol })}
                          onClick={() =>
                            startEdit(
                              holding.symbol,
                              holding.quantity,
                              holding.averageCost,
                            )
                          }
                        >
                          <Edit3 size={14} />
                        </button>
                      )}
                      <button
                        aria-label={t("portfolio.removeLabel", { symbol: holding.symbol })}
                        onClick={() => removeHolding(holding.symbol)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && (
          <div className="table-empty compact-empty">
            <Bookmark size={18} />
            <b>{t("portfolio.readyTitle")}</b>
            <span>{t("portfolio.readyText")}</span>
          </div>
        )}
        <div className="table-footnote">
          <span>{t("portfolio.storedLocally")}</span>
          <span>
            <span className="source-dot" /> {t("portfolio.livePrices")}
          </span>
        </div>
      </section>
    </div>
  );
}

function didAlertTrigger(
  alert: PriceAlert,
  assets: Asset[],
  prices: Record<string, number>,
) {
  const price =
    prices[alert.symbol] ??
    assets.find((asset) => asset.symbol === alert.symbol)?.price ??
    alert.reference;
  if (alert.kind === "above") return price >= alert.target;
  if (alert.kind === "below") return price <= alert.target;
  const move = (price / alert.reference - 1) * 100;
  return alert.kind === "up" ? move >= alert.target : move <= -alert.target;
}

function AlertsView({ assets, prices, onAlertCountChange }: Props) {
  const { t } = useTranslation();
  const [alerts, setAlerts] = useState<PriceAlert[]>(() =>
    readLocal(ALERT_STORAGE, [
      {
        id: "alert-btc-above",
        symbol: "BTC",
        kind: "above",
        target: 70000,
        reference: 67432.18,
        enabled: true,
        createdAt: Date.now() - 120000,
      },
      {
        id: "alert-eth-below",
        symbol: "ETH",
        kind: "below",
        target: 3200,
        reference: 3521.64,
        enabled: true,
        createdAt: Date.now() - 60000,
      },
    ]),
  );
  const [symbol, setSymbol] = useState("BTC");
  const [kind, setKind] = useState<AlertKind>("above");
  const [target, setTarget] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showTriggered, setShowTriggered] = useState(false);
  useEffect(() => {
    localStorage.setItem(ALERT_STORAGE, JSON.stringify(alerts));
    window.dispatchEvent(
      new CustomEvent("northstar:alerts-updated", { detail: alerts }),
    );
  }, [alerts]);
  const current =
    prices[symbol] ??
    assets.find((asset) => asset.symbol === symbol)?.price ??
    0;
  const sorted = [...alerts].sort((a, b) => b.createdAt - a.createdAt);
  useEffect(
    () =>
      onAlertCountChange(
        alerts.filter(
          (alert) => alert.enabled && !didAlertTrigger(alert, assets, prices),
        ).length,
      ),
    [alerts, assets, onAlertCountChange, prices],
  );
  const saveAlert = () => {
    const value = Number(target);
    if (!Number.isFinite(value) || value <= 0) return;
    if (editingId) {
      setAlerts((items) =>
        items.map((item) =>
          item.id === editingId
            ? { ...item, symbol, kind, target: value, reference: current }
            : item,
        ),
      );
      setEditingId(null);
    } else {
      setAlerts((items) => [
        {
          id: `alert-${Date.now()}`,
          symbol,
          kind,
          target: value,
          reference: current,
          enabled: true,
          createdAt: Date.now(),
        },
        ...items,
      ]);
    }
    setTarget("");
  };
  const editAlert = (alert: PriceAlert) => {
    setSymbol(alert.symbol);
    setKind(alert.kind);
    setTarget(String(alert.target));
    setEditingId(alert.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const removeAlert = (alert: PriceAlert) => {
    if (!window.confirm(t("alerts.confirmDelete", { symbol: alert.symbol })))
      return;
    setAlerts((items) => items.filter((item) => item.id !== alert.id));
    if (editingId === alert.id) setEditingId(null);
  };
  const clearAll = () => {
    if (!window.confirm(t("alerts.confirmClear")))
      return;
    setAlerts([]);
    setEditingId(null);
  };
  const activeCount = alerts.filter(
    (alert) => alert.enabled && !didAlertTrigger(alert, assets, prices),
  ).length;
  const triggered = alerts.filter((alert) =>
    didAlertTrigger(alert, assets, prices),
  );
  const visibleAlerts = sorted.filter(
    (alert) => showTriggered || !didAlertTrigger(alert, assets, prices),
  );
  const kindLabel: Record<AlertKind, string> = {
    above: t("alerts.kind.above"),
    below: t("alerts.kind.below"),
    up: t("alerts.kind.up"),
    down: t("alerts.kind.down"),
  };

  return (
    <div className="workspace-view">
      <ScreenHeading
        eyebrow={t("alerts.eyebrow")}
        title={t("alerts.title")}
        description={t("alerts.description")}
        action={
          alerts.length > 0 && (
            <button className="button button-subtle" onClick={clearAll}>
              <Trash2 size={14} /> {t("alerts.clearAll")}
            </button>
          )
        }
      />
      <div className="alert-summary-grid">
        <div className="panel alert-summary">
          <div className="alert-summary-icon">
            <Bell size={17} />
          </div>
          <div>
            <span>{t("alerts.active")}</span>
            <b>{activeCount}</b>
          </div>
          <small>{t("alerts.activeHint")}</small>
        </div>
        <div className="panel alert-summary">
          <div className="alert-summary-icon triggered-icon">
            <Activity size={17} />
          </div>
          <div>
            <span>{t("alerts.reached")}</span>
            <b>{triggered.length}</b>
          </div>
          <small>{t("alerts.reachedHint")}</small>
        </div>
        <div className="panel alert-summary">
          <div className="alert-summary-icon">
            <Clock3 size={17} />
          </div>
          <div>
            <span>{t("alerts.delivery")}</span>
            <b>{t("alerts.inApp")}</b>
          </div>
          <small>{t("alerts.deliveryHint")}</small>
        </div>
      </div>
      <div className="alerts-layout">
        <section className="panel alert-form-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">{t("alerts.newEyebrow")}</span>
              <h2>{editingId ? t("alerts.editTitle") : t("alerts.createTitle")}</h2>
            </div>
            <div className="alert-form-icon">
              <Bell size={17} />
            </div>
          </div>
          <p className="form-intro">
            {t("alerts.formIntro")}
          </p>
          <label className="form-field">
            <span>{t("watchlist.asset")}</span>
            <select
              value={symbol}
              onChange={(event) => setSymbol(event.target.value)}
            >
              {assets.map((asset) => (
                <option key={asset.symbol} value={asset.symbol}>
                  {asset.name} ({asset.symbol})
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>{t("alerts.condition")}</span>
            <select
              value={kind}
              onChange={(event) => setKind(event.target.value as AlertKind)}
            >
              <option value="above">{kindLabel.above}</option>
              <option value="below">{kindLabel.below}</option>
              <option value="up">{kindLabel.up}</option>
              <option value="down">{kindLabel.down}</option>
            </select>
          </label>
          <label className="form-field">
            <span>
              {kind === "above" || kind === "below"
                ? t("alerts.targetPrice")
                : t("alerts.changePercent")}
            </span>
            <div className="input-with-affix">
              <input
                type="number"
                min="0.0001"
                step="any"
                value={target}
                onChange={(event) => setTarget(event.target.value)}
                placeholder={
                  kind === "above"
                    ? (current * 1.05).toFixed(2)
                    : kind === "below"
                      ? (current * 0.95).toFixed(2)
                      : "5"
                }
              />
              <span>{kind === "above" || kind === "below" ? "USD" : "%"}</span>
            </div>
          </label>
          <div className="current-price-hint">
            <span>{t("alerts.currentPrice", { symbol })}</span>
            <b>{money.format(current)}</b>
          </div>
          <button
            className="button button-primary create-alert-button"
            disabled={!target || Number(target) <= 0}
            onClick={saveAlert}
          >
            {editingId ? <Check size={15} /> : <Plus size={15} />}
            {editingId ? t("common.saveChanges") : t("alerts.create")}
          </button>
          {editingId && (
            <button
              className="cancel-edit"
              onClick={() => {
                setEditingId(null);
                setTarget("");
              }}
            >
              {t("alerts.cancelEdit")}
            </button>
          )}
          <div className="alert-privacy-note">
            <CircleHelp size={14} />
            <span>
              {t("alerts.privacy")}
            </span>
          </div>
        </section>
        <section className="panel alert-list-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">{t("alerts.rulesEyebrow")}</span>
              <h2>
                {t("nav.alerts")}{" "}
                <span className="watch-count">{alerts.length}</span>
              </h2>
            </div>
            <button
              className={showTriggered ? "filter-pill active" : "filter-pill"}
              onClick={() => setShowTriggered(!showTriggered)}
            >
              {t("alerts.showReached")}
            </button>
          </div>
          {visibleAlerts.length ? (
            <div className="alert-list">
              {visibleAlerts.map((alert) => {
                const asset =
                  assets.find((item) => item.symbol === alert.symbol) ??
                  assets[0];
                const reached = didAlertTrigger(alert, assets, prices);
                const currentPrice = prices[alert.symbol] ?? asset.price;
                const valueLabel =
                  alert.kind === "above" || alert.kind === "below"
                    ? money.format(alert.target)
                    : `${alert.kind === "up" ? "+" : "−"}${alert.target}%`;
                return (
                  <article
                    className={`alert-row ${reached ? "reached" : ""}`}
                    key={alert.id}
                  >
                    <AssetAvatar asset={asset} />
                    <div className="alert-rule">
                      <div>
                        <b>{asset.name}</b>
                        <span
                          className={
                            reached
                              ? "alert-state reached-state"
                              : alert.enabled
                                ? "alert-state"
                                : "alert-state paused-state"
                          }
                        >
                          {reached
                            ? t("alerts.state.reached")
                            : alert.enabled
                              ? t("alerts.state.active")
                              : t("alerts.state.paused")}
                        </span>
                      </div>
                      <p>
                        {kindLabel[alert.kind]} <strong>{valueLabel}</strong>
                      </p>
                      <small>
                        {t("alerts.currentPriceValue", {
                          price: money.format(currentPrice),
                        })}
                      </small>
                    </div>
                    <div className="alert-actions">
                      <button
                        className={
                          alert.enabled
                            ? "alert-enable enabled"
                            : "alert-enable"
                        }
                        role="switch"
                        aria-checked={alert.enabled}
                        aria-label={
                          alert.enabled
                            ? t("alerts.pauseLabel", { symbol: asset.symbol })
                            : t("alerts.enableLabel", { symbol: asset.symbol })
                        }
                        onClick={() =>
                          setAlerts((items) =>
                            items.map((item) =>
                              item.id === alert.id
                                ? { ...item, enabled: !item.enabled }
                                : item,
                            ),
                          )
                        }
                      >
                        <i />
                      </button>
                      <button
                        aria-label={t("alerts.editLabel", { symbol: asset.symbol })}
                        onClick={() => editAlert(alert)}
                      >
                        <Edit3 size={14} />
                      </button>
                      <button
                        aria-label={t("alerts.deleteLabel", { symbol: asset.symbol })}
                        onClick={() => removeAlert(alert)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="alert-empty">
              <div className="alert-empty-icon">
                <Bell size={19} />
              </div>
              <b>
                {showTriggered ? t("alerts.noneReached") : t("alerts.none")}
              </b>
              <span>
                {showTriggered
                  ? t("alerts.noneReachedText")
                  : t("alerts.noneText")}
              </span>
              <button
                className="text-button"
                onClick={() => setShowTriggered(false)}
              >
                {t("alerts.viewAll")} <ArrowRight size={13} />
              </button>
            </div>
          )}
          <div className="alert-list-footnote">
            <span>
              <span className="source-dot" /> {t("alerts.refreshNote")}
            </span>
            <span>{t("alerts.reachedCount", { count: triggered.length })}</span>
          </div>
        </section>
      </div>
    </div>
  );
}

function ScreenerView({
  assets,
  prices,
  watchlist,
  onToggleWatch,
  onOpenAsset,
}: Props) {
  const { t } = useTranslation();
  const [minimumPrice, setMinimumPrice] = useState("");
  const [maximumPrice, setMaximumPrice] = useState("");
  const [minimumChange, setMinimumChange] = useState("");
  const [minimumMarketCap, setMinimumMarketCap] = useState("");
  const [minimumVolume, setMinimumVolume] = useState("");
  const [direction, setDirection] = useState<SavedFilter["direction"]>("all");
  const [saved, setSaved] = useState<SavedFilter[]>(() =>
    readLocal(SCREENER_STORAGE, []),
  );
  const [filterName, setFilterName] = useState("");
  const [saveOpen, setSaveOpen] = useState(false);
  const [sort, setSort] = useState<"price" | "change" | "volume">("change");
  const [descending, setDescending] = useState(true);
  useEffect(
    () => localStorage.setItem(SCREENER_STORAGE, JSON.stringify(saved)),
    [saved],
  );
  const rows = assets
    .filter((asset) => {
      const price = prices[asset.symbol] ?? asset.price;
      return (
        (!minimumPrice || price >= Number(minimumPrice)) &&
        (!maximumPrice || price <= Number(maximumPrice)) &&
        (!minimumChange || Math.abs(asset.change) >= Number(minimumChange)) &&
        (!minimumMarketCap || asset.marketCap >= Number(minimumMarketCap)) &&
        (!minimumVolume || asset.volume24h >= Number(minimumVolume)) &&
        (direction === "all" ||
          (direction === "gainers" ? asset.change > 0 : asset.change < 0))
      );
    })
    .sort((left, right) => {
      const values = {
        price: (asset: Asset) => prices[asset.symbol] ?? asset.price,
        change: (asset: Asset) => asset.change,
        volume: (asset: Asset) => asset.volume24h,
      };
      const difference = values[sort](left) - values[sort](right);
      return descending ? -difference : difference;
    });
  const clear = () => {
    setMinimumPrice("");
    setMaximumPrice("");
    setMinimumChange("");
    setMinimumMarketCap("");
    setMinimumVolume("");
    setDirection("all");
  };
  const saveFilter = () => {
    if (!filterName.trim()) return;
    setSaved((items) => [
      {
        id: `filter-${Date.now()}`,
        name: filterName.trim(),
        minimumPrice,
        maximumPrice,
        minimumChange,
        minimumMarketCap,
        minimumVolume,
        direction,
      },
      ...items,
    ]);
    setFilterName("");
    setSaveOpen(false);
  };
  const applyFilter = (filter: SavedFilter) => {
    setMinimumPrice(filter.minimumPrice);
    setMaximumPrice(filter.maximumPrice);
    setMinimumChange(filter.minimumChange);
    setMinimumMarketCap(filter.minimumMarketCap ?? "");
    setMinimumVolume(filter.minimumVolume ?? "");
    setDirection(filter.direction);
  };

  return (
    <div className="workspace-view">
      <ScreenHeading
        eyebrow={t("screener.eyebrow")}
        title={t("nav.screener")}
        description={t("screener.description")}
        action={
          <button
            className="button button-subtle"
            onClick={() => setSaveOpen(!saveOpen)}
          >
            <Bookmark size={14} /> {t("screener.save")}
          </button>
        }
      />
      {saveOpen && (
        <section className="panel save-filter-panel">
          <div>
            <span className="eyebrow">{t("screener.saveEyebrow")}</span>
            <b>{t("screener.nameTitle")}</b>
          </div>
          <input
            value={filterName}
            onChange={(event) => setFilterName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") saveFilter();
            }}
            placeholder={t("screener.namePlaceholder")}
            aria-label={t("screener.nameLabel")}
          />
          <button
            className="button button-primary"
            disabled={!filterName.trim()}
            onClick={saveFilter}
          >
            <Check size={14} /> {t("screener.save")}
          </button>
          <button
            className="icon-button"
            aria-label={t("screener.cancelSave")}
            onClick={() => setSaveOpen(false)}
          >
            <X size={16} />
          </button>
        </section>
      )}
      <div className="screener-layout">
        <section className="panel screener-filters">
          <div className="section-heading">
            <div>
              <span className="eyebrow">{t("screener.filtersEyebrow")}</span>
              <h2>
                <Filter size={15} /> {t("screener.filters")}
              </h2>
            </div>
            <button className="text-button" onClick={clear}>
              {t("screener.reset")}
            </button>
          </div>
          <label className="form-field">
            <span>{t("screener.priceRange")}</span>
            <div className="range-inputs">
              <input
                type="number"
                min="0"
                value={minimumPrice}
                onChange={(event) => setMinimumPrice(event.target.value)}
                placeholder={t("screener.min")}
                aria-label={t("screener.minPrice")}
              />
              <span>{t("screener.to")}</span>
              <input
                type="number"
                min="0"
                value={maximumPrice}
                onChange={(event) => setMaximumPrice(event.target.value)}
                placeholder={t("screener.max")}
                aria-label={t("screener.maxPrice")}
              />
            </div>
          </label>
          <label className="form-field">
            <span>{t("screener.minMove")}</span>
            <div className="input-with-affix">
              <input
                type="number"
                min="0"
                step="0.1"
                value={minimumChange}
                onChange={(event) => setMinimumChange(event.target.value)}
                placeholder={t("screener.any")}
              />
              <span>%</span>
            </div>
          </label>
          <label className="form-field">
            <span>{t("screener.direction")}</span>
            <select
              value={direction}
              onChange={(event) =>
                setDirection(event.target.value as SavedFilter["direction"])
              }
            >
              <option value="all">{t("markets.allAssets")}</option>
              <option value="gainers">{t("screener.gainersOnly")}</option>
              <option value="losers">{t("screener.losersOnly")}</option>
            </select>
          </label>
          <label className="form-field">
            <span>{t("screener.minCap")}</span>
            <input
              type="number"
              min="0"
              value={minimumMarketCap}
              onChange={(event) => setMinimumMarketCap(event.target.value)}
              placeholder={t("screener.any")}
            />
          </label>
          <label className="form-field">
            <span>{t("screener.minVolume")}</span>
            <input
              type="number"
              min="0"
              value={minimumVolume}
              onChange={(event) => setMinimumVolume(event.target.value)}
              placeholder={t("screener.any")}
            />
          </label>
          <div className="filter-result-count">
            <SlidersHorizontal size={14} /> <b>{rows.length}</b>{" "}
            {t("screener.matching", { count: rows.length })}
          </div>
          <div className="saved-screens">
            <div className="saved-screens-heading">
              <b>{t("screener.saved")}</b>
              <span>{saved.length}</span>
            </div>
            {saved.length ? (
              saved.map((filter) => (
                <div className="saved-screen-row" key={filter.id}>
                  <button onClick={() => applyFilter(filter)}>
                    <Bookmark size={13} />
                    <span>{filter.name}</span>
                  </button>
                  <button
                    aria-label={t("screener.deleteLabel", { name: filter.name })}
                    onClick={() => {
                      if (
                        window.confirm(
                          t("screener.confirmDelete", { name: filter.name }),
                        )
                      )
                        setSaved((items) =>
                          items.filter((item) => item.id !== filter.id),
                        );
                    }}
                  >
                    <X size={13} />
                  </button>
                </div>
              ))
            ) : (
              <p className="saved-empty">
                {t("screener.savedEmpty")}
              </p>
            )}
          </div>
        </section>
        <section className="panel data-panel screener-results">
          <div className="data-panel-heading">
            <div>
              <span className="eyebrow">{t("screener.resultsEyebrow")}</span>
              <h2>{t("screener.results")}</h2>
            </div>
            <div className="screener-sort">
              <span>{t("screener.sortBy")}</span>
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as typeof sort)}
              >
                <option value="change">{t("watchlist.change24h")}</option>
                <option value="price">{t("table.price")}</option>
                <option value="volume">{t("asset.volume")}</option>
              </select>
              <button
                className="icon-button small-icon"
                aria-label={
                  descending ? t("screener.sortAscending") : t("screener.sortDescending")
                }
                onClick={() => setDescending(!descending)}
              >
                {descending ? <ArrowDown size={14} /> : <ArrowUp size={14} />}
              </button>
            </div>
          </div>
          <div className="table-scroll">
            <table className="market-table screener-table">
              <thead>
                <tr>
                  <th>{t("watchlist.asset")}</th>
                  <th>{t("table.price")}</th>
                  <th>{t("watchlist.change24h")}</th>
                  <th>{t("asset.volume")}</th>
                  <th>{t("table.action")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((asset) => (
                  <tr key={asset.symbol}>
                    <td>
                      <button
                        className="table-asset"
                        onClick={() => onOpenAsset(asset.symbol)}
                      >
                        <AssetAvatar asset={asset} />
                        <span>
                          <b>{asset.name}</b>
                          <small>{asset.symbol} / USD</small>
                        </span>
                      </button>
                    </td>
                    <td className="numeric-cell">
                      {money.format(prices[asset.symbol] ?? asset.price)}
                    </td>
                    <td className="numeric-cell">
                      <Change value={asset.change} />
                    </td>
                    <td className="numeric-cell">
                      {compactMoney.format(asset.volume24h)}
                    </td>
                    <td>
                      <button
                        className={
                          watchlist.includes(asset.symbol)
                            ? "screener-watch saved"
                            : "screener-watch"
                        }
                        onClick={() => onToggleWatch(asset.symbol)}
                      >
                        {watchlist.includes(asset.symbol) ? (
                          <Check size={13} />
                        ) : (
                          <Plus size={13} />
                        )}
                        {watchlist.includes(asset.symbol)
                          ? t("screener.watching")
                          : t("screener.watch")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length === 0 && (
            <div className="table-empty">
              <Search size={19} />
              <b>{t("screener.emptyTitle")}</b>
              <span>{t("screener.emptyText")}</span>
              <button className="text-button" onClick={clear}>
                {t("screener.resetFilters")}
              </button>
            </div>
          )}
          <div className="table-footnote">
            <span>{t("screener.source")}</span>
            <span>
              {t("screener.count", { shown: rows.length, count: assets.length })}
            </span>
          </div>
        </section>
      </div>
      <div className="screener-note">
        <CircleHelp size={15} />
        <span>
          {t("screener.note")}
        </span>
      </div>
    </div>
  );
}

export default function MarketWorkspace(props: Props) {
  if (props.screen === "Markets") return <MarketsView {...props} />;
  if (props.screen === "Portfolio") return <PortfolioView {...props} />;
  if (props.screen === "Alerts") return <AlertsView {...props} />;
  return <ScreenerView {...props} />;
}

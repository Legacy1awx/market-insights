import { useEffect, useMemo, useRef, useState } from "react";
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
  RefreshCw,
  Search,
  SlidersHorizontal,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

type Asset = {
  symbol: string;
  name: string;
  price: number;
  change: number;
  marketCap: number;
  short: string;
  volume24h: number;
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
type Holding = {
  id: string;
  symbol: string;
  quantity: number;
  averageCost: number;
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

const PORTFOLIO_STORAGE = "northstar-portfolio";
const ALERT_STORAGE = "northstar-alerts";
const SCREENER_STORAGE = "northstar-saved-screens";
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});
const compactMoney = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});
const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 });

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
        eyebrow="MARKET DIRECTORY"
        title="Markets"
        description="Compare the assets moving the digital asset market."
        action={
          <button
            className={
              watchOnly ? "button button-primary" : "button button-subtle"
            }
            onClick={() => setWatchOnly(!watchOnly)}
          >
            <Bookmark size={14} />{" "}
            {watchOnly ? "Watchlist only" : "My watchlist"}
          </button>
        }
      />
      <div className="workspace-stat-row">
        <div className="panel workspace-stat">
          <span>Assets tracked</span>
          <b>{assets.length}</b>
          <small>Across spot markets</small>
        </div>
        <div className="panel workspace-stat">
          <span>Gainers</span>
          <b className="positive-text">
            {assets.filter((asset) => asset.change > 0).length}
          </b>
          <small>In the last 24 hours</small>
        </div>
        <div className="panel workspace-stat">
          <span>Losers</span>
          <b className="negative-text">
            {assets.filter((asset) => asset.change < 0).length}
          </b>
          <small>In the last 24 hours</small>
        </div>
        <div className="panel workspace-stat">
          <span>Tracked volume</span>
          <b>
            {compactMoney.format(
              assets.reduce((sum, asset) => sum + asset.volume24h, 0),
            )}
          </b>
          <small>24h quote volume · USD est.</small>
        </div>
      </div>
      <section className="panel data-panel">
        <div className="data-toolbar">
          <div
            className="data-filter-pills"
            role="group"
            aria-label="Filter markets"
          >
            {(
              [
                ["all", "All assets"],
                ["gainers", "Gainers"],
                ["losers", "Losers"],
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
              placeholder="Find an asset..."
              aria-label="Find an asset"
            />
            <kbd>/</kbd>
          </label>
        </div>
        <div className="table-scroll">
          <table className="market-table">
            <thead>
              <tr>
                <th className="star-column">
                  <span className="sr-only">Watchlist</span>
                </th>
                <th>Asset</th>
                <th>
                  <button onClick={() => sortRows("price")}>
                    Price{" "}
                    <SortMark
                      active={sort === "price"}
                      descending={descending}
                    />
                  </button>
                </th>
                <th>
                  <button onClick={() => sortRows("change")}>
                    24h change{" "}
                    <SortMark
                      active={sort === "change"}
                      descending={descending}
                    />
                  </button>
                </th>
                <th>
                  <button onClick={() => sortRows("marketCap")}>
                    Market cap{" "}
                    <SortMark
                      active={sort === "marketCap"}
                      descending={descending}
                    />
                  </button>
                </th>
                <th>
                  <button onClick={() => sortRows("volume")}>
                    24h volume{" "}
                    <SortMark
                      active={sort === "volume"}
                      descending={descending}
                    />
                  </button>
                </th>
                <th>Trend</th>
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
                        aria-label={`${watchlist.includes(asset.symbol) ? "Remove from" : "Add to"} watchlist`}
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
                      <svg
                        className="market-sparkline"
                        viewBox="0 0 82 25"
                        aria-label={`${asset.change >= 0 ? "Up" : "Down"} trend`}
                      >
                        <polyline
                          points={
                            index % 2 === 0
                              ? "1,20 12,18 22,19 33,11 44,14 55,7 67,10 81,3"
                              : "1,4 12,7 22,5 33,14 44,11 55,20 67,17 81,22"
                          }
                          fill="none"
                          stroke={
                            asset.change >= 0
                              ? "var(--positive)"
                              : "var(--negative)"
                          }
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
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
            <b>No markets match those filters</b>
            <span>Try a different symbol or clear the watchlist filter.</span>
            <button
              className="text-button"
              onClick={() => {
                setQuery("");
                setDirection("all");
                setWatchOnly(false);
              }}
            >
              Clear filters
            </button>
          </div>
        )}
        <div className="table-footnote">
          <span>
            <span className="source-dot" /> Binance spot markets · USDT quoted,
            USD estimates
          </span>
          <span>
            Showing {rows.length} of {assets.length} assets
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

function PortfolioView({ assets, prices }: Props) {
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
  const [holdings, setHoldings] = useState<Holding[]>(() =>
    readLocal(PORTFOLIO_STORAGE, [
      { id: "holding-btc", symbol: "BTC", quantity: 0.18, averageCost: 61_700 },
      { id: "holding-eth", symbol: "ETH", quantity: 1.2, averageCost: 3_120 },
      { id: "holding-sol", symbol: "SOL", quantity: 18.4, averageCost: 168 },
    ]),
  );
  const [newSymbol, setNewSymbol] = useState("BTC");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ quantity: "", averageCost: "" });
  const [period, setPeriod] = useState("1M");
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
        if (!supabase) throw new Error("Supabase Auth is not configured.");
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        const token = data.session?.access_token;
        if (!token) throw new Error("Your sign-in session has expired.");
        const response = await fetch("/api/investments/mine", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const result = (await response.json()) as
          | ManagedInvestmentPortfolio
          | { error?: string };
        if (!response.ok) {
          const errorCode = (result as { error?: string }).error;
          if (errorCode === "investment_chart_migration_required") {
            throw new Error(
              "The investment chart database update is missing. Ask your administrator to apply the account investment migrations in order, including supabase/migrations/202610160001_managed_investment_charts.sql, then refresh your portfolio.",
            );
          }
          throw new Error(
            errorCode === "investment_portfolio_unavailable"
              ? "Your investments are temporarily unavailable. Please try again later or contact support if this continues."
              : "Could not load your investments. Please try again later.",
          );
        }
        if (active) {
          setManagedPortfolio(result as ManagedInvestmentPortfolio);
          setManagedError("");
          if (showLoading && manualManagedRefresh.current) {
            toast.success("Account investments updated");
          }
        }
      } catch (requestError) {
        if (active) {
          setManagedError(
            requestError instanceof Error
              ? requestError.message
              : "Could not load your investments.",
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
    () => localStorage.setItem(PORTFOLIO_STORAGE, JSON.stringify(holdings)),
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
    if (!window.confirm(`Remove ${symbol} from this portfolio?`)) return;
    setHoldings((items) => items.filter((item) => item.symbol !== symbol));
  };
  const circumference = 2 * Math.PI * 48;
  let consumed = 0;
  const historyPaths: Record<string, string> = {
    "1W": "M0 102 C44 95 70 112 116 82 S183 75 228 85 S295 45 360 56 S425 64 476 38 S558 42 611 28 S676 33 720 14",
    "1M": "M0 112 C35 106 46 85 83 96 S130 91 156 77 S209 84 236 69 S286 73 319 58 S365 75 401 52 S446 61 474 45 S526 58 553 33 S607 43 636 27 S683 33 720 13",
    "3M": "M0 121 C35 116 58 89 92 99 S153 105 186 66 S240 91 284 77 S339 48 378 68 S427 82 467 45 S530 61 566 41 S638 53 670 24 S700 35 720 8",
    "1Y": "M0 126 C46 92 75 117 123 100 S191 117 239 65 S301 102 351 82 S405 30 463 62 S521 85 560 33 S624 47 665 22 S696 29 720 9",
    ALL: "M0 130 C52 116 73 98 112 115 S173 88 216 100 S275 61 316 84 S383 49 425 72 S483 34 526 52 S576 65 616 31 S676 43 720 7",
  };
  const historyPath = historyPaths[period];
  const periodLabels: Record<string, string[]> = {
    "1W": ["Mon", "Wed", "Fri", "Today"],
    "1M": ["May 1", "May 10", "May 20", "Today"],
    "3M": ["Mar", "Apr", "May", "Today"],
    "1Y": ["Jun ’23", "Oct ’23", "Feb ’24", "Today"],
    ALL: ["2021", "2022", "2023", "Today"],
  };

  return (
    <div className="workspace-view">
      <ScreenHeading
        eyebrow="YOUR MONEY, CLEARLY"
        title="Portfolio"
        description="See your investments above and track personal holdings separately below."
        action={
          <div className="portfolio-heading-actions">
            <span className="local-privacy-label">
              <Bookmark size={13} /> Personal tracker · local
            </span>
            <button
              className="button button-subtle"
              disabled={holdings.length === 0}
              onClick={() => {
                if (
                  window.confirm(
                    "Delete all holdings from this portfolio? This cannot be undone.",
                  )
                ) {
                  setHoldings([]);
                  setEditing(null);
                }
              }}
            >
              <Trash2 size={13} /> Clear tracker
            </button>
          </div>
        }
      />
      <section className="panel managed-investments-panel">
        <div className="data-panel-heading">
          <div>
            <span className="eyebrow">ACCOUNT PORTFOLIO</span>
            <h2>Your investments</h2>
          </div>
          {user && (
            <div className="managed-investments-actions">
              <Link className="button button-primary button-small" to="/send">
                <Plus size={13} /> Invest
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
                Refresh
              </button>
            </div>
          )}
        </div>
        <p className="managed-investments-description">
          Confirmed transfers appear here as investments, valued in USD. Values
          are managed by Northstar and may change over time; they are not live
          market prices or guaranteed returns.
        </p>
        {user && <PendingTransfers deposits={myDeposits} />}
        {authLoading || managedLoading ? (
          <div className="managed-investments-message" role="status">
            <LoaderCircle className="admin-spinner" size={16} />
            Loading account investments…
          </div>
        ) : !user ? (
          <div className="managed-investments-message">
            <span>Sign in to see investments assigned to your account.</span>
            <Link className="button button-primary button-small" to="/account">
              Sign in
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
                <span>Invested</span>
                <b>{money.format(managedPortfolio.totals.investedUsd)}</b>
              </div>
              <div>
                <span>Return assigned</span>
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
                <span>Current assigned value</span>
                <b>{money.format(managedPortfolio.totals.totalUsd)}</b>
              </div>
            </div>
            <InvestmentPriceChart
              investments={managedPortfolio.investments}
            />
            <div className="table-scroll">
              <table className="market-table managed-investments-table">
                <thead>
                  <tr>
                    <th>Asset</th>
                    <th>Invested (USD)</th>
                    <th>Return assigned (USD)</th>
                    <th>Total value (USD)</th>
                    <th>Last updated</th>
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
                        {new Date(investment.updatedAt).toLocaleDateString()}
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
              No investments yet. Send USDT, BTC, ETH or SOL and it's added
              here once an admin confirms the transfer.
            </span>
            <Link className="button button-primary button-small" to="/send">
              <Plus size={13} /> Invest
            </Link>
          </div>
        )}
      </section>
      <div className="portfolio-overview-grid">
        <section className="panel portfolio-value-card">
          <span className="eyebrow">TOTAL PORTFOLIO VALUE</span>
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
            {Math.abs(pnlPercent).toFixed(2)}%) <span>all time</span>
          </div>
          <div className="performance-chart">
            <svg
              viewBox="0 0 720 150"
              preserveAspectRatio="none"
              role="img"
              aria-label="Illustrative portfolio performance trend"
            >
              <defs>
                <linearGradient
                  id="portfolio-workspace-fill"
                  x1="0"
                  x2="0"
                  y1="0"
                  y2="1"
                >
                  <stop
                    offset="0"
                    stopColor="var(--chart-line)"
                    stopOpacity=".18"
                  />
                  <stop
                    offset="1"
                    stopColor="var(--chart-line)"
                    stopOpacity="0"
                  />
                </linearGradient>
              </defs>
              {[0, 1, 2].map((line) => (
                <line
                  key={line}
                  x1="0"
                  x2="720"
                  y1={35 + line * 46}
                  y2={35 + line * 46}
                  className="chart-gridline"
                />
              ))}
              <path
                d={`${historyPath} V150 H0Z`}
                fill="url(#portfolio-workspace-fill)"
              />
              <path
                d={historyPath}
                fill="none"
                stroke="var(--chart-line)"
                strokeWidth="2.5"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            <div className="performance-x-labels">
              {periodLabels[period].map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>
          </div>
          <div className="performance-periods">
            {["1W", "1M", "3M", "1Y", "ALL"].map((value) => (
              <button
                key={value}
                className={period === value ? "active" : ""}
                onClick={() => setPeriod(value)}
              >
                {value}
              </button>
            ))}
          </div>
          <span className="portfolio-illustrative-note">
            Personal tracker history is illustrative. Its holdings and cost
            basis stay on this device.
          </span>
        </section>
        <section className="panel allocation-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">BY ASSET</span>
              <h2>Allocation</h2>
            </div>
          </div>
          {rows.length ? (
            <>
              <div className="allocation-content">
                <svg
                  className="allocation-donut"
                  viewBox="0 0 120 120"
                  role="img"
                  aria-label="Portfolio allocation by asset"
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
                    TOTAL VALUE
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
              <b>No holdings yet</b>
              <span>Add an asset below to see allocation.</span>
            </div>
          )}
          <div className="allocation-total-row">
            <span>Invested</span>
            <b>{money.format(totalCost)}</b>
          </div>
        </section>
      </div>
      <section className="panel data-panel holdings-panel">
        <div className="data-panel-heading">
          <div>
            <span className="eyebrow">POSITIONS</span>
            <h2>
              Your holdings <span className="watch-count">{rows.length}</span>
            </h2>
          </div>
          <div className="add-holding-control">
            <label className="sr-only" htmlFor="new-holding">
              Asset to add
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
              <Plus size={14} /> Add asset
            </button>
          </div>
        </div>
        <div className="table-scroll">
          <table className="market-table holdings-table">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Quantity</th>
                <th>Avg. cost</th>
                <th>Current price</th>
                <th>Market value</th>
                <th>Unrealized P&amp;L</th>
                <th aria-label="Actions" />
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
                        aria-label={`${holding.symbol} quantity`}
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
                        aria-label={`${holding.symbol} average cost`}
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
                          aria-label={`Save ${holding.symbol}`}
                          onClick={() => saveEdit(holding.symbol)}
                        >
                          <Check size={14} />
                        </button>
                      ) : (
                        <button
                          aria-label={`Edit ${holding.symbol}`}
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
                        aria-label={`Remove ${holding.symbol}`}
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
            <b>Your portfolio is ready for its first holding</b>
            <span>Choose an asset above to add it.</span>
          </div>
        )}
        <div className="table-footnote">
          <span>
            Personal tracker data is stored in this browser only.
          </span>
          <span>
            <span className="source-dot" /> Live prices · Binance
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
    if (!window.confirm(`Delete the ${alert.symbol} alert?`)) return;
    setAlerts((items) => items.filter((item) => item.id !== alert.id));
    if (editingId === alert.id) setEditingId(null);
  };
  const clearAll = () => {
    if (!window.confirm("Delete all of your alerts? This cannot be undone."))
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
    above: "Price rises above",
    below: "Price falls below",
    up: "Rises by (%)",
    down: "Falls by (%)",
  };

  return (
    <div className="workspace-view">
      <ScreenHeading
        eyebrow="STAY INFORMED, NOT DISTRACTED"
        title="Price alerts"
        description="Set a clear threshold and let the market come to you."
        action={
          alerts.length > 0 && (
            <button className="button button-subtle" onClick={clearAll}>
              <Trash2 size={14} /> Clear all
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
            <span>Active alerts</span>
            <b>{activeCount}</b>
          </div>
          <small>Ready to notify</small>
        </div>
        <div className="panel alert-summary">
          <div className="alert-summary-icon triggered-icon">
            <Activity size={17} />
          </div>
          <div>
            <span>Currently reached</span>
            <b>{triggered.length}</b>
          </div>
          <small>Based on latest price</small>
        </div>
        <div className="panel alert-summary">
          <div className="alert-summary-icon">
            <Clock3 size={17} />
          </div>
          <div>
            <span>Delivery</span>
            <b>In app</b>
          </div>
          <small>Verified subscribers can also get email alerts</small>
        </div>
      </div>
      <div className="alerts-layout">
        <section className="panel alert-form-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">NEW NOTIFICATION</span>
              <h2>{editingId ? "Edit alert" : "Create an alert"}</h2>
            </div>
            <div className="alert-form-icon">
              <Bell size={17} />
            </div>
          </div>
          <p className="form-intro">
            Choose a market and a price move worth your attention.
          </p>
          <label className="form-field">
            <span>Asset</span>
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
            <span>Alert condition</span>
            <select
              value={kind}
              onChange={(event) => setKind(event.target.value as AlertKind)}
            >
              <option value="above">Price rises above</option>
              <option value="below">Price falls below</option>
              <option value="up">Rises by (%)</option>
              <option value="down">Falls by (%)</option>
            </select>
          </label>
          <label className="form-field">
            <span>
              {kind === "above" || kind === "below"
                ? "Target price (USD)"
                : "Change (%)"}
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
            <span>Current {symbol} price</span>
            <b>{money.format(current)}</b>
          </div>
          <button
            className="button button-primary create-alert-button"
            disabled={!target || Number(target) <= 0}
            onClick={saveAlert}
          >
            {editingId ? <Check size={15} /> : <Plus size={15} />}
            {editingId ? "Save changes" : "Create alert"}
          </button>
          {editingId && (
            <button
              className="cancel-edit"
              onClick={() => {
                setEditingId(null);
                setTarget("");
              }}
            >
              Cancel editing
            </button>
          )}
          <div className="alert-privacy-note">
            <CircleHelp size={14} />
            <span>
              In-app alerts stay on this device and are checked while the
              dashboard is open. For background email alerts, verify your
              address and enable Price alert emails in email preferences.
            </span>
          </div>
        </section>
        <section className="panel alert-list-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">YOUR RULES</span>
              <h2>
                Alerts <span className="watch-count">{alerts.length}</span>
              </h2>
            </div>
            <button
              className={showTriggered ? "filter-pill active" : "filter-pill"}
              onClick={() => setShowTriggered(!showTriggered)}
            >
              Show reached
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
                            ? "Threshold reached"
                            : alert.enabled
                              ? "Active"
                              : "Paused"}
                        </span>
                      </div>
                      <p>
                        {kindLabel[alert.kind]} <strong>{valueLabel}</strong>
                      </p>
                      <small>Current price {money.format(currentPrice)}</small>
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
                        aria-label={`${alert.enabled ? "Pause" : "Enable"} ${asset.symbol} alert`}
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
                        aria-label={`Edit ${asset.symbol} alert`}
                        onClick={() => editAlert(alert)}
                      >
                        <Edit3 size={14} />
                      </button>
                      <button
                        aria-label={`Delete ${asset.symbol} alert`}
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
              <b>{showTriggered ? "No reached alerts" : "No alerts yet"}</b>
              <span>
                {showTriggered
                  ? "Reached thresholds will appear here."
                  : "Create a price or percentage alert to keep an eye on a move."}
              </span>
              <button
                className="text-button"
                onClick={() => setShowTriggered(false)}
              >
                View all alerts <ArrowRight size={13} />
              </button>
            </div>
          )}
          <div className="alert-list-footnote">
            <span>
              <span className="source-dot" /> Prices refresh with market data
            </span>
            <span>{triggered.length} reached</span>
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
        eyebrow="DISCOVER YOUR NEXT SIGNAL"
        title="Screener"
        description="Filter the market by price action and find assets worth a closer look."
        action={
          <button
            className="button button-subtle"
            onClick={() => setSaveOpen(!saveOpen)}
          >
            <Bookmark size={14} /> Save screen
          </button>
        }
      />
      {saveOpen && (
        <section className="panel save-filter-panel">
          <div>
            <span className="eyebrow">SAVE THESE FILTERS</span>
            <b>Name this screen</b>
          </div>
          <input
            value={filterName}
            onChange={(event) => setFilterName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") saveFilter();
            }}
            placeholder="e.g. Large cap gainers"
            aria-label="Saved screen name"
          />
          <button
            className="button button-primary"
            disabled={!filterName.trim()}
            onClick={saveFilter}
          >
            <Check size={14} /> Save screen
          </button>
          <button
            className="icon-button"
            aria-label="Cancel saving screen"
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
              <span className="eyebrow">NARROW THE FIELD</span>
              <h2>
                <Filter size={15} /> Filters
              </h2>
            </div>
            <button className="text-button" onClick={clear}>
              Reset
            </button>
          </div>
          <label className="form-field">
            <span>Price range (USD)</span>
            <div className="range-inputs">
              <input
                type="number"
                min="0"
                value={minimumPrice}
                onChange={(event) => setMinimumPrice(event.target.value)}
                placeholder="Min"
                aria-label="Minimum price"
              />
              <span>to</span>
              <input
                type="number"
                min="0"
                value={maximumPrice}
                onChange={(event) => setMaximumPrice(event.target.value)}
                placeholder="Max"
                aria-label="Maximum price"
              />
            </div>
          </label>
          <label className="form-field">
            <span>Minimum 24h move</span>
            <div className="input-with-affix">
              <input
                type="number"
                min="0"
                step="0.1"
                value={minimumChange}
                onChange={(event) => setMinimumChange(event.target.value)}
                placeholder="Any"
              />
              <span>%</span>
            </div>
          </label>
          <label className="form-field">
            <span>Direction</span>
            <select
              value={direction}
              onChange={(event) =>
                setDirection(event.target.value as SavedFilter["direction"])
              }
            >
              <option value="all">All assets</option>
              <option value="gainers">Gainers only</option>
              <option value="losers">Losers only</option>
            </select>
          </label>
          <label className="form-field">
            <span>Minimum market cap (USD)</span>
            <input
              type="number"
              min="0"
              value={minimumMarketCap}
              onChange={(event) => setMinimumMarketCap(event.target.value)}
              placeholder="Any"
            />
          </label>
          <label className="form-field">
            <span>Minimum 24h volume (USD)</span>
            <input
              type="number"
              min="0"
              value={minimumVolume}
              onChange={(event) => setMinimumVolume(event.target.value)}
              placeholder="Any"
            />
          </label>
          <div className="filter-result-count">
            <SlidersHorizontal size={14} /> <b>{rows.length}</b> matching{" "}
            {rows.length === 1 ? "asset" : "assets"}
          </div>
          <div className="saved-screens">
            <div className="saved-screens-heading">
              <b>Saved screens</b>
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
                    aria-label={`Delete ${filter.name}`}
                    onClick={() => {
                      if (
                        window.confirm(`Delete saved screen “${filter.name}”?`)
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
                Save a useful filter combination to return to it later.
              </p>
            )}
          </div>
        </section>
        <section className="panel data-panel screener-results">
          <div className="data-panel-heading">
            <div>
              <span className="eyebrow">LIVE UNIVERSE</span>
              <h2>Matching assets</h2>
            </div>
            <div className="screener-sort">
              <span>Sort by</span>
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as typeof sort)}
              >
                <option value="change">24h change</option>
                <option value="price">Price</option>
                <option value="volume">24h volume</option>
              </select>
              <button
                className="icon-button small-icon"
                aria-label={`Sort ${descending ? "ascending" : "descending"}`}
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
                  <th>Asset</th>
                  <th>Price</th>
                  <th>24h change</th>
                  <th>24h volume</th>
                  <th>Action</th>
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
                          ? "Watching"
                          : "Watch"}
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
              <b>No assets meet these criteria</b>
              <span>Broaden your price range or reset your filters.</span>
              <button className="text-button" onClick={clear}>
                Reset filters
              </button>
            </div>
          )}
          <div className="table-footnote">
            <span>Market data by Binance · indicative USD value</span>
            <span>
              {rows.length} of {assets.length} assets
            </span>
          </div>
        </section>
      </div>
      <div className="screener-note">
        <CircleHelp size={15} />
        <span>
          Screener results are a starting point for research, not
          recommendations. Criteria and saved screens are stored locally.
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

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  Bell,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  Eye,
  KeyRound,
  LineChart,
  ListChecks,
  Menu,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Wallet,
  X,
} from "lucide-react";
import { DEPOSIT_ASSETS } from "@shared/deposit-assets";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { TokenIcon } from "@/components/funds/TokenIcon";
import { MarketChart } from "@/components/market/MarketChart";
import { Sparkline } from "@/components/market/Sparkline";
import { useAssetMarkets, useCandles, useLiveTickers } from "@/hooks/use-market";
import { formatCompactUsd, formatPrice } from "@/i18n/format";
import type { AssetMarket, Ticker, Timeframe } from "@/lib/market";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";

const STEPS = [
  { icon: Wallet, key: "chooseToken" },
  { icon: Copy, key: "copyAddress" },
  { icon: Send, key: "markSent" },
  { icon: CheckCircle2, key: "confirmed" },
] as const;

const FEATURES = [
  { icon: Activity, key: "dashboard" },
  { icon: LineChart, key: "charts" },
  { icon: ListChecks, key: "tracking" },
  { icon: Bell, key: "alerts" },
  { icon: SlidersHorizontal, key: "screener" },
  { icon: Eye, key: "clear" },
] as const;

const FAQS = ["tokens", "arrival", "wrongNetwork", "valuation", "account"] as const;

function useThemeFromDashboard() {
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("northstar-theme") ?? "");
      if (stored === "light" || stored === "dark")
        document.documentElement.dataset.theme = stored;
    } catch {
      // No saved preference: keep the default theme.
    }
  }, []);
}

function Brand() {
  const { t } = useTranslation();
  return (
    <Link className="home-brand" to="/" aria-label={t("home.brandLabel")}>
      <span className="home-brand-mark">
        <Activity size={18} strokeWidth={2.5} />
      </span>
      northstar<span>.</span>
    </Link>
  );
}

const HERO_SYMBOLS = ["BTC", "ETH", "SOL"] as const;
const TOKEN_SYMBOLS = DEPOSIT_ASSETS.map((asset) => asset.symbol);
const EXPLORER_TIMEFRAMES: Timeframe[] = ["1D", "1W", "1M", "1Y", "5Y"];

/** All-exchange volume (CoinGecko), falling back to Binance's own. */
function formatVolume(market?: AssetMarket, ticker?: Ticker) {
  const volume = market?.volume24h ?? ticker?.volume24h;
  return volume ? formatCompactUsd(volume) : "—";
}

function ChangePill({ value, suffix }: { value?: number; suffix?: string }) {
  if (value === undefined || !Number.isFinite(value))
    return <span className="home-change-pill">—</span>;
  const rising = value >= 0;
  return (
    <span className={cn("home-change-pill", rising ? "positive" : "negative")}>
      {rising ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
      {Math.abs(value).toFixed(2)}%{suffix && <small>{suffix}</small>}
    </span>
  );
}

function HeroMarket({
  tickers,
  markets,
  live,
}: {
  tickers: Record<string, Ticker>;
  markets: Record<string, AssetMarket> | null;
  live: boolean;
}) {
  const { t } = useTranslation();
  const [symbol, setSymbol] = useState<(typeof HERO_SYMBOLS)[number]>("BTC");
  const ticker = tickers[symbol];
  const chart = useCandles(symbol, "1D", ticker?.price);
  return (
    <div className="home-preview">
      <section className="home-preview-card home-live-card" aria-label={t("home.live.label")}>
        <div className="home-preview-head">
          <span>{t("home.live.title")}</span>
          <span className={cn("home-live-tag", { on: live })}>
            <i /> {live ? t("home.live.live") : t("home.live.updating")}
          </span>
        </div>
        <div className="home-live-tabs" role="tablist" aria-label={t("home.live.choose")}>
          {HERO_SYMBOLS.map((item) => (
            <button
              key={item}
              role="tab"
              aria-selected={symbol === item}
              className={cn({ active: symbol === item })}
              onClick={() => setSymbol(item)}
            >
              <TokenIcon symbol={item} size="sm" />
              {item}
            </button>
          ))}
        </div>
        <div className="home-live-price" aria-live="polite">
          <strong>{ticker ? formatPrice(ticker.price) : "—"}</strong>
          <ChangePill value={ticker?.change24h} suffix="24h" />
        </div>
        <MarketChart
          candles={chart.candles}
          loading={chart.loading}
          error={chart.error}
          onRetry={chart.retry}
          label={symbol}
          axis={false}
          className="home-live-chart"
        />
        <dl className="home-live-stats">
          <div>
            <dt>{t("home.live.high")}</dt>
            <dd>{ticker ? formatPrice(ticker.high24h) : "—"}</dd>
          </div>
          <div>
            <dt>{t("home.live.low")}</dt>
            <dd>{ticker ? formatPrice(ticker.low24h) : "—"}</dd>
          </div>
          <div>
            <dt>{t("home.live.volume")}</dt>
            <dd>{formatVolume(markets?.[symbol], ticker)}</dd>
          </div>
        </dl>
      </section>
      <div className="home-preview-toast" aria-hidden="true">
        <CheckCircle2 size={16} />
        <div>
          <b>{t("home.preview.toastTitle")}</b>
          <span>{t("home.preview.toastText", { amount: "0.25 ETH" })}</span>
        </div>
      </div>
    </div>
  );
}

function MarketExplorer({
  symbol,
  ticker,
  market,
}: {
  symbol: string;
  ticker?: Ticker;
  market?: AssetMarket;
}) {
  const { t } = useTranslation();
  const [timeframe, setTimeframe] = useState<Timeframe>("1M");
  const chart = useCandles(symbol, timeframe, ticker?.price);
  const asset = DEPOSIT_ASSETS.find((item) => item.symbol === symbol)!;
  const { candles } = chart;
  const first = candles[0]?.open;
  const last = candles[candles.length - 1]?.close ?? ticker?.price;
  const change = first && last ? (last / first - 1) * 100 : undefined;
  const high = candles.length ? Math.max(...candles.map((c) => c.high)) : NaN;
  const low = candles.length ? Math.min(...candles.map((c) => c.low)) : NaN;
  const timeframeLabel = timeframe === "5Y" ? t("home.explorer.max") : timeframe;
  return (
    <section className="home-explorer" aria-label={t("home.explorer.label", { name: asset.name })}>
      <div className="home-explorer-head">
        <div className="home-explorer-title">
          <TokenIcon symbol={symbol} size="lg" />
          <div>
            <b>{asset.name}</b>
            <span>{symbol} · USD</span>
          </div>
        </div>
        <div className="home-explorer-price" aria-live="polite">
          <strong>{last ? formatPrice(last) : "—"}</strong>
          <ChangePill value={change} suffix={timeframeLabel} />
        </div>
        <div className="home-explorer-timeframes" role="group" aria-label={t("chart.timeframe")}>
          {EXPLORER_TIMEFRAMES.map((item) => (
            <button
              key={item}
              className={cn({ active: timeframe === item })}
              aria-pressed={timeframe === item}
              onClick={() => setTimeframe(item)}
            >
              {item === "5Y" ? t("home.explorer.max") : item}
            </button>
          ))}
        </div>
      </div>
      <MarketChart
        candles={candles}
        loading={chart.loading}
        error={chart.error}
        onRetry={chart.retry}
        label={asset.name}
        className="home-explorer-chart"
      />
      <dl className="home-explorer-stats">
        <div>
          <dt>{t("home.explorer.high", { timeframe: timeframeLabel })}</dt>
          <dd>{formatPrice(high)}</dd>
        </div>
        <div>
          <dt>{t("home.explorer.low", { timeframe: timeframeLabel })}</dt>
          <dd>{formatPrice(low)}</dd>
        </div>
        <div>
          <dt>{t("home.live.volume")}</dt>
          <dd>{formatVolume(market, ticker)}</dd>
        </div>
        <div>
          <dt>{t("asset.marketCap")}</dt>
          <dd>{market ? formatCompactUsd(market.marketCap) : "—"}</dd>
        </div>
      </dl>
      <p className="home-explorer-source">
        <span className="source-dot" /> {t("home.explorer.source")}
      </p>
    </section>
  );
}

export default function Home() {
  useThemeFromDashboard();
  const { t } = useTranslation();
  const { user } = useAuth();
  const { tickers: liveTickers, live } = useLiveTickers(TOKEN_SYMBOLS);
  const { value: markets } = useAssetMarkets();
  // CoinGecko's snapshot fills in until (or unless) Binance answers.
  const tickers = useMemo<Record<string, Ticker>>(
    () => ({ ...(markets ?? {}), ...liveTickers }),
    [markets, liveTickers],
  );
  const [chartSymbol, setChartSymbol] = useState<string>("BTC");
  const [menuOpen, setMenuOpen] = useState(false);

  const primaryCta = user ? (
    <Link className="button button-primary home-cta" to="/send">
      {t("home.investNow")} <ArrowRight size={16} />
    </Link>
  ) : (
    <Link
      className="button button-primary home-cta"
      to="/account"
      state={{ returnTo: "/send" }}
    >
      {t("home.getStarted")} <ArrowRight size={16} />
    </Link>
  );

  const navLinks = (
    <>
      <a href="#how-it-works" onClick={() => setMenuOpen(false)}>
        {t("home.nav.howItWorks")}
      </a>
      <a href="#tokens" onClick={() => setMenuOpen(false)}>
        {t("home.nav.tokens")}
      </a>
      <a href="#features" onClick={() => setMenuOpen(false)}>
        {t("home.nav.features")}
      </a>
      <a href="#faq" onClick={() => setMenuOpen(false)}>
        {t("home.nav.faq")}
      </a>
    </>
  );

  return (
    <div className="home">
      <header className="home-nav">
        <div className="home-container home-nav-inner">
          <Brand />
          <nav className="home-nav-links" aria-label={t("home.nav.sections")}>
            {navLinks}
          </nav>
          <div className="home-nav-actions">
            <LanguageSwitcher />
            {user ? (
              <Link className="button button-subtle" to="/dashboard">
                {t("home.openDashboard")}
              </Link>
            ) : (
              <Link className="button button-subtle" to="/account">
                {t("common.signIn")}
              </Link>
            )}
            <span className="home-nav-cta">{primaryCta}</span>
            <button
              type="button"
              className="icon-button home-menu-button"
              aria-label={menuOpen ? t("common.closeMenu") : t("common.openMenu")}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>
        {menuOpen && (
          <nav className="home-mobile-menu" aria-label={t("home.nav.sections")}>
            {navLinks}
            <div className="home-mobile-menu-actions">
              {user ? (
                <Link className="button button-subtle" to="/dashboard">
                  {t("home.openDashboard")}
                </Link>
              ) : (
                <Link className="button button-subtle" to="/account">
                  {t("common.signIn")}
                </Link>
              )}
              {primaryCta}
            </div>
          </nav>
        )}
      </header>

      <main>
        <section className="home-hero">
          <div className="home-container home-hero-inner">
            <div className="home-hero-copy">
              <span className="eyebrow">{t("home.hero.eyebrow")}</span>
              <h1>{t("home.hero.title")}</h1>
              <p>{t("home.hero.text")}</p>
              <div className="home-hero-actions">
                {primaryCta}
                <Link className="button button-subtle home-cta" to="/markets">
                  {t("home.hero.exploreMarkets")}
                </Link>
              </div>
              <ul className="home-trust">
                <li>
                  <ShieldCheck size={15} /> {t("home.hero.trustVerified")}
                </li>
                <li>
                  <KeyRound size={15} /> {t("home.hero.trustKeys")}
                </li>
                <li>
                  <ClipboardCheck size={15} /> {t("home.hero.trustStatus")}
                </li>
              </ul>
            </div>
            <HeroMarket tickers={tickers} markets={markets} live={live} />
          </div>
        </section>

        <section className="home-section" id="tokens">
          <div className="home-container">
            <div className="home-section-heading">
              <span className="eyebrow">{t("home.tokens.eyebrow")}</span>
              <h2>{t("home.tokens.title")}</h2>
              <p>{t("home.tokens.text")}</p>
            </div>
            <div className="home-tokens">
              {DEPOSIT_ASSETS.map((asset) => {
                const ticker = tickers[asset.symbol];
                const change = ticker?.change24h;
                return (
                  <button
                    type="button"
                    className={cn("home-token", {
                      selected: chartSymbol === asset.symbol,
                    })}
                    aria-pressed={chartSymbol === asset.symbol}
                    key={asset.symbol}
                    onClick={() => setChartSymbol(asset.symbol)}
                  >
                    <span className="home-token-head">
                      <TokenIcon symbol={asset.symbol} size="lg" />
                      <span>
                        <b>{asset.name}</b>
                        <span>
                          {asset.symbol} · {asset.network}
                        </span>
                      </span>
                    </span>
                    <strong>{ticker ? formatPrice(ticker.price) : "—"}</strong>
                    {change === undefined ? (
                      <span className="home-token-change">
                        {t("home.tokens.loadingPrice")}
                      </span>
                    ) : (
                      <span
                        className={`home-token-change ${change >= 0 ? "positive-text" : "negative-text"}`}
                      >
                        {change >= 0 ? (
                          <ArrowUpRight size={13} />
                        ) : (
                          <ArrowDownRight size={13} />
                        )}
                        {t("home.tokens.changeToday", {
                          change: Math.abs(change).toFixed(2),
                        })}
                      </span>
                    )}
                    <span className="home-token-spark">
                      <Sparkline
                        values={markets?.[asset.symbol]?.sparkline}
                        filled
                        label={t("home.tokens.sparkLabel", {
                          symbol: asset.symbol,
                        })}
                      />
                      <small>{t("home.tokens.sevenDays")}</small>
                    </span>
                  </button>
                );
              })}
            </div>
            <MarketExplorer
              symbol={chartSymbol}
              ticker={tickers[chartSymbol]}
              market={markets?.[chartSymbol]}
            />
          </div>
        </section>

        <section className="home-section home-section-alt" id="how-it-works">
          <div className="home-container">
            <div className="home-section-heading">
              <span className="eyebrow">{t("home.steps.eyebrow")}</span>
              <h2>{t("home.steps.title")}</h2>
            </div>
            <ol className="home-steps">
              {STEPS.map((step, index) => (
                <li key={step.key}>
                  <span className="home-step-number">{index + 1}</span>
                  <step.icon size={20} className="home-step-icon" />
                  <h3>{t(`home.steps.${step.key}.title`)}</h3>
                  <p>{t(`home.steps.${step.key}.text`)}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="home-section" id="features">
          <div className="home-container">
            <div className="home-section-heading">
              <span className="eyebrow">{t("home.features.eyebrow")}</span>
              <h2>{t("home.features.title")}</h2>
            </div>
            <div className="home-features">
              {FEATURES.map((feature) => (
                <article key={feature.key}>
                  <span className="home-feature-icon">
                    <feature.icon size={18} />
                  </span>
                  <h3>{t(`home.features.${feature.key}.title`)}</h3>
                  <p>{t(`home.features.${feature.key}.text`)}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="home-section home-section-alt" id="faq">
          <div className="home-container home-faq-layout">
            <div className="home-section-heading">
              <span className="eyebrow">{t("home.faq.eyebrow")}</span>
              <h2>{t("home.faq.title")}</h2>
              <p>{t("home.faq.text")}</p>
            </div>
            <div className="home-faq">
              {FAQS.map((faq) => (
                <details key={faq}>
                  <summary>{t(`home.faq.${faq}.question`)}</summary>
                  <p>{t(`home.faq.${faq}.answer`)}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="home-section">
          <div className="home-container">
            <div className="home-final-cta">
              <div>
                <h2>{t("home.finalCta.title")}</h2>
                <p>{t("home.finalCta.text")}</p>
              </div>
              {primaryCta}
            </div>
          </div>
        </section>
      </main>

      <footer className="home-footer">
        <div className="home-container home-footer-inner">
          <div>
            <Brand />
            <p>{t("home.footer.disclaimer")}</p>
          </div>
          <nav aria-label={t("home.footer.label")}>
            <Link to="/dashboard">{t("home.footer.dashboard")}</Link>
            <Link to="/markets">{t("nav.markets")}</Link>
            <Link to="/send">{t("home.footer.invest")}</Link>
            <Link to="/withdraw">{t("nav.withdraw")}</Link>
            <Link to="/portfolio">{t("nav.portfolio")}</Link>
          </nav>
        </div>
        <div className="home-container home-footer-bottom">
          © {new Date().getFullYear()} Northstar
        </div>
      </footer>
    </div>
  );
}

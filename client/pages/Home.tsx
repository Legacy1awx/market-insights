import { useEffect, useState } from "react";
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
import { TokenIcon } from "@/components/funds/TokenIcon";
import { useAuth } from "@/lib/auth";
import { fetchUsdQuotes, type TokenQuotes } from "@/lib/prices";

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const STEPS = [
  {
    icon: Wallet,
    title: "Choose a token",
    text: "Pick USDT, BTC, ETH or SOL. The matching wallet address is revealed for you.",
  },
  {
    icon: Copy,
    title: "Copy the address and send",
    text: "Send from any wallet or exchange, using the network shown next to the address.",
  },
  {
    icon: Send,
    title: "Click “I have sent funds”",
    text: "Enter the amount and transaction hash so we can find your transfer on the blockchain.",
  },
  {
    icon: CheckCircle2,
    title: "Get confirmed",
    text: "An admin verifies the transaction, then it's added to your investments. You're notified right away.",
  },
];

const FEATURES = [
  {
    icon: Activity,
    title: "Live market dashboard",
    text: "Prices, charts and top movers for the major cryptocurrencies in one view.",
  },
  {
    icon: LineChart,
    title: "Investment charts",
    text: "Follow the value of each investment over time with detailed, interactive charts.",
  },
  {
    icon: ListChecks,
    title: "Transfer tracking",
    text: "See every transfer move from submitted to confirmed, with full transaction details.",
  },
  {
    icon: Bell,
    title: "Price alerts",
    text: "Set alerts on the assets you care about and stay on top of big moves.",
  },
  {
    icon: SlidersHorizontal,
    title: "Screener & watchlist",
    text: "Filter the market and keep the assets you follow one click away.",
  },
  {
    icon: Eye,
    title: "Clear by design",
    text: "Light and dark themes, colour-safe mode and layouts that work on any screen.",
  },
];

const FAQS = [
  {
    question: "What can I invest with?",
    answer:
      "Tether (USDT) on the TRON TRC-20 network, Bitcoin (BTC), Ethereum (ETH) and Solana (SOL). Each token has its own receiving address, shown after you choose it.",
  },
  {
    question: "How do I know my transfer arrived?",
    answer:
      "After you click “I have sent funds”, your transfer appears in Your transfers with a live status. An admin checks it on the blockchain; once it's confirmed you get a notification and it shows up in your portfolio.",
  },
  {
    question: "What if I send on the wrong network?",
    answer:
      "Transfers sent with the wrong token or network can be lost permanently and usually can't be reversed. Always check the token and network shown next to the address before you send.",
  },
  {
    question: "How is my investment valued?",
    answer:
      "Investments are shown in US dollars, starting from the confirmed value of your transfer. Values are managed by Northstar and can go up or down; they are not live market prices and returns are not guaranteed.",
  },
  {
    question: "Do I need an account?",
    answer:
      "You can explore the markets without one. To invest and track your transfers, create a free account with your email.",
  },
];

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

function useTokenQuotes() {
  const [quotes, setQuotes] = useState<TokenQuotes | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const load = () =>
      fetchUsdQuotes(controller.signal)
        .then(setQuotes)
        .catch(() => undefined);
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, []);
  return quotes;
}

function Brand() {
  return (
    <Link className="home-brand" to="/" aria-label="Northstar home">
      <span className="home-brand-mark">
        <Activity size={18} strokeWidth={2.5} />
      </span>
      northstar<span>.</span>
    </Link>
  );
}

function HeroPreview() {
  const points = [62, 58, 64, 60, 70, 68, 76, 72, 81, 79, 88, 92];
  const path = points
    .map(
      (value, index) =>
        `${index === 0 ? "M" : "L"}${index * 30},${110 - value}`,
    )
    .join(" ");
  return (
    <div className="home-preview" aria-hidden="true">
      <div className="home-preview-card">
        <div className="home-preview-head">
          <span>Your investments</span>
          <span className="home-preview-tag">Example</span>
        </div>
        <strong>$12,480.00</strong>
        <span className="home-preview-change">
          <ArrowUpRight size={13} /> +$504.20 (4.21%)
        </span>
        <svg
          className="home-preview-chart"
          viewBox="0 0 330 80"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="home-preview-fill" x1="0" x2="0" y1="0" y2="1">
              <stop
                offset="0%"
                stopColor="var(--chart-line)"
                stopOpacity=".3"
              />
              <stop
                offset="100%"
                stopColor="var(--chart-line)"
                stopOpacity="0"
              />
            </linearGradient>
          </defs>
          <path d={`${path} L330,80 L0,80 Z`} fill="url(#home-preview-fill)" />
          <path
            d={path}
            fill="none"
            stroke="var(--chart-line)"
            strokeWidth="2.5"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <ul>
          {[
            ["BTC", "Bitcoin", "$7,240.00"],
            ["ETH", "Ethereum", "$3,960.00"],
            ["USDT", "Tether", "$1,280.00"],
          ].map(([symbol, name, value]) => (
            <li key={symbol}>
              <TokenIcon symbol={symbol} size="sm" />
              <span>{name}</span>
              <b>{value}</b>
            </li>
          ))}
        </ul>
      </div>
      <div className="home-preview-toast">
        <CheckCircle2 size={16} />
        <div>
          <b>Transfer confirmed</b>
          <span>0.25 ETH added to your investments</span>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  useThemeFromDashboard();
  const { user } = useAuth();
  const quotes = useTokenQuotes();
  const [menuOpen, setMenuOpen] = useState(false);

  const primaryCta = user ? (
    <Link className="button button-primary home-cta" to="/send">
      Invest now <ArrowRight size={16} />
    </Link>
  ) : (
    <Link
      className="button button-primary home-cta"
      to="/account"
      state={{ returnTo: "/send" }}
    >
      Get started <ArrowRight size={16} />
    </Link>
  );

  const navLinks = (
    <>
      <a href="#how-it-works" onClick={() => setMenuOpen(false)}>
        How it works
      </a>
      <a href="#tokens" onClick={() => setMenuOpen(false)}>
        Tokens
      </a>
      <a href="#features" onClick={() => setMenuOpen(false)}>
        Features
      </a>
      <a href="#faq" onClick={() => setMenuOpen(false)}>
        FAQ
      </a>
    </>
  );

  return (
    <div className="home">
      <header className="home-nav">
        <div className="home-container home-nav-inner">
          <Brand />
          <nav className="home-nav-links" aria-label="Sections">
            {navLinks}
          </nav>
          <div className="home-nav-actions">
            {user ? (
              <Link className="button button-subtle" to="/dashboard">
                Open dashboard
              </Link>
            ) : (
              <Link className="button button-subtle" to="/account">
                Sign in
              </Link>
            )}
            <span className="home-nav-cta">{primaryCta}</span>
            <button
              type="button"
              className="icon-button home-menu-button"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>
        {menuOpen && (
          <nav className="home-mobile-menu" aria-label="Sections">
            {navLinks}
            <div className="home-mobile-menu-actions">
              {user ? (
                <Link className="button button-subtle" to="/dashboard">
                  Open dashboard
                </Link>
              ) : (
                <Link className="button button-subtle" to="/account">
                  Sign in
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
              <span className="eyebrow">CRYPTO INVESTING, MADE CLEAR</span>
              <h1>Invest in crypto and see every step.</h1>
              <p>
                Fund your Northstar account with USDT, BTC, ETH or SOL, follow
                each transfer from “sent” to “confirmed”, and track your
                investments alongside live market data.
              </p>
              <div className="home-hero-actions">
                {primaryCta}
                <Link className="button button-subtle home-cta" to="/markets">
                  Explore markets
                </Link>
              </div>
              <ul className="home-trust">
                <li>
                  <ShieldCheck size={15} /> Every transfer verified on-chain
                </li>
                <li>
                  <KeyRound size={15} /> We never ask for your keys
                </li>
                <li>
                  <ClipboardCheck size={15} /> Live status for each transfer
                </li>
              </ul>
            </div>
            <HeroPreview />
          </div>
        </section>

        <section className="home-section" id="tokens">
          <div className="home-container">
            <div className="home-section-heading">
              <span className="eyebrow">SUPPORTED TOKENS</span>
              <h2>Four ways to invest</h2>
              <p>Live prices, updated every minute.</p>
            </div>
            <div className="home-tokens">
              {DEPOSIT_ASSETS.map((asset) => {
                const quote = quotes?.[asset.symbol];
                const change = quote?.change24h ?? null;
                return (
                  <article className="home-token" key={asset.symbol}>
                    <div className="home-token-head">
                      <TokenIcon symbol={asset.symbol} size="lg" />
                      <div>
                        <b>{asset.name}</b>
                        <span>
                          {asset.symbol} · {asset.network}
                        </span>
                      </div>
                    </div>
                    <strong>{quote ? usd.format(quote.price) : "—"}</strong>
                    {asset.symbol === "USDT" ? (
                      <span className="home-token-change">
                        Stablecoin · ≈ $1.00
                      </span>
                    ) : change === null ? (
                      <span className="home-token-change">
                        {quotes ? "24h change unavailable" : "Loading price…"}
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
                        {Math.abs(change).toFixed(2)}% today
                      </span>
                    )}
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="home-section home-section-alt" id="how-it-works">
          <div className="home-container">
            <div className="home-section-heading">
              <span className="eyebrow">HOW IT WORKS</span>
              <h2>From your wallet to your portfolio in four steps</h2>
            </div>
            <ol className="home-steps">
              {STEPS.map((step, index) => (
                <li key={step.title}>
                  <span className="home-step-number">{index + 1}</span>
                  <step.icon size={20} className="home-step-icon" />
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="home-section" id="features">
          <div className="home-container">
            <div className="home-section-heading">
              <span className="eyebrow">FEATURES</span>
              <h2>Everything in one clear workspace</h2>
            </div>
            <div className="home-features">
              {FEATURES.map((feature) => (
                <article key={feature.title}>
                  <span className="home-feature-icon">
                    <feature.icon size={18} />
                  </span>
                  <h3>{feature.title}</h3>
                  <p>{feature.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="home-section home-section-alt" id="faq">
          <div className="home-container home-faq-layout">
            <div className="home-section-heading">
              <span className="eyebrow">FAQ</span>
              <h2>Questions, answered</h2>
              <p>The essentials about investing with Northstar.</p>
            </div>
            <div className="home-faq">
              {FAQS.map((faq) => (
                <details key={faq.question}>
                  <summary>{faq.question}</summary>
                  <p>{faq.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="home-section">
          <div className="home-container">
            <div className="home-final-cta">
              <div>
                <h2>Ready to make your first investment?</h2>
                <p>
                  It takes a few minutes: choose a token, send it, and we'll
                  confirm it for you.
                </p>
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
            <p>
              Cryptoassets are volatile and can lose value. Only invest what you
              can afford to lose. Investment values shown on Northstar are not
              guaranteed.
            </p>
          </div>
          <nav aria-label="Footer">
            <Link to="/dashboard">Dashboard</Link>
            <Link to="/markets">Markets</Link>
            <Link to="/send">Invest</Link>
            <Link to="/withdraw">Withdraw</Link>
            <Link to="/portfolio">Portfolio</Link>
          </nav>
        </div>
        <div className="home-container home-footer-bottom">
          © {new Date().getFullYear()} Northstar
        </div>
      </footer>
    </div>
  );
}

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  LoaderCircle,
  RefreshCw,
  Wallet,
} from "lucide-react";
import type { DepositAsset } from "@shared/deposit-assets";
import { TokenPicker } from "@/components/funds/TokenPicker";
import { TransferForm } from "@/components/funds/TransferForm";
import { TransferList } from "@/components/funds/TransferList";
import { TransferTimeline } from "@/components/funds/TransferTimeline";
import { WalletAddress } from "@/components/funds/WalletAddress";
import { useMyDeposits } from "@/hooks/use-my-deposits";
import { useAuth } from "@/lib/auth";
import type { Deposit } from "@/lib/deposits";
import { cn } from "@/lib/utils";

function InvestStep({
  number,
  title,
  description,
  active,
  done,
  children,
}: {
  number: number;
  title: string;
  description: string;
  active: boolean;
  done?: boolean;
  children: ReactNode;
}) {
  return (
    <li className={cn("invest-step panel", { active, done })}>
      <div className="invest-step-heading">
        <span className="invest-step-number" aria-hidden="true">
          {done ? <CheckCircle2 size={16} /> : number}
        </span>
        <div>
          <h2>
            <span className="sr-only">Step {number}: </span>
            {title}
          </h2>
          <p>{description}</p>
        </div>
      </div>
      {children}
    </li>
  );
}

export default function SendFunds() {
  const { user, isLoading: authLoading } = useAuth();
  const { deposits, loading, refreshing, error, refresh, addDeposit } =
    useMyDeposits();
  const [selected, setSelected] = useState<DepositAsset | null>(null);
  const [submitted, setSubmitted] = useState<Deposit | null>(null);
  const { hash } = useLocation();

  const scrolledToTransfers = useRef(false);

  // "View details" links from the portfolio land on the transfer list.
  useEffect(() => {
    if (
      hash !== "#transfers" ||
      loading ||
      deposits.length === 0 ||
      scrolledToTransfers.current
    )
      return;
    scrolledToTransfers.current = true;
    document
      .getElementById("transfers")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [deposits.length, hash, loading]);

  const chooseToken = (asset: DepositAsset) => {
    setSelected(asset);
    setSubmitted(null);
  };

  const handleSubmitted = (deposit: Deposit) => {
    addDeposit(deposit);
    setSubmitted(deposit);
    toast.success("Transfer submitted", {
      description: `${deposit.amount} ${deposit.symbol} is awaiting confirmation by an admin.`,
    });
  };

  // Keep the success panel in sync with polling (e.g. once it's confirmed).
  const submittedLatest = submitted
    ? (deposits.find((item) => item.id === submitted.id) ?? submitted)
    : null;

  return (
    <main className="funds-shell">
      <header className="funds-topbar">
        <Link className="funds-brand" to="/">
          <span className="funds-brand-mark">N</span>
          northstar<span>.</span>
        </Link>
        <Link className="funds-back" to="/portfolio">
          <ArrowLeft size={15} /> Back to portfolio
        </Link>
      </header>

      <section className="funds-content">
        <div className="funds-heading">
          <span className="eyebrow">INVEST WITH CRYPTO</span>
          <h1>Invest</h1>
          <p>
            Send USDT, BTC, ETH or SOL to Northstar. Once an admin confirms your
            transfer, it's added to your investment in that token.
          </p>
        </div>

        <ol className="invest-steps">
          <InvestStep
            number={1}
            title="Choose a token"
            description="Pick the token you want to invest with."
            active={!selected}
            done={Boolean(selected)}
          >
            <TokenPicker selected={selected} onSelect={chooseToken} />
          </InvestStep>

          <InvestStep
            number={2}
            title="Copy the address and send"
            description="Send the token from your wallet or exchange to this address."
            active={Boolean(selected) && !submitted}
            done={Boolean(submitted)}
          >
            {selected ? (
              <WalletAddress asset={selected} />
            ) : (
              <p className="invest-step-placeholder">
                Choose a token above to reveal its wallet address.
              </p>
            )}
          </InvestStep>

          <InvestStep
            number={3}
            title="Tell us about your transfer"
            description="After sending, enter the details and click “I have sent funds”."
            active={Boolean(selected)}
            done={submittedLatest?.status === "confirmed"}
          >
            {!selected ? (
              <p className="invest-step-placeholder">
                Available after you choose a token and send it.
              </p>
            ) : authLoading ? (
              <p className="invest-step-placeholder" role="status">
                <LoaderCircle className="admin-spinner" size={15} /> Checking
                your account…
              </p>
            ) : !user ? (
              <div className="invest-signin">
                <Wallet size={18} />
                <div>
                  <b>Sign in to submit your transfer</b>
                  <span>
                    Your account keeps track of your transfers and investments.
                  </span>
                </div>
                <Link
                  className="button button-primary"
                  to="/account"
                  state={{ returnTo: "/send" }}
                >
                  Sign in or create account
                </Link>
              </div>
            ) : submittedLatest ? (
              <div className="invest-submitted" role="status">
                <h3>
                  {submittedLatest.status === "confirmed"
                    ? "Your transfer is confirmed"
                    : submittedLatest.status === "rejected"
                      ? "Your transfer was rejected"
                      : "Transfer submitted, awaiting confirmation"}
                </h3>
                <p>
                  {submittedLatest.amount} {submittedLatest.symbol} ·{" "}
                  {submittedLatest.status === "pending"
                    ? "we'll update this page as soon as an admin reviews it."
                    : submittedLatest.status === "confirmed"
                      ? `it has been added to your ${submittedLatest.symbol} investment.`
                      : "no funds were added. Open the transfer below for details."}
                </p>
                <TransferTimeline
                  status={submittedLatest.status}
                  submittedAt={submittedLatest.submittedAt}
                  reviewedAt={submittedLatest.reviewedAt}
                  symbol={submittedLatest.symbol}
                />
                <div className="transfer-actions">
                  {submittedLatest.status === "confirmed" && (
                    <Link className="button button-primary" to="/portfolio">
                      View my investments
                    </Link>
                  )}
                  <button
                    type="button"
                    className="button button-subtle"
                    onClick={() => {
                      setSubmitted(null);
                      setSelected(null);
                    }}
                  >
                    Make another investment
                  </button>
                </div>
              </div>
            ) : (
              <TransferForm
                key={selected.symbol}
                asset={selected}
                onSubmitted={handleSubmitted}
              />
            )}
          </InvestStep>
        </ol>

        {user && (
          <section className="funds-history" id="transfers">
            <div className="funds-history-heading">
              <div>
                <span className="eyebrow">YOUR ACCOUNT</span>
                <h2>Your transfers</h2>
              </div>
              <button
                className="button button-subtle button-small"
                disabled={loading || refreshing}
                onClick={() => void refresh()}
              >
                {loading || refreshing ? (
                  <LoaderCircle className="admin-spinner" size={13} />
                ) : (
                  <RefreshCw size={13} />
                )}
                Refresh
              </button>
            </div>
            {error && (
              <p className="transfer-form-error" role="alert">
                {error}
              </p>
            )}
            {loading ? (
              <div className="panel funds-empty" role="status">
                <LoaderCircle className="admin-spinner" size={16} /> Loading
                your transfers…
              </div>
            ) : deposits.length === 0 ? (
              <div className="panel funds-empty">
                No transfers yet. Follow the steps above to make your first
                investment.
              </div>
            ) : (
              <TransferList
                transfers={deposits}
                openId={submitted?.id}
                actions={(transfer) =>
                  transfer.status === "confirmed" ? (
                    <Link
                      className="button button-subtle button-small"
                      to="/portfolio"
                    >
                      View in portfolio
                    </Link>
                  ) : null
                }
              />
            )}
          </section>
        )}

        <p className="funds-disclaimer">
          Northstar never asks for your wallet keys or recovery phrase. Always
          check the token and network in your wallet before you send.
        </p>
      </section>
    </main>
  );
}

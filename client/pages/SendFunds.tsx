import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
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
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
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
  const { t } = useTranslation();
  return (
    <li className={cn("invest-step panel", { active, done })}>
      <div className="invest-step-heading">
        <span className="invest-step-number" aria-hidden="true">
          {done ? <CheckCircle2 size={16} /> : number}
        </span>
        <div>
          <h2>
            <span className="sr-only">{t("funds.stepPrefix", { number })} </span>
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
  const { t } = useTranslation();
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
    toast.success(t("send.toastTitle"), {
      description: t("send.toastText", {
        amount: `${deposit.amount} ${deposit.symbol}`,
      }),
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
        <div className="funds-topbar-actions">
          <LanguageSwitcher />
          <Link className="funds-back" to="/portfolio">
            <ArrowLeft size={15} /> {t("funds.backToPortfolio")}
          </Link>
        </div>
      </header>

      <section className="funds-content">
        <div className="funds-heading">
          <span className="eyebrow">{t("send.eyebrow")}</span>
          <h1>{t("send.title")}</h1>
          <p>{t("send.intro")}</p>
        </div>

        <ol className="invest-steps">
          <InvestStep
            number={1}
            title={t("send.step1Title")}
            description={t("send.step1Text")}
            active={!selected}
            done={Boolean(selected)}
          >
            <TokenPicker selected={selected} onSelect={chooseToken} />
          </InvestStep>

          <InvestStep
            number={2}
            title={t("send.step2Title")}
            description={t("send.step2Text")}
            active={Boolean(selected) && !submitted}
            done={Boolean(submitted)}
          >
            {selected ? (
              <WalletAddress asset={selected} />
            ) : (
              <p className="invest-step-placeholder">
                {t("send.step2Placeholder")}
              </p>
            )}
          </InvestStep>

          <InvestStep
            number={3}
            title={t("send.step3Title")}
            description={t("send.step3Text")}
            active={Boolean(selected)}
            done={submittedLatest?.status === "confirmed"}
          >
            {!selected ? (
              <p className="invest-step-placeholder">
                {t("send.step3Placeholder")}
              </p>
            ) : authLoading ? (
              <p className="invest-step-placeholder" role="status">
                <LoaderCircle className="admin-spinner" size={15} />{" "}
                {t("funds.checkingAccount")}
              </p>
            ) : !user ? (
              <div className="invest-signin">
                <Wallet size={18} />
                <div>
                  <b>{t("send.signInTitle")}</b>
                  <span>{t("send.signInText")}</span>
                </div>
                <Link
                  className="button button-primary"
                  to="/account"
                  state={{ returnTo: "/send" }}
                >
                  {t("common.signInOrCreate")}
                </Link>
              </div>
            ) : submittedLatest ? (
              <div className="invest-submitted" role="status">
                <h3>
                  {submittedLatest.status === "confirmed"
                    ? t("send.result.confirmedTitle")
                    : submittedLatest.status === "rejected"
                      ? t("send.result.rejectedTitle")
                      : t("send.result.pendingTitle")}
                </h3>
                <p>
                  {submittedLatest.amount} {submittedLatest.symbol} ·{" "}
                  {submittedLatest.status === "pending"
                    ? t("send.result.pendingText")
                    : submittedLatest.status === "confirmed"
                      ? t("send.result.confirmedText", {
                          symbol: submittedLatest.symbol,
                        })
                      : t("send.result.rejectedText")}
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
                      {t("send.viewInvestments")}
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
                    {t("send.another")}
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
                <span className="eyebrow">{t("funds.yourAccount")}</span>
                <h2>{t("send.transfersTitle")}</h2>
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
                {t("common.refresh")}
              </button>
            </div>
            {error && (
              <p className="transfer-form-error" role="alert">
                {error}
              </p>
            )}
            {loading ? (
              <div className="panel funds-empty" role="status">
                <LoaderCircle className="admin-spinner" size={16} />{" "}
                {t("send.loadingTransfers")}
              </div>
            ) : deposits.length === 0 ? (
              <div className="panel funds-empty">
                {t("send.noTransfers")}
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
                      {t("send.viewInPortfolio")}
                    </Link>
                  ) : null
                }
              />
            )}
          </section>
        )}

        <p className="funds-disclaimer">
          {t("send.disclaimer")}
        </p>
      </section>
    </main>
  );
}

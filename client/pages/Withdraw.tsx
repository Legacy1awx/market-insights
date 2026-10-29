import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, LoaderCircle, RefreshCw, Wallet } from "lucide-react";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { WithdrawalForm } from "@/components/withdrawals/WithdrawalForm";
import { WithdrawalList } from "@/components/withdrawals/WithdrawalList";
import { useMyWithdrawals } from "@/hooks/use-my-withdrawals";
import { useAuth } from "@/lib/auth";
import type { Withdrawal } from "@/lib/withdrawals";
import { formatUsd } from "@/i18n/format";

export default function Withdraw() {
  const { t } = useTranslation();
  const { user, isLoading: authLoading } = useAuth();
  const { withdrawals, balances, loading, error, reload } = useMyWithdrawals();
  const [justRequested, setJustRequested] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const totalAvailable = balances.reduce(
    (sum, balance) => sum + Number(balance.availableUsd),
    0,
  );

  const handleRequested = (withdrawal: Withdrawal) => {
    setJustRequested(withdrawal.id);
    toast.success(t("withdraw.toastTitle"), {
      description: t("withdraw.toastText", {
        amount: formatUsd(Number(withdrawal.amountUsd)),
        symbol: withdrawal.symbol,
      }),
    });
    void reload().catch(() => undefined);
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      await reload();
      toast.success(t("withdraw.updated"));
    } catch (refreshError) {
      toast.error(t("withdraw.refreshFailed"), {
        description:
          refreshError instanceof Error ? refreshError.message : undefined,
      });
    } finally {
      setRefreshing(false);
    }
  };

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
          <span className="eyebrow">{t("withdraw.eyebrow")}</span>
          <h1>{t("withdraw.title")}</h1>
          <p>{t("withdraw.intro")}</p>
        </div>

        {authLoading ? (
          <p className="invest-step-placeholder" role="status">
            <LoaderCircle className="admin-spinner" size={15} />{" "}
            {t("funds.checkingAccount")}
          </p>
        ) : !user ? (
          <div className="invest-signin panel">
            <Wallet size={18} />
            <div>
              <b>{t("withdraw.signInTitle")}</b>
              <span>{t("withdraw.signInText")}</span>
            </div>
            <Link
              className="button button-primary"
              to="/account"
              state={{ returnTo: "/withdraw" }}
            >
              {t("common.signIn")}
            </Link>
          </div>
        ) : (
          <>
            <section className="panel invest-step active withdraw-panel">
              <div className="invest-step-heading">
                <div>
                  <h2>{t("withdraw.newTitle")}</h2>
                  <p>
                    {loading
                      ? t("withdraw.loadingBalances")
                      : t("withdraw.available", {
                          amount: formatUsd(totalAvailable),
                        })}
                  </p>
                </div>
              </div>
              {error && (
                <p className="transfer-form-error" role="alert">
                  {error}
                </p>
              )}
              {loading ? (
                <p className="invest-step-placeholder" role="status">
                  <LoaderCircle className="admin-spinner" size={15} />{" "}
                  {t("common.loading")}
                </p>
              ) : (
                <WithdrawalForm
                  balances={balances}
                  onRequested={handleRequested}
                />
              )}
            </section>

            <section className="funds-history" id="withdrawals">
              <div className="funds-history-heading">
                <div>
                  <span className="eyebrow">{t("funds.yourAccount")}</span>
                  <h2>{t("withdraw.listTitle")}</h2>
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
              {!loading && withdrawals.length === 0 ? (
                <div className="panel funds-empty">
                  {t("withdraw.empty")}
                </div>
              ) : (
                <WithdrawalList
                  withdrawals={withdrawals}
                  openId={justRequested}
                />
              )}
            </section>
          </>
        )}

        <p className="funds-disclaimer">
          {t("withdraw.disclaimer")}
        </p>
      </section>
    </main>
  );
}

import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, LoaderCircle, RefreshCw, Wallet } from "lucide-react";
import { WithdrawalForm } from "@/components/withdrawals/WithdrawalForm";
import { WithdrawalList } from "@/components/withdrawals/WithdrawalList";
import { useMyWithdrawals } from "@/hooks/use-my-withdrawals";
import { useAuth } from "@/lib/auth";
import type { Withdrawal } from "@/lib/withdrawals";

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export default function Withdraw() {
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
    toast.success("Withdrawal requested", {
      description: `${usd.format(Number(withdrawal.amountUsd))} from ${withdrawal.symbol} · Pending`,
    });
    void reload().catch(() => undefined);
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      await reload();
      toast.success("Withdrawals updated");
    } catch (refreshError) {
      toast.error("Couldn't refresh your withdrawals", {
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
        <Link className="funds-back" to="/portfolio">
          <ArrowLeft size={15} /> Back to portfolio
        </Link>
      </header>

      <section className="funds-content">
        <div className="funds-heading">
          <span className="eyebrow">WITHDRAW FUNDS</span>
          <h1>Withdraw</h1>
          <p>
            Request a withdrawal from one of your investments. An admin
            processes it and sends the funds to your wallet.
          </p>
        </div>

        {authLoading ? (
          <p className="invest-step-placeholder" role="status">
            <LoaderCircle className="admin-spinner" size={15} /> Checking your
            account…
          </p>
        ) : !user ? (
          <div className="invest-signin panel">
            <Wallet size={18} />
            <div>
              <b>Sign in to withdraw</b>
              <span>You need an account with investments to withdraw.</span>
            </div>
            <Link
              className="button button-primary"
              to="/account"
              state={{ returnTo: "/withdraw" }}
            >
              Sign in
            </Link>
          </div>
        ) : (
          <>
            <section className="panel invest-step active withdraw-panel">
              <div className="invest-step-heading">
                <div>
                  <h2>New withdrawal</h2>
                  <p>
                    {loading
                      ? "Loading your balances…"
                      : `${usd.format(totalAvailable)} available across your investments.`}
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
                  <LoaderCircle className="admin-spinner" size={15} /> Loading…
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
                  <span className="eyebrow">YOUR ACCOUNT</span>
                  <h2>Your withdrawals</h2>
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
              {!loading && withdrawals.length === 0 ? (
                <div className="panel funds-empty">
                  No withdrawals yet. Requests you make appear here with their
                  status.
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
          Northstar never asks for your wallet keys or recovery phrase. Check
          your wallet address carefully; crypto transfers can't be reversed.
        </p>
      </section>
    </main>
  );
}

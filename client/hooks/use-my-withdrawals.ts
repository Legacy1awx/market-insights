import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import i18n from "@/i18n";
import { formatUsd } from "@/i18n/format";
import { useAuth } from "@/lib/auth";
import {
  fetchMyWithdrawals,
  type Withdrawal,
  type WithdrawalBalance,
} from "@/lib/withdrawals";

const POLL_INTERVAL_MS = 15_000;

function announce(withdrawal: Withdrawal) {
  const { t } = i18n;
  const amount = t("withdrawal.amountFrom", {
    amount: formatUsd(Number(withdrawal.amountUsd)),
    symbol: withdrawal.symbol,
  });
  if (withdrawal.status === "processing")
    toast.info(t("withdrawal.toast.processing"), { description: amount });
  if (withdrawal.status === "completed")
    toast.success(t("withdrawal.toast.completed"), { description: amount });
  if (withdrawal.status === "rejected")
    toast.error(t("withdrawal.toast.rejected"), {
      description: withdrawal.adminNote ?? amount,
    });
}

/**
 * Loads the signed-in user's withdrawals and balances, polls while the tab is
 * visible, and notifies the user whenever an admin changes a status.
 */
export function useMyWithdrawals() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [balances, setBalances] = useState<WithdrawalBalance[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const knownStatuses = useRef<Map<string, Withdrawal["status"]> | null>(null);

  const load = useCallback(async () => {
    const result = await fetchMyWithdrawals();
    const previous = knownStatuses.current;
    if (previous) {
      for (const withdrawal of result.withdrawals) {
        const before = previous.get(withdrawal.id);
        if (before && before !== withdrawal.status) announce(withdrawal);
      }
    }
    knownStatuses.current = new Map(
      result.withdrawals.map((item) => [item.id, item.status]),
    );
    setWithdrawals(result.withdrawals);
    setBalances(result.balances);
    setError("");
  }, []);

  useEffect(() => {
    knownStatuses.current = null;
    setWithdrawals([]);
    setBalances([]);
    setError("");
    if (!userId) return;
    let active = true;
    setLoading(true);
    load()
      .catch((loadError: unknown) => {
        if (active)
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Your withdrawals couldn't be loaded.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible")
        void load().catch(() => undefined);
    }, POLL_INTERVAL_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [load, userId]);

  return { withdrawals, balances, loading, error, reload: load };
}

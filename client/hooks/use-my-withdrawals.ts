import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import {
  fetchMyWithdrawals,
  type Withdrawal,
  type WithdrawalBalance,
} from "@/lib/withdrawals";

const POLL_INTERVAL_MS = 15_000;

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function announce(withdrawal: Withdrawal) {
  const amount = `${usd.format(Number(withdrawal.amountUsd))} from ${withdrawal.symbol}`;
  if (withdrawal.status === "processing")
    toast.info("Your withdrawal is being processed", { description: amount });
  if (withdrawal.status === "completed")
    toast.success("Your withdrawal is complete", { description: amount });
  if (withdrawal.status === "rejected")
    toast.error("Your withdrawal was rejected", {
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

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { fetchMyDeposits, type Deposit } from "@/lib/deposits";

const POLL_INTERVAL_MS = 15_000;

/**
 * Loads the signed-in user's transfers, polls while the tab is visible, and
 * notifies the user when an admin confirms or rejects a pending transfer.
 */
export function useMyDeposits() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const knownStatuses = useRef<Map<string, Deposit["status"]> | null>(null);

  const load = useCallback(async () => {
    const latest = await fetchMyDeposits();
    const previous = knownStatuses.current;
    if (previous) {
      for (const deposit of latest) {
        if (previous.get(deposit.id) !== "pending") continue;
        if (deposit.status === "confirmed") {
          toast.success(`Your ${deposit.symbol} transfer was confirmed`, {
            description: `${deposit.amount} ${deposit.symbol} has been added to your investments.`,
          });
        } else if (deposit.status === "rejected") {
          toast.error(`Your ${deposit.symbol} transfer was rejected`, {
            description: deposit.reviewNote ?? "Open the transfer for details.",
          });
        }
      }
    }
    knownStatuses.current = new Map(
      latest.map((item) => [item.id, item.status]),
    );
    setDeposits(latest);
    setError("");
  }, []);

  useEffect(() => {
    knownStatuses.current = null;
    setDeposits([]);
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
              : "Your transfers couldn't be loaded.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void load().catch(() => undefined);
      }
    }, POLL_INTERVAL_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [load, userId]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
      toast.success("Transfers updated");
    } catch (refreshError) {
      toast.error("Couldn't refresh your transfers", {
        description:
          refreshError instanceof Error ? refreshError.message : undefined,
      });
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  /** Adds a just-submitted transfer without waiting for the next poll. */
  const addDeposit = useCallback((deposit: Deposit) => {
    knownStatuses.current?.set(deposit.id, deposit.status);
    setDeposits((current) => [
      deposit,
      ...current.filter((item) => item.id !== deposit.id),
    ]);
  }, []);

  return { deposits, loading, refreshing, error, refresh, addDeposit };
}

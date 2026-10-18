import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  LoaderCircle,
  Undo2,
  X,
} from "lucide-react";
import { findDepositAsset } from "@shared/deposit-assets";
import type { WithdrawalStatus } from "@shared/withdrawals";
import { CopyButton } from "@/components/funds/CopyButton";
import { TokenIcon } from "@/components/funds/TokenIcon";
import { WithdrawalStatusBadge } from "@/components/withdrawals/WithdrawalList";
import { WithdrawalTimeline } from "@/components/withdrawals/WithdrawalTimeline";
import { formatDateTime } from "@/lib/api";
import type { Withdrawal } from "@/lib/withdrawals";

type AdminRequest = <T>(path: string, init?: RequestInit) => Promise<T>;

export type AdminWithdrawal = Withdrawal & {
  user: { id: string; email: string | null; fullName: string | null };
  investmentValueUsd: string | null;
};

type WithdrawalPage = {
  withdrawals: AdminWithdrawal[];
  page: number;
  total: number;
  lastPage: number;
};

type Filter = "all" | WithdrawalStatus;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "processing", label: "Processing" },
  { value: "completed", label: "Completed" },
  { value: "rejected", label: "Rejected" },
];

const POLL_INTERVAL_MS = 15_000;

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

/** Admin queue of withdrawal requests with status controls. */
export function AdminWithdrawals({
  request,
  onOpenProfile,
}: {
  request: AdminRequest;
  onOpenProfile: (userId: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>("pending");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<WithdrawalPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(
    () =>
      request<WithdrawalPage>(
        `/withdrawals?status=${filter}&page=${page}`,
      ).then((result) => {
        setData(result);
        setError("");
      }),
    [filter, page, request],
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    load()
      .catch((loadError: unknown) => {
        if (active)
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Withdrawals couldn't be loaded.",
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
  }, [load]);

  const setStatus = async (
    withdrawal: AdminWithdrawal,
    status: WithdrawalStatus,
  ) => {
    const note = notes[withdrawal.id]?.trim() ?? "";
    const amount = usd.format(Number(withdrawal.amountUsd));
    if (status === "rejected" && !note) {
      setError("Add a note explaining why the withdrawal was rejected.");
      return;
    }
    if (
      status === "completed" &&
      !window.confirm(
        `Mark this withdrawal as completed?\n\nOnly do this after you've sent the funds. ${amount} will be deducted from the user's ${withdrawal.symbol} investment.`,
      )
    )
      return;
    if (
      status === "rejected" &&
      !window.confirm(`Reject this ${amount} withdrawal? This can't be undone.`)
    )
      return;
    setBusyId(withdrawal.id);
    setError("");
    try {
      await request<void>(`/withdrawals/${withdrawal.id}/status`, {
        method: "POST",
        body: JSON.stringify({ status, note }),
      });
      setNotes((current) => ({ ...current, [withdrawal.id]: "" }));
      toast.success(
        {
          pending: "Withdrawal set to pending",
          processing: "Withdrawal set to processing",
          completed: "Withdrawal completed",
          rejected: "Withdrawal rejected",
        }[status],
        {
          description:
            status === "completed"
              ? `${amount} deducted from the user's ${withdrawal.symbol} investment.`
              : `${amount} from ${withdrawal.symbol}`,
        },
      );
      await load();
    } catch (statusError) {
      setError(
        statusError instanceof Error
          ? statusError.message
          : "The withdrawal couldn't be updated.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const withdrawals = data?.withdrawals ?? [];

  return (
    <div className="panel admin-panel">
      <div className="admin-panel-heading">
        <div>
          <h2>Withdrawal requests</h2>
          <p>
            Move requests from Pending to Processing while you send the funds,
            then mark them Completed. Completing deducts the amount from the
            user's investment; rejecting releases it.
          </p>
          <span className="admin-live-refresh">
            <i /> Updates automatically every 15 seconds
          </span>
        </div>
        <select
          className="admin-filter-select"
          value={filter}
          aria-label="Filter by status"
          onChange={(event) => {
            setFilter(event.target.value as Filter);
            setPage(1);
          }}
        >
          {FILTERS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="admin-message error" role="alert">
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="admin-panel-loading">
          <LoaderCircle className="admin-spinner" size={18} /> Loading
          withdrawals…
        </div>
      ) : withdrawals.length === 0 ? (
        <div className="admin-empty">
          {filter === "all"
            ? "No withdrawal requests yet."
            : `No ${filter} withdrawals.`}
        </div>
      ) : (
        <div className="admin-withdrawal-list">
          {withdrawals.map((withdrawal) => {
            const busy = busyId === withdrawal.id;
            const open =
              withdrawal.status === "pending" ||
              withdrawal.status === "processing";
            const asset = findDepositAsset(withdrawal.symbol);
            const value = withdrawal.investmentValueUsd;
            const shortfall =
              value !== null &&
              Number(withdrawal.amountUsd) > Number(value) &&
              open;
            return (
              <article className="admin-withdrawal" key={withdrawal.id}>
                <div className="admin-withdrawal-top">
                  <div className="admin-withdrawal-amount">
                    <TokenIcon symbol={withdrawal.symbol} size="lg" />
                    <div>
                      <span>
                        From {asset?.name ?? withdrawal.symbol} investment
                      </span>
                      <h3>{usd.format(Number(withdrawal.amountUsd))}</h3>
                    </div>
                  </div>
                  <WithdrawalStatusBadge status={withdrawal.status} />
                </div>

                <div className="admin-withdrawal-user">
                  <button
                    type="button"
                    className="admin-user-profile-link"
                    onClick={() => onOpenProfile(withdrawal.user.id)}
                  >
                    {withdrawal.user.fullName || "Northstar user"}
                  </button>
                  <span>{withdrawal.user.email ?? "Email unavailable"}</span>
                </div>

                <dl className="transfer-facts">
                  <div className="transfer-fact-wide">
                    <dt>
                      Send to
                      {asset
                        ? ` · ${withdrawal.symbol} on ${asset.network}`
                        : ""}
                    </dt>
                    <dd className="transfer-mono-row">
                      <code>{withdrawal.destinationAddress}</code>
                      <CopyButton
                        compact
                        value={withdrawal.destinationAddress}
                        label="Wallet address"
                      />
                    </dd>
                  </div>
                  <div>
                    <dt>Investment value now</dt>
                    <dd className={shortfall ? "negative-text" : undefined}>
                      {value === null
                        ? "No investment"
                        : usd.format(Number(value))}
                    </dd>
                  </div>
                  <div>
                    <dt>Requested</dt>
                    <dd>{formatDateTime(withdrawal.createdAt)}</dd>
                  </div>
                </dl>

                {shortfall && (
                  <p className="admin-withdrawal-warning" role="note">
                    The investment is currently worth less than this request, so
                    it can't be completed as is. Reject it or ask the user to
                    request a smaller amount.
                  </p>
                )}

                <WithdrawalTimeline withdrawal={withdrawal} audience="admin" />

                {open ? (
                  <div className="admin-withdrawal-actions">
                    <label className="admin-review-note">
                      Note to the user
                      <textarea
                        rows={2}
                        maxLength={500}
                        value={notes[withdrawal.id] ?? ""}
                        onChange={(event) =>
                          setNotes((current) => ({
                            ...current,
                            [withdrawal.id]: event.target.value,
                          }))
                        }
                        placeholder="Optional; required to reject."
                      />
                    </label>
                    <div className="admin-row-actions">
                      {withdrawal.status === "pending" ? (
                        <button
                          className="button button-subtle button-small"
                          disabled={busy}
                          onClick={() =>
                            void setStatus(withdrawal, "processing")
                          }
                        >
                          <Clock size={13} /> Set to processing
                        </button>
                      ) : (
                        <button
                          className="button button-subtle button-small"
                          disabled={busy}
                          onClick={() => void setStatus(withdrawal, "pending")}
                        >
                          <Undo2 size={13} /> Set back to pending
                        </button>
                      )}
                      <button
                        className="button button-primary button-small"
                        disabled={busy || shortfall}
                        onClick={() => void setStatus(withdrawal, "completed")}
                      >
                        {busy ? (
                          <LoaderCircle className="admin-spinner" size={13} />
                        ) : (
                          <Check size={13} />
                        )}
                        Mark completed
                      </button>
                      <button
                        className="button button-subtle button-small danger"
                        disabled={busy}
                        onClick={() => void setStatus(withdrawal, "rejected")}
                      >
                        <X size={13} /> Reject
                      </button>
                    </div>
                  </div>
                ) : (
                  withdrawal.adminNote && (
                    <p className="transfer-note">
                      <b>Admin note</b>
                      {withdrawal.adminNote}
                    </p>
                  )
                )}
              </article>
            );
          })}
        </div>
      )}

      {data && data.lastPage > 1 && (
        <div className="admin-pagination">
          <span>
            {data.total} requests · page {data.page} of {data.lastPage}
          </span>
          <div>
            <button
              className="button button-subtle button-small"
              disabled={page <= 1}
              onClick={() => setPage((current) => current - 1)}
            >
              <ChevronLeft size={14} /> Previous
            </button>
            <button
              className="button button-subtle button-small"
              disabled={page >= data.lastPage}
              onClick={() => setPage((current) => current + 1)}
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

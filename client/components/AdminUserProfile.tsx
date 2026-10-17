import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ArrowDownRight,
  Check,
  ArrowUpRight,
  CircleAlert,
  LoaderCircle,
  Pause,
  RefreshCw,
  Trash2,
  Waves,
} from "lucide-react";
import { InvestmentHistoryChart } from "@/components/InvestmentHistoryChart";
import { TransferList } from "@/components/funds/TransferList";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  INTERVAL_ERROR,
  describeMovement,
  intervalToSeconds,
  secondsToInterval,
  type IntervalUnit,
} from "@/lib/movement";
import { cn } from "@/lib/utils";
import type {
  AdminAccount,
  AdminDepositPage,
  Deposit,
  ManagedInvestment,
} from "@/pages/Admin";

type AdminRequest = <T>(path: string, init?: RequestInit) => Promise<T>;
type Movement = ManagedInvestment["movementDirection"];

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const movementOptions: {
  value: Movement;
  label: string;
  title: string;
  icon: typeof ArrowUpRight;
}[] = [
  {
    value: "up",
    label: "Up",
    title: "Increase the value by the movement amount once per interval",
    icon: ArrowUpRight,
  },
  {
    value: "down",
    label: "Down",
    title: "Decrease the value by the movement amount once per interval",
    icon: ArrowDownRight,
  },
  {
    value: "continuous",
    label: "Continuous",
    title: "Fluctuate up or down by the movement amount once per interval",
    icon: Waves,
  },
  {
    value: "paused",
    label: "Pause",
    title: "Stop moving and hold the current value",
    icon: Pause,
  },
];

type MovementDraft = {
  direction: Movement;
  amount: string;
  every: string;
  unit: IntervalUnit;
};

function draftFor(investment: ManagedInvestment): MovementDraft {
  const interval = secondsToInterval(investment.movementIntervalSeconds);
  return {
    direction: investment.movementDirection,
    amount: investment.movementAmount,
    every: interval.value,
    unit: interval.unit,
  };
}

/** True when the draft would change what is saved for this investment. */
function isChanged(draft: MovementDraft, investment: ManagedInvestment) {
  return (
    draft.direction !== investment.movementDirection ||
    Number(draft.amount) !== Number(investment.movementAmount) ||
    intervalToSeconds(draft.every, draft.unit) !==
      investment.movementIntervalSeconds
  );
}

export function AdminUserProfile({
  account,
  request,
  onClose,
  onDelete,
  onManageInvestments,
  onReviewTransfers,
  onChanged,
}: {
  account: AdminAccount | null;
  request: AdminRequest;
  onClose: () => void;
  onDelete?: (account: AdminAccount) => Promise<boolean>;
  onManageInvestments: (account: AdminAccount) => void;
  onReviewTransfers: (account: AdminAccount) => void;
  onChanged: () => void;
}) {
  const [investments, setInvestments] = useState<ManagedInvestment[]>([]);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [depositTotal, setDepositTotal] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, MovementDraft>>({});
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const accountId = account?.id ?? null;

  const loadInvestments = useCallback(async () => {
    if (!accountId) return;
    const data = await request<ManagedInvestment[]>(
      `/investments?userId=${encodeURIComponent(accountId)}`,
    );
    setInvestments(data);
    // Keep unsaved edits across background refreshes; drop removed records.
    setDrafts((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([id]) =>
          data.some((investment) => investment.id === id),
        ),
      ),
    );
  }, [accountId, request]);

  const loadProfile = useCallback(async () => {
    if (!accountId) return;
    const [, depositPage] = await Promise.all([
      loadInvestments(),
      request<AdminDepositPage>(
        `/deposits?status=all&page=1&userId=${encodeURIComponent(accountId)}`,
      ),
    ]);
    setDeposits(depositPage.deposits);
    setDepositTotal(depositPage.total);
  }, [accountId, loadInvestments, request]);

  useEffect(() => {
    setInvestments([]);
    setDeposits([]);
    setDepositTotal(0);
    setDrafts({});
    setError("");
    if (!accountId) return;
    let active = true;
    setLoading(true);
    loadProfile()
      .catch((requestError: unknown) => {
        if (active)
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Could not load this user's profile.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadInvestments().catch(() => undefined);
      }
    }, 10_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [accountId, loadInvestments, loadProfile]);

  const refresh = async () => {
    setRefreshing(true);
    setError("");
    try {
      await loadProfile();
      toast.success("Profile refreshed");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not refresh this profile.",
      );
    } finally {
      setRefreshing(false);
    }
  };

  const updateDraft = (
    investment: ManagedInvestment,
    change: Partial<MovementDraft>,
  ) =>
    setDrafts((current) => {
      const next = {
        ...(current[investment.id] ?? draftFor(investment)),
        ...change,
      };
      const { [investment.id]: _previous, ...rest } = current;
      return isChanged(next, investment)
        ? { ...rest, [investment.id]: next }
        : rest;
    });

  const discardDraft = (investment: ManagedInvestment) =>
    setDrafts((current) => {
      const { [investment.id]: _discarded, ...rest } = current;
      return rest;
    });

  const unsavedCount = investments.filter(
    (investment) =>
      drafts[investment.id] && isChanged(drafts[investment.id], investment),
  ).length;

  useEffect(() => {
    if (!unsavedCount) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsavedCount]);

  const requestClose = () => {
    if (
      unsavedCount &&
      !window.confirm(
        "You have movement changes that haven't been set. Close and discard them?",
      )
    )
      return;
    onClose();
  };

  const saveMovement = async (investment: ManagedInvestment) => {
    const draft = drafts[investment.id];
    if (!draft) return;
    const movementAmount = draft.amount.trim();
    const movementIntervalSeconds = intervalToSeconds(draft.every, draft.unit);
    if (!movementIntervalSeconds) {
      setError(INTERVAL_ERROR);
      return;
    }
    if (
      !/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/.test(movementAmount) ||
      Number(movementAmount) <= 0
    ) {
      setError(
        "Movement amount must be a positive USD value with up to two decimal places.",
      );
      return;
    }
    setBusyId(investment.id);
    setError("");
    try {
      await request<void>(`/investments/${investment.id}/movement`, {
        method: "PATCH",
        body: JSON.stringify({
          movementDirection: draft.direction,
          movementAmount,
          movementIntervalSeconds,
        }),
      });
      discardDraft(investment);
      await loadInvestments();
      onChanged();
      toast.success(`${investment.symbol} movement set`, {
        description:
          draft.direction === "paused"
            ? "Paused. The value will hold where it is."
            : describeMovement({
                movementDirection: draft.direction,
                movementAmount,
                movementIntervalSeconds,
              }),
      });
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not update the investment movement.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const totals = investments.reduce(
    (sum, investment) => ({
      invested: sum.invested + Number(investment.investedUsd),
      returned: sum.returned + Number(investment.returnUsd),
    }),
    { invested: 0, returned: 0 },
  );

  return (
    <Sheet
      open={Boolean(account)}
      onOpenChange={(open) => !open && requestClose()}
    >
      <SheetContent className="admin-profile-sheet">
        {account && (
          <>
            <SheetHeader className="admin-profile-header">
              <span className="eyebrow">USER PROFILE</span>
              <SheetTitle>{account.fullName || "Northstar user"}</SheetTitle>
              <SheetDescription>
                {account.email ?? "No email"}
                {account.phone ? ` · ${account.phone}` : ""}
              </SheetDescription>
              <div className="admin-profile-header-actions">
                <span
                  className={`admin-status ${account.emailConfirmedAt ? "active" : "pending"}`}
                >
                  {account.emailConfirmedAt ? "Email verified" : "Unverified"}
                </span>
                <span className="admin-status">{account.role}</span>
                <button
                  type="button"
                  className="button button-subtle button-small"
                  disabled={loading || refreshing}
                  onClick={() => void refresh()}
                >
                  {refreshing ? (
                    <LoaderCircle className="admin-spinner" size={13} />
                  ) : (
                    <RefreshCw size={13} />
                  )}
                  Refresh
                </button>
              </div>
            </SheetHeader>

            <dl className="admin-profile-details">
              <div>
                <dt>Joined</dt>
                <dd>{new Date(account.createdAt).toLocaleDateString()}</dd>
              </div>
              <div>
                <dt>Last sign-in</dt>
                <dd>
                  {account.lastSignInAt
                    ? new Date(account.lastSignInAt).toLocaleString()
                    : "Never"}
                </dd>
              </div>
              <div>
                <dt>Transfers submitted</dt>
                <dd>{account.depositCount}</dd>
              </div>
              <div>
                <dt>User ID</dt>
                <dd>
                  <code>{account.id}</code>
                </dd>
              </div>
            </dl>

            {error && (
              <div className="admin-message error" role="alert">
                <CircleAlert size={16} /> {error}
              </div>
            )}

            {loading ? (
              <div className="admin-panel-loading">
                <LoaderCircle className="admin-spinner" size={18} /> Loading
                profile…
              </div>
            ) : (
              <>
                <section className="admin-profile-section">
                  <div className="admin-profile-section-heading">
                    <h3>Investments</h3>
                    <button
                      type="button"
                      className="button button-subtle button-small"
                      onClick={() => onManageInvestments(account)}
                    >
                      Add or edit amounts
                    </button>
                  </div>
                  <div className="admin-profile-totals">
                    <div>
                      <span>Invested</span>
                      <b>{money.format(totals.invested)}</b>
                    </div>
                    <div>
                      <span>Return</span>
                      <b
                        className={
                          totals.returned >= 0
                            ? "positive-text"
                            : "negative-text"
                        }
                      >
                        {totals.returned >= 0 ? "+" : "−"}
                        {money.format(Math.abs(totals.returned))}
                      </b>
                    </div>
                    <div>
                      <span>Current value</span>
                      <b>{money.format(totals.invested + totals.returned)}</b>
                    </div>
                  </div>
                  {investments.length === 0 ? (
                    <div className="admin-empty">
                      No investments assigned to this user yet.
                    </div>
                  ) : (
                    investments.map((investment) => {
                      const value =
                        Number(investment.investedUsd) +
                        Number(investment.returnUsd);
                      const busy = busyId === investment.id;
                      const draft =
                        drafts[investment.id] ?? draftFor(investment);
                      const changed = Boolean(drafts[investment.id]);
                      return (
                        <article
                          className="admin-profile-investment"
                          key={investment.id}
                        >
                          <div className="admin-profile-investment-heading">
                            <div>
                              <b>{investment.symbol}</b>
                              <span>
                                Current: {describeMovement(investment)}
                              </span>
                            </div>
                            <div>
                              <b>{money.format(value)}</b>
                              <span
                                className={
                                  Number(investment.returnUsd) >= 0
                                    ? "positive-text"
                                    : "negative-text"
                                }
                              >
                                {Number(investment.returnUsd) >= 0 ? "+" : "−"}
                                {money.format(
                                  Math.abs(Number(investment.returnUsd)),
                                )}{" "}
                                on{" "}
                                {money.format(Number(investment.investedUsd))}
                              </span>
                            </div>
                          </div>
                          <InvestmentHistoryChart
                            history={investment.history}
                            currentUsd={String(value)}
                          />
                          <div className="admin-profile-movement">
                            <div className="admin-profile-movement-fields">
                              <label>
                                Amount (USD)
                                <input
                                  type="number"
                                  min="0.01"
                                  step="0.01"
                                  value={draft.amount}
                                  disabled={busy}
                                  onChange={(event) =>
                                    updateDraft(investment, {
                                      amount: event.target.value,
                                    })
                                  }
                                />
                              </label>
                              <label>
                                Every
                                <span className="admin-interval-input">
                                  <input
                                    type="number"
                                    min="1"
                                    max={draft.unit === "hours" ? 24 : 1440}
                                    step="1"
                                    value={draft.every}
                                    disabled={busy}
                                    onChange={(event) =>
                                      updateDraft(investment, {
                                        every: event.target.value,
                                      })
                                    }
                                  />
                                  <select
                                    aria-label="Interval unit"
                                    value={draft.unit}
                                    disabled={busy}
                                    onChange={(event) =>
                                      updateDraft(investment, {
                                        unit: event.target
                                          .value as IntervalUnit,
                                      })
                                    }
                                  >
                                    <option value="minutes">Minutes</option>
                                    <option value="hours">Hours</option>
                                  </select>
                                </span>
                              </label>
                            </div>
                            <div
                              className="admin-profile-movement-buttons"
                              role="group"
                              aria-label={`${investment.symbol} movement`}
                            >
                              {movementOptions.map((option) => {
                                const Icon = option.icon;
                                const current =
                                  draft.direction === option.value;
                                return (
                                  <button
                                    key={option.value}
                                    type="button"
                                    title={option.title}
                                    aria-pressed={current}
                                    disabled={busy}
                                    className={cn(
                                      "button button-small",
                                      current
                                        ? "button-primary"
                                        : "button-subtle",
                                      `movement-${option.value}`,
                                    )}
                                    onClick={() =>
                                      updateDraft(investment, {
                                        direction: option.value,
                                      })
                                    }
                                  >
                                    <Icon size={13} />
                                    {option.label}
                                  </button>
                                );
                              })}
                            </div>
                            {changed && (
                              <div
                                className="admin-profile-unsaved"
                                role="status"
                              >
                                <span>
                                  Not set yet. Click Set to apply these changes.
                                </span>
                                <button
                                  type="button"
                                  className="button button-subtle button-small"
                                  disabled={busy}
                                  onClick={() => discardDraft(investment)}
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  className="button button-primary button-small"
                                  disabled={busy}
                                  onClick={() => void saveMovement(investment)}
                                >
                                  {busy ? (
                                    <LoaderCircle
                                      className="admin-spinner"
                                      size={13}
                                    />
                                  ) : (
                                    <Check size={13} />
                                  )}
                                  Set
                                </button>
                              </div>
                            )}
                          </div>
                        </article>
                      );
                    })
                  )}
                </section>

                <section className="admin-profile-section">
                  <div className="admin-profile-section-heading">
                    <h3>Transfers</h3>
                    <span className="admin-count">{depositTotal} total</span>
                  </div>
                  {deposits.length === 0 ? (
                    <div className="admin-empty">
                      This user hasn't submitted any transfers.
                    </div>
                  ) : (
                    <TransferList
                      audience="admin"
                      transfers={deposits}
                      actions={(deposit) =>
                        deposit.status === "pending" ? (
                          <button
                            type="button"
                            className="button button-primary button-small"
                            onClick={() => onReviewTransfers(account)}
                          >
                            Review transfer
                          </button>
                        ) : deposit.reviewedBy ? (
                          <span className="admin-profile-reviewer">
                            Reviewed by {deposit.reviewedBy}
                          </span>
                        ) : null
                      }
                    />
                  )}
                </section>

                {onDelete && (
                  <section className="admin-profile-section admin-profile-danger">
                    <div>
                      <h3>Delete user</h3>
                      <p>
                        Permanently removes this account's sign-in, transfer
                        submissions, and assigned investments.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="button button-subtle button-small danger"
                      disabled={deleting}
                      onClick={async () => {
                        setDeleting(true);
                        try {
                          await onDelete(account);
                        } finally {
                          setDeleting(false);
                        }
                      }}
                    >
                      {deleting ? (
                        <LoaderCircle className="admin-spinner" size={13} />
                      ) : (
                        <Trash2 size={13} />
                      )}
                      Delete user
                    </button>
                  </section>
                )}
              </>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

import type { WithdrawalStatus } from "@shared/withdrawals";
import { authorizedFetch } from "@/lib/api";

export type { WithdrawalStatus } from "@shared/withdrawals";

export type WithdrawalEvent = {
  status: WithdrawalStatus;
  note: string | null;
  at: string;
};

export type Withdrawal = {
  id: string;
  symbol: string;
  amountUsd: string;
  destinationAddress: string;
  status: WithdrawalStatus;
  adminNote: string | null;
  createdAt: string;
  updatedAt: string;
  history: WithdrawalEvent[];
};

/** What the user holds in one investment and how much can be withdrawn. */
export type WithdrawalBalance = {
  symbol: string;
  valueUsd: string;
  reservedUsd: string;
  availableUsd: string;
};

export type MyWithdrawals = {
  balances: WithdrawalBalance[];
  withdrawals: Withdrawal[];
};

export const WITHDRAWAL_STATUS_LABELS: Record<WithdrawalStatus, string> = {
  pending: "Pending",
  processing: "Processing",
  completed: "Completed",
  rejected: "Rejected",
};

const ERROR_MESSAGES: Record<string, string> = {
  insufficient_balance:
    "That's more than you can withdraw from this investment right now.",
  too_many_open_withdrawals:
    "You already have several withdrawals in progress. Wait for them to finish before requesting another.",
  withdrawals_migration_required:
    "Withdrawals aren't available yet. Please try again later.",
  withdrawals_unavailable:
    "Withdrawals are temporarily unavailable. Please try again shortly.",
};

export function fetchMyWithdrawals() {
  return authorizedFetch<MyWithdrawals>(
    "/api/withdrawals/mine",
    {},
    ERROR_MESSAGES,
  );
}

export function requestWithdrawal(request: {
  symbol: string;
  amountUsd: string;
  destinationAddress: string;
}) {
  return authorizedFetch<Withdrawal>(
    "/api/withdrawals",
    { method: "POST", body: JSON.stringify(request) },
    ERROR_MESSAGES,
  );
}

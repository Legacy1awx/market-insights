import { authorizedFetch } from "@/lib/api";

// Re-exported so existing imports from "@/lib/deposits" keep working.
export { formatDateTime, shortenMiddle } from "@/lib/api";

export type DepositStatus = "pending" | "confirmed" | "rejected";

/** A transfer the signed-in user submitted for admin review. */
export type Deposit = {
  id: string;
  symbol: string;
  network: string;
  amount: string;
  transactionHash: string;
  senderAddress: string | null;
  recipientAddress: string;
  status: DepositStatus;
  reviewNote: string | null;
  reviewedAt: string | null;
  submittedAt: string;
};

export type DepositSubmission = {
  symbol: string;
  amount: string;
  transactionHash: string;
  senderAddress: string;
};

export const STATUS_LABELS: Record<DepositStatus, string> = {
  pending: "Awaiting confirmation",
  confirmed: "Confirmed",
  rejected: "Rejected",
};

const ERROR_MESSAGES: Record<string, string> = {
  transaction_already_submitted:
    "That transaction has already been submitted for review.",
  too_many_pending_submissions:
    "You have too many transfers awaiting confirmation. Wait for an admin to review them before adding another.",
  deposit_history_unavailable:
    "Your transfers couldn't be loaded. Please try again shortly.",
  deposit_submission_unavailable:
    "Your transfer couldn't be submitted right now. Please try again shortly.",
};

export async function fetchMyDeposits() {
  return authorizedFetch<Deposit[]>("/api/deposits/mine", {}, ERROR_MESSAGES);
}

export async function submitDeposit(submission: DepositSubmission) {
  return authorizedFetch<Deposit>(
    "/api/deposits",
    { method: "POST", body: JSON.stringify(submission) },
    ERROR_MESSAGES,
  );
}

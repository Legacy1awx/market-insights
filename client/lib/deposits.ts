import { supabase } from "@/lib/supabase";

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

async function authorizedFetch(path: string, init: RequestInit = {}) {
  if (!supabase) throw new Error("Sign-in is not configured.");
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data.session?.access_token;
  if (!token)
    throw new Error("Your session has expired. Please sign in again.");
  const response = await fetch(path, {
    ...init,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const failure = body as {
      error?: string;
      details?: Record<string, string[]>;
    } | null;
    const detail = failure?.details
      ? Object.values(failure.details).flat()[0]
      : undefined;
    throw new Error(
      detail ??
        ERROR_MESSAGES[failure?.error ?? ""] ??
        "Something went wrong. Please try again.",
    );
  }
  return body;
}

export async function fetchMyDeposits() {
  return (await authorizedFetch("/api/deposits/mine")) as Deposit[];
}

export async function submitDeposit(submission: DepositSubmission) {
  return (await authorizedFetch("/api/deposits", {
    method: "POST",
    body: JSON.stringify(submission),
  })) as Deposit;
}

export function formatDateTime(value: string | null) {
  return value
    ? new Date(value).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "—";
}

export function shortenMiddle(value: string, keep = 8) {
  return value.length > keep * 2 + 3
    ? `${value.slice(0, keep)}…${value.slice(-keep)}`
    : value;
}

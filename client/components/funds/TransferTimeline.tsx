import { Check, Clock, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateTime, type DepositStatus } from "@/lib/deposits";

type Step = {
  title: string;
  detail: string;
  state: "done" | "current" | "upcoming" | "failed";
};

/** Submitted → Under review → Confirmed/Rejected, as a vertical tracker. */
export function TransferTimeline({
  status,
  submittedAt,
  reviewedAt,
  symbol,
  audience = "user",
}: {
  status: DepositStatus;
  submittedAt: string;
  reviewedAt: string | null;
  symbol: string;
  /** Admins read "their investment" instead of "your investment". */
  audience?: "user" | "admin";
}) {
  const owner = audience === "admin" ? "their" : "your";
  const steps: Step[] = [
    {
      title: "Transfer submitted",
      detail: formatDateTime(submittedAt),
      state: "done",
    },
    {
      title: "Admin verification",
      detail:
        status === "pending"
          ? "An admin is checking the transaction on the blockchain."
          : "Transaction checked on the blockchain.",
      state: status === "pending" ? "current" : "done",
    },
    status === "rejected"
      ? {
          title: "Rejected",
          detail: `${formatDateTime(reviewedAt)} · No funds were added.`,
          state: "failed",
        }
      : {
          title: `Added to ${owner} ${symbol} investment`,
          detail:
            status === "confirmed"
              ? formatDateTime(reviewedAt)
              : "Happens as soon as the transfer is confirmed.",
          state: status === "confirmed" ? "done" : "upcoming",
        },
  ];

  return (
    <ol className="transfer-timeline">
      {steps.map((step) => (
        <li key={step.title} className={cn("transfer-step", step.state)}>
          <span className="transfer-step-dot" aria-hidden="true">
            {step.state === "done" && <Check size={11} />}
            {step.state === "current" && <Clock size={11} />}
            {step.state === "failed" && <X size={11} />}
          </span>
          <div>
            <b>{step.title}</b>
            <span>{step.detail}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}

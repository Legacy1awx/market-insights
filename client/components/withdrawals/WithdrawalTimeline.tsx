import { Check, Clock, X } from "lucide-react";
import { formatDateTime } from "@/lib/api";
import type { Withdrawal, WithdrawalStatus } from "@/lib/withdrawals";
import { cn } from "@/lib/utils";

type StepState = "done" | "current" | "upcoming" | "failed";

/** Requested → Processing → Completed (or Rejected), as a vertical tracker. */
export function WithdrawalTimeline({
  withdrawal,
  audience = "user",
}: {
  withdrawal: Pick<Withdrawal, "status" | "history" | "createdAt" | "symbol">;
  audience?: "user" | "admin";
}) {
  const { status, history, symbol } = withdrawal;
  const reachedAt = (target: WithdrawalStatus) =>
    [...history].reverse().find((event) => event.status === target)?.at ?? null;
  const owner = audience === "admin" ? "their" : "your";

  const steps: { title: string; detail: string; state: StepState }[] = [
    {
      title: "Withdrawal requested",
      detail: formatDateTime(withdrawal.createdAt),
      state: "done",
    },
    {
      title: "Processing",
      detail:
        status === "pending"
          ? "Waiting for an admin to start processing."
          : status === "rejected" && !reachedAt("processing")
            ? "Not processed."
            : formatDateTime(reachedAt("processing")),
      state:
        status === "pending" || status === "processing"
          ? "current"
          : status === "rejected" && !reachedAt("processing")
            ? "upcoming"
            : "done",
    },
    status === "rejected"
      ? {
          title: "Rejected",
          detail: `${formatDateTime(reachedAt("rejected"))} · Nothing was deducted.`,
          state: "failed",
        }
      : {
          title: `Sent to ${owner} wallet`,
          detail:
            status === "completed"
              ? `${formatDateTime(reachedAt("completed"))} · Deducted from ${owner} ${symbol} investment.`
              : "Happens once processing is finished.",
          state: status === "completed" ? "done" : "upcoming",
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

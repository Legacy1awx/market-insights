import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  const { status, history, symbol } = withdrawal;
  const reachedAt = (target: WithdrawalStatus) =>
    [...history].reverse().find((event) => event.status === target)?.at ?? null;
  const context = audience === "admin" ? "admin" : undefined;

  const steps: { title: string; detail: string; state: StepState }[] = [
    {
      title: t("timeline.withdrawal.requested"),
      detail: formatDateTime(withdrawal.createdAt),
      state: "done",
    },
    {
      title: t("status.withdrawal.processing"),
      detail:
        status === "pending"
          ? t("timeline.withdrawal.waiting")
          : status === "rejected" && !reachedAt("processing")
            ? t("timeline.withdrawal.notProcessed")
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
          title: t("status.withdrawal.rejected"),
          detail: `${formatDateTime(reachedAt("rejected"))} · ${t("timeline.withdrawal.nothingDeducted")}`,
          state: "failed",
        }
      : {
          title: t("timeline.withdrawal.sent", { context }),
          detail:
            status === "completed"
              ? `${formatDateTime(reachedAt("completed"))} · ${t("timeline.withdrawal.deducted", { symbol, context })}`
              : t("timeline.withdrawal.sentLater"),
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

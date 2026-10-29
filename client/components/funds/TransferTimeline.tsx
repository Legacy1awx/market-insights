import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  const context = audience === "admin" ? "admin" : undefined;
  const steps: Step[] = [
    {
      title: t("timeline.deposit.submitted"),
      detail: formatDateTime(submittedAt),
      state: "done",
    },
    {
      title: t("timeline.deposit.verification"),
      detail:
        status === "pending"
          ? t("timeline.deposit.checking")
          : t("timeline.deposit.checked"),
      state: status === "pending" ? "current" : "done",
    },
    status === "rejected"
      ? {
          title: t("status.deposit.rejected"),
          detail: `${formatDateTime(reviewedAt)} · ${t("timeline.deposit.noFunds")}`,
          state: "failed",
        }
      : {
          title: t("timeline.deposit.added", { symbol, context }),
          detail:
            status === "confirmed"
              ? formatDateTime(reviewedAt)
              : t("timeline.deposit.addedLater"),
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

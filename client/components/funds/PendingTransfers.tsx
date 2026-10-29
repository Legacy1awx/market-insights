import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import type { Deposit } from "@/lib/deposits";
import { formatDateTime } from "@/lib/deposits";
import { TokenIcon } from "./TokenIcon";
import { TransferStatusBadge } from "./TransferList";

/** Compact list of transfers still waiting for an admin, for the portfolio. */
export function PendingTransfers({ deposits }: { deposits: Deposit[] }) {
  const { t } = useTranslation();
  const pending = deposits.filter((deposit) => deposit.status === "pending");
  if (pending.length === 0) return null;
  return (
    <div className="pending-transfers" role="status">
      <div className="pending-transfers-heading">
        <b>
          {t("pending.title", { count: pending.length })}
        </b>
        <Link to="/send#transfers">{t("pending.viewDetails")}</Link>
      </div>
      <ul>
        {pending.map((deposit) => (
          <li key={deposit.id}>
            <TokenIcon symbol={deposit.symbol} size="sm" />
            <span>
              <b>
                {deposit.amount} {deposit.symbol}
              </b>{" "}
              · {t("pending.sent", { date: formatDateTime(deposit.submittedAt) })}
            </span>
            <TransferStatusBadge status={deposit.status} />
          </li>
        ))}
      </ul>
    </div>
  );
}

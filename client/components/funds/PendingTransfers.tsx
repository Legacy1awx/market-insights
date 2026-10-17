import { Link } from "react-router-dom";
import type { Deposit } from "@/lib/deposits";
import { formatDateTime } from "@/lib/deposits";
import { TokenIcon } from "./TokenIcon";
import { TransferStatusBadge } from "./TransferList";

/** Compact list of transfers still waiting for an admin, for the portfolio. */
export function PendingTransfers({ deposits }: { deposits: Deposit[] }) {
  const pending = deposits.filter((deposit) => deposit.status === "pending");
  if (pending.length === 0) return null;
  return (
    <div className="pending-transfers" role="status">
      <div className="pending-transfers-heading">
        <b>
          {pending.length === 1
            ? "1 transfer is awaiting confirmation"
            : `${pending.length} transfers are awaiting confirmation`}
        </b>
        <Link to="/send#transfers">View details</Link>
      </div>
      <ul>
        {pending.map((deposit) => (
          <li key={deposit.id}>
            <TokenIcon symbol={deposit.symbol} size="sm" />
            <span>
              <b>
                {deposit.amount} {deposit.symbol}
              </b>{" "}
              · sent {formatDateTime(deposit.submittedAt)}
            </span>
            <TransferStatusBadge status={deposit.status} />
          </li>
        ))}
      </ul>
    </div>
  );
}

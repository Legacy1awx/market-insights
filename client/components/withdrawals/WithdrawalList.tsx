import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { findDepositAsset } from "@shared/deposit-assets";
import { CopyButton } from "@/components/funds/CopyButton";
import { TokenIcon } from "@/components/funds/TokenIcon";
import { formatDateTime, shortenMiddle } from "@/lib/api";
import {
  WITHDRAWAL_STATUS_LABELS,
  type Withdrawal,
  type WithdrawalStatus,
} from "@/lib/withdrawals";
import { cn } from "@/lib/utils";
import { WithdrawalTimeline } from "./WithdrawalTimeline";

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export function WithdrawalStatusBadge({
  status,
}: {
  status: WithdrawalStatus;
}) {
  return (
    <span className={`transfer-status ${status}`}>
      {WITHDRAWAL_STATUS_LABELS[status]}
    </span>
  );
}

export function WithdrawalDetails({
  withdrawal,
  audience = "user",
  actions,
}: {
  withdrawal: Withdrawal;
  audience?: "user" | "admin";
  actions?: ReactNode;
}) {
  const asset = findDepositAsset(withdrawal.symbol);
  return (
    <div className="transfer-details">
      <WithdrawalTimeline withdrawal={withdrawal} audience={audience} />
      {withdrawal.adminNote && (
        <p className={`transfer-note ${withdrawal.status}`}>
          <b>{audience === "admin" ? "Admin note" : "Note from the admin"}</b>
          {withdrawal.adminNote}
        </p>
      )}
      <dl className="transfer-facts">
        <div>
          <dt>Amount</dt>
          <dd>{usd.format(Number(withdrawal.amountUsd))}</dd>
        </div>
        <div>
          <dt>From investment</dt>
          <dd>
            {asset?.name ?? withdrawal.symbol} ({withdrawal.symbol})
          </dd>
        </div>
        <div className="transfer-fact-wide">
          <dt>Destination wallet{asset ? ` · ${asset.network}` : ""}</dt>
          <dd className="transfer-mono-row">
            <code title={withdrawal.destinationAddress}>
              {shortenMiddle(withdrawal.destinationAddress, 12)}
            </code>
            <CopyButton
              compact
              value={withdrawal.destinationAddress}
              label="Wallet address"
            />
          </dd>
        </div>
        <div>
          <dt>Requested</dt>
          <dd>{formatDateTime(withdrawal.createdAt)}</dd>
        </div>
        <div>
          <dt>Last update</dt>
          <dd>{formatDateTime(withdrawal.updatedAt)}</dd>
        </div>
      </dl>
      {actions && <div className="transfer-actions">{actions}</div>}
    </div>
  );
}

/** Expandable list of withdrawals; one opens at a time. */
export function WithdrawalList({
  withdrawals,
  openId,
  audience = "user",
}: {
  withdrawals: Withdrawal[];
  openId?: string | null;
  audience?: "user" | "admin";
}) {
  const [expanded, setExpanded] = useState<string | null>(openId ?? null);
  useEffect(() => {
    if (openId) setExpanded(openId);
  }, [openId]);

  return (
    <ul className="transfer-list">
      {withdrawals.map((withdrawal) => {
        const open = expanded === withdrawal.id;
        return (
          <li key={withdrawal.id} className={cn("transfer-item", { open })}>
            <button
              type="button"
              className="transfer-summary"
              aria-expanded={open}
              onClick={() => setExpanded(open ? null : withdrawal.id)}
            >
              <TokenIcon symbol={withdrawal.symbol} />
              <span className="transfer-summary-main">
                <b>{usd.format(Number(withdrawal.amountUsd))}</b>
                <span>
                  From {withdrawal.symbol} ·{" "}
                  {formatDateTime(withdrawal.createdAt)}
                </span>
              </span>
              <WithdrawalStatusBadge status={withdrawal.status} />
              <ChevronDown size={16} className="transfer-chevron" />
            </button>
            {open && (
              <WithdrawalDetails withdrawal={withdrawal} audience={audience} />
            )}
          </li>
        );
      })}
    </ul>
  );
}

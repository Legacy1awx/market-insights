import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import { networkLabel } from "@shared/deposit-assets";
import { formatDateTime } from "@/lib/deposits";
import { cn } from "@/lib/utils";
import { TokenIcon } from "./TokenIcon";
import { TransferDetails, type TransferRecord } from "./TransferDetails";

export function TransferStatusBadge({
  status,
}: {
  status: TransferRecord["status"];
}) {
  const { t } = useTranslation();
  return (
    <span className={`transfer-status ${status}`}>
      {t(`status.deposit.${status}`)}
    </span>
  );
}

/** Expandable list of transfers; one opens at a time to show full details. */
export function TransferList<T extends TransferRecord>({
  transfers,
  openId,
  actions,
  audience = "user",
}: {
  transfers: T[];
  audience?: "user" | "admin";
  /** Opens this transfer, e.g. one that was just submitted. */
  openId?: string | null;
  actions?: (transfer: T) => ReactNode;
}) {
  const [expanded, setExpanded] = useState<string | null>(openId ?? null);

  useEffect(() => {
    if (openId) setExpanded(openId);
  }, [openId]);

  return (
    <ul className="transfer-list">
      {transfers.map((transfer) => {
        const open = expanded === transfer.id;
        return (
          <li key={transfer.id} className={cn("transfer-item", { open })}>
            <button
              type="button"
              className="transfer-summary"
              aria-expanded={open}
              onClick={() => setExpanded(open ? null : transfer.id)}
            >
              <TokenIcon symbol={transfer.symbol} />
              <span className="transfer-summary-main">
                <b>
                  {transfer.amount} {transfer.symbol}
                </b>
                <span>
                  {networkLabel(transfer.network)} ·{" "}
                  {formatDateTime(transfer.submittedAt)}
                </span>
              </span>
              <TransferStatusBadge status={transfer.status} />
              <ChevronDown size={16} className="transfer-chevron" />
            </button>
            {open && (
              <TransferDetails
                transfer={transfer}
                audience={audience}
                actions={actions?.(transfer)}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

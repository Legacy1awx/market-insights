import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import { findDepositAsset } from "@shared/deposit-assets";
import { CopyButton } from "@/components/funds/CopyButton";
import { TokenIcon } from "@/components/funds/TokenIcon";
import { formatDateTime, shortenMiddle } from "@/lib/api";
import type { Withdrawal, WithdrawalStatus } from "@/lib/withdrawals";
import { cn } from "@/lib/utils";
import { WithdrawalTimeline } from "./WithdrawalTimeline";
import { formatUsd } from "@/i18n/format";

export function WithdrawalStatusBadge({
  status,
}: {
  status: WithdrawalStatus;
}) {
  const { t } = useTranslation();
  return (
    <span className={`transfer-status ${status}`}>
      {t(`status.withdrawal.${status}`)}
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
  const { t } = useTranslation();
  const asset = findDepositAsset(withdrawal.symbol);
  return (
    <div className="transfer-details">
      <WithdrawalTimeline withdrawal={withdrawal} audience={audience} />
      {withdrawal.adminNote && (
        <p className={`transfer-note ${withdrawal.status}`}>
          <b>
            {audience === "admin"
              ? t("withdrawal.adminNoteAdmin")
              : t("transfer.adminNote")}
          </b>
          {withdrawal.adminNote}
        </p>
      )}
      <dl className="transfer-facts">
        <div>
          <dt>{t("transfer.amount")}</dt>
          <dd>{formatUsd(Number(withdrawal.amountUsd))}</dd>
        </div>
        <div>
          <dt>{t("withdrawal.fromInvestment")}</dt>
          <dd>
            {asset?.name ?? withdrawal.symbol} ({withdrawal.symbol})
          </dd>
        </div>
        <div className="transfer-fact-wide">
          <dt>
            {t("withdrawal.destination")}
            {asset ? ` · ${asset.network}` : ""}
          </dt>
          <dd className="transfer-mono-row">
            <code title={withdrawal.destinationAddress}>
              {shortenMiddle(withdrawal.destinationAddress, 12)}
            </code>
            <CopyButton
              compact
              value={withdrawal.destinationAddress}
              label={t("withdrawal.walletAddress")}
            />
          </dd>
        </div>
        <div>
          <dt>{t("withdrawal.requested")}</dt>
          <dd>{formatDateTime(withdrawal.createdAt)}</dd>
        </div>
        <div>
          <dt>{t("withdrawal.lastUpdate")}</dt>
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
  const { t } = useTranslation();
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
                <b>{formatUsd(Number(withdrawal.amountUsd))}</b>
                <span>
                  {t("withdrawal.from", { symbol: withdrawal.symbol })} ·{" "}
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

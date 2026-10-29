import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ExternalLink } from "lucide-react";
import { explorerUrl, networkLabel } from "@shared/deposit-assets";
import {
  formatDateTime,
  shortenMiddle,
  type DepositStatus,
} from "@/lib/deposits";
import { CopyButton } from "./CopyButton";
import { TransferTimeline } from "./TransferTimeline";

/** The fields shared by user-side and admin-side transfer records. */
export type TransferRecord = {
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

export function TransferDetails({
  transfer,
  actions,
  audience = "user",
}: {
  transfer: TransferRecord;
  audience?: "user" | "admin";
  /** Extra buttons shown under the details, e.g. "View portfolio". */
  actions?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="transfer-details">
      <TransferTimeline
        status={transfer.status}
        submittedAt={transfer.submittedAt}
        reviewedAt={transfer.reviewedAt}
        symbol={transfer.symbol}
        audience={audience}
      />

      {transfer.reviewNote && (
        <p className={`transfer-note ${transfer.status}`}>
          <b>
            {audience === "admin"
              ? t("transfer.reviewNote")
              : t("transfer.adminNote")}
          </b>
          {transfer.reviewNote}
        </p>
      )}

      <dl className="transfer-facts">
        <div>
          <dt>{t("transfer.amount")}</dt>
          <dd>
            {transfer.amount} {transfer.symbol}
          </dd>
        </div>
        <div>
          <dt>{t("transfer.network")}</dt>
          <dd>{networkLabel(transfer.network)}</dd>
        </div>
        <div className="transfer-fact-wide">
          <dt>{t("transfer.hash")}</dt>
          <dd className="transfer-mono-row">
            <code title={transfer.transactionHash}>
              {shortenMiddle(transfer.transactionHash, 10)}
            </code>
            <CopyButton
              compact
              value={transfer.transactionHash}
              label={t("transfer.hash")}
            />
            <a
              className="button button-subtle button-small"
              href={explorerUrl(transfer.symbol, transfer.transactionHash)}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={13} /> {t("transfer.explorer")}
            </a>
          </dd>
        </div>
        <div className="transfer-fact-wide">
          <dt>{t("transfer.sentTo")}</dt>
          <dd>
            <code title={transfer.recipientAddress}>
              {shortenMiddle(transfer.recipientAddress, 10)}
            </code>
          </dd>
        </div>
        <div className="transfer-fact-wide">
          <dt>{t("transfer.sentFrom")}</dt>
          <dd>
            {transfer.senderAddress ? (
              <code title={transfer.senderAddress}>
                {shortenMiddle(transfer.senderAddress, 10)}
              </code>
            ) : (
              t("transfer.notProvided")
            )}
          </dd>
        </div>
        <div>
          <dt>{t("transfer.submitted")}</dt>
          <dd>{formatDateTime(transfer.submittedAt)}</dd>
        </div>
        <div>
          <dt>{t("transfer.reviewed")}</dt>
          <dd>
            {transfer.reviewedAt
              ? formatDateTime(transfer.reviewedAt)
              : t("transfer.notYet")}
          </dd>
        </div>
      </dl>

      {actions && <div className="transfer-actions">{actions}</div>}
    </div>
  );
}

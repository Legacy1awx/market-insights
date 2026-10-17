import type { ReactNode } from "react";
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
          <b>{audience === "admin" ? "Review note" : "Note from the admin"}</b>
          {transfer.reviewNote}
        </p>
      )}

      <dl className="transfer-facts">
        <div>
          <dt>Amount</dt>
          <dd>
            {transfer.amount} {transfer.symbol}
          </dd>
        </div>
        <div>
          <dt>Network</dt>
          <dd>{networkLabel(transfer.network)}</dd>
        </div>
        <div className="transfer-fact-wide">
          <dt>Transaction hash</dt>
          <dd className="transfer-mono-row">
            <code title={transfer.transactionHash}>
              {shortenMiddle(transfer.transactionHash, 10)}
            </code>
            <CopyButton
              compact
              value={transfer.transactionHash}
              label="Transaction hash"
            />
            <a
              className="button button-subtle button-small"
              href={explorerUrl(transfer.symbol, transfer.transactionHash)}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={13} /> Explorer
            </a>
          </dd>
        </div>
        <div className="transfer-fact-wide">
          <dt>Sent to</dt>
          <dd>
            <code title={transfer.recipientAddress}>
              {shortenMiddle(transfer.recipientAddress, 10)}
            </code>
          </dd>
        </div>
        <div className="transfer-fact-wide">
          <dt>Sent from</dt>
          <dd>
            {transfer.senderAddress ? (
              <code title={transfer.senderAddress}>
                {shortenMiddle(transfer.senderAddress, 10)}
              </code>
            ) : (
              "Not provided"
            )}
          </dd>
        </div>
        <div>
          <dt>Submitted</dt>
          <dd>{formatDateTime(transfer.submittedAt)}</dd>
        </div>
        <div>
          <dt>Reviewed</dt>
          <dd>
            {transfer.reviewedAt
              ? formatDateTime(transfer.reviewedAt)
              : "Not yet"}
          </dd>
        </div>
      </dl>

      {actions && <div className="transfer-actions">{actions}</div>}
    </div>
  );
}

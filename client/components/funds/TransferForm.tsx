import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { CircleAlert, LoaderCircle, Send } from "lucide-react";
import type { DepositAsset } from "@shared/deposit-assets";
import { submitDeposit, type Deposit } from "@/lib/deposits";

/** Step 3: tell us about the transfer once it has been sent. */
export function TransferForm({
  asset,
  onSubmitted,
}: {
  asset: DepositAsset;
  onSubmitted: (deposit: Deposit) => void;
}) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState("");
  const [transactionHash, setTransactionHash] = useState("");
  const [senderAddress, setSenderAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const isSolana = asset.symbol === "SOL";

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const deposit = await submitDeposit({
        symbol: asset.symbol,
        amount: amount.trim(),
        transactionHash: transactionHash.trim(),
        senderAddress: senderAddress.trim(),
      });
      setAmount("");
      setTransactionHash("");
      setSenderAddress("");
      onSubmitted(deposit);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : t("transferForm.submitFailed"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="transfer-form" onSubmit={(event) => void submit(event)}>
      <label>
        {t("transferForm.amount", { symbol: asset.symbol })}
        <input
          type="number"
          min="0"
          step="any"
          inputMode="decimal"
          required
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder="0.00"
        />
        <small>{t("transferForm.amountHint")}</small>
      </label>
      <label>
        {t("transfer.hash")}
        <input
          required
          minLength={isSolana ? 80 : 64}
          maxLength={100}
          value={transactionHash}
          onChange={(event) => setTransactionHash(event.target.value)}
          placeholder={
            isSolana
              ? t("transferForm.hashPlaceholderSol")
              : t("transferForm.hashPlaceholder")
          }
          autoComplete="off"
          spellCheck={false}
        />
        <small>{t("transferForm.hashHint")}</small>
      </label>
      <label>
        <span>
          {t("transferForm.sender")}{" "}
          <span className="optional-label">{t("common.optional")}</span>
        </span>
        <input
          value={senderAddress}
          onChange={(event) => setSenderAddress(event.target.value)}
          maxLength={150}
          placeholder={t("transferForm.senderPlaceholder", {
            symbol: asset.symbol,
          })}
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      {error && (
        <p className="transfer-form-error" role="alert">
          <CircleAlert size={15} /> {error}
        </p>
      )}
      <button
        className="button button-primary transfer-form-submit"
        disabled={submitting}
        type="submit"
      >
        {submitting ? (
          <LoaderCircle className="admin-spinner" size={15} />
        ) : (
          <Send size={15} />
        )}
        {submitting ? t("common.submitting") : t("transferForm.submit")}
      </button>
      <p className="transfer-form-footnote">
        {t("transferForm.footnote", { symbol: asset.symbol })}
      </p>
    </form>
  );
}

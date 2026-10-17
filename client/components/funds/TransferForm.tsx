import { useState, type FormEvent } from "react";
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
          : "Your transfer couldn't be submitted.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="transfer-form" onSubmit={(event) => void submit(event)}>
      <label>
        Amount sent ({asset.symbol})
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
        <small>Enter exactly the amount you sent.</small>
      </label>
      <label>
        Transaction hash
        <input
          required
          minLength={isSolana ? 80 : 64}
          maxLength={100}
          value={transactionHash}
          onChange={(event) => setTransactionHash(event.target.value)}
          placeholder={
            isSolana
              ? "Paste the Solana transaction signature"
              : "Paste the 64-character transaction hash"
          }
          autoComplete="off"
          spellCheck={false}
        />
        <small>
          Your wallet shows this after sending (also called transaction ID or
          TxID). We use it to find your transfer on the blockchain.
        </small>
      </label>
      <label>
        <span>
          Your wallet address <span className="optional-label">Optional</span>
        </span>
        <input
          value={senderAddress}
          onChange={(event) => setSenderAddress(event.target.value)}
          maxLength={150}
          placeholder={`The ${asset.symbol} address you sent from`}
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
        {submitting ? "Submitting…" : "I have sent funds"}
      </button>
      <p className="transfer-form-footnote">
        An admin checks your transaction on the blockchain. Once confirmed, the
        amount is added to your {asset.symbol} investment and you'll see it here
        and in your portfolio.
      </p>
    </form>
  );
}

import { useEffect, useState, type FormEvent } from "react";
import { Trans, useTranslation } from "react-i18next";
import { ArrowUpFromLine, CircleAlert, LoaderCircle } from "lucide-react";
import { findDepositAsset } from "@shared/deposit-assets";
import {
  ADDRESS_HINTS,
  USD_AMOUNT_PATTERN,
  isValidWithdrawalAddress,
  type WithdrawalSymbol,
} from "@shared/withdrawals";
import { TokenIcon } from "@/components/funds/TokenIcon";
import {
  requestWithdrawal,
  type Withdrawal,
  type WithdrawalBalance,
} from "@/lib/withdrawals";
import { cn } from "@/lib/utils";
import { formatUsd } from "@/i18n/format";

/** Choose an investment, enter an amount and a wallet, then request it. */
export function WithdrawalForm({
  balances,
  onRequested,
}: {
  balances: WithdrawalBalance[];
  onRequested: (withdrawal: Withdrawal) => void;
}) {
  const { t } = useTranslation();
  const withdrawable = balances.filter(
    (balance) => Number(balance.availableUsd) > 0,
  );
  const [symbol, setSymbol] = useState(withdrawable[0]?.symbol ?? "");
  const [amount, setAmount] = useState("");
  const [address, setAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Keep a withdrawable token selected as balances load or change.
  useEffect(() => {
    if (!withdrawable.some((balance) => balance.symbol === symbol))
      setSymbol(withdrawable[0]?.symbol ?? "");
  }, [symbol, withdrawable]);

  const selected = balances.find((balance) => balance.symbol === symbol);
  const asset = findDepositAsset(symbol);
  const available = Number(selected?.availableUsd ?? 0);
  const amountValue = Number(amount);
  const amountTooHigh = amount !== "" && amountValue > available;
  const addressInvalid =
    address.trim() !== "" && !isValidWithdrawalAddress(symbol, address);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    const trimmed = amount.trim();
    if (!USD_AMOUNT_PATTERN.test(trimmed) || Number(trimmed) <= 0) {
      setError(t("withdrawForm.errors.amount"));
      return;
    }
    if (Number(trimmed) > available) {
      setError(
        t("withdrawForm.errors.tooHigh", {
          amount: formatUsd(available),
          symbol,
        }),
      );
      return;
    }
    if (!isValidWithdrawalAddress(symbol, address)) {
      setError(t("withdrawForm.errors.address", { symbol }));
      return;
    }
    setSubmitting(true);
    try {
      const withdrawal = await requestWithdrawal({
        symbol,
        amountUsd: trimmed,
        destinationAddress: address.trim(),
      });
      setAmount("");
      setAddress("");
      onRequested(withdrawal);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : t("withdrawForm.errors.failed"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (withdrawable.length === 0) {
    return (
      <p className="invest-step-placeholder">
        {t("withdrawForm.nothingAvailable")}
      </p>
    );
  }

  return (
    <form className="transfer-form" onSubmit={(event) => void submit(event)}>
      <fieldset className="withdraw-sources">
        <legend>{t("withdrawForm.source")}</legend>
        {balances.map((balance) => {
          const disabled = Number(balance.availableUsd) <= 0;
          return (
            <label
              key={balance.symbol}
              className={cn("withdraw-source", {
                selected: balance.symbol === symbol,
                disabled,
              })}
            >
              <input
                type="radio"
                name="withdraw-source"
                value={balance.symbol}
                checked={balance.symbol === symbol}
                disabled={disabled}
                onChange={() => {
                  setSymbol(balance.symbol);
                  setAddress("");
                  setError("");
                }}
              />
              <TokenIcon symbol={balance.symbol} size="lg" />
              <span>
                <b>
                  {findDepositAsset(balance.symbol)?.name ?? balance.symbol}
                </b>
                <small>
                  {t("withdrawForm.available", {
                    amount: formatUsd(Number(balance.availableUsd)),
                  })}
                  {Number(balance.reservedUsd) > 0 &&
                    ` · ${t("withdrawForm.pending", {
                      amount: formatUsd(Number(balance.reservedUsd)),
                    })}`}
                </small>
              </span>
            </label>
          );
        })}
      </fieldset>

      <label>
        {t("withdrawForm.amount")}
        <span className="withdraw-amount-row">
          <input
            type="number"
            min="0.01"
            step="0.01"
            inputMode="decimal"
            required
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="0.00"
            aria-invalid={amountTooHigh}
          />
          <button
            type="button"
            className="button button-subtle"
            onClick={() => setAmount(available.toFixed(2))}
          >
            {t("withdrawForm.max")}
          </button>
        </span>
        <small className={amountTooHigh ? "negative-text" : undefined}>
          {amountTooHigh
            ? t("withdrawForm.amountTooHigh", { amount: formatUsd(available) })
            : t("withdrawForm.amountHint", {
                amount: formatUsd(available),
                symbol,
              })}
        </small>
      </label>

      <label>
        {t("withdrawForm.address", { symbol })}
        <input
          required
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          placeholder={ADDRESS_HINTS[symbol as WithdrawalSymbol]}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={addressInvalid}
        />
        <small className={addressInvalid ? "negative-text" : undefined}>
          {addressInvalid
            ? t("withdrawForm.addressInvalid", { symbol })
            : asset
              ? t("withdrawForm.addressHintNetwork", {
                  symbol,
                  network: asset.network,
                })
              : t("withdrawForm.addressHint", { symbol })}
        </small>
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
          <ArrowUpFromLine size={15} />
        )}
        {submitting ? t("common.submitting") : t("withdrawForm.submit")}
      </button>
      <p className="transfer-form-footnote">
        <Trans i18nKey="withdrawForm.footnote" components={{ b: <b /> }} />
      </p>
    </form>
  );
}

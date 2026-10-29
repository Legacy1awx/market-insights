import { Trans, useTranslation } from "react-i18next";
import { CircleAlert } from "lucide-react";
import type { DepositAsset } from "@shared/deposit-assets";
import { CopyButton } from "./CopyButton";

/** Step 2: reveal the receiving address for the chosen token. */
export function WalletAddress({ asset }: { asset: DepositAsset }) {
  const { t } = useTranslation();
  return (
    <div className="wallet-address">
      <label htmlFor={`address-${asset.symbol}`}>
        {t("wallet.label", { name: asset.name, symbol: asset.symbol })}
      </label>
      <div className="wallet-address-row">
        <input
          id={`address-${asset.symbol}`}
          value={asset.address}
          readOnly
          spellCheck={false}
          onFocus={(event) => event.currentTarget.select()}
        />
        <CopyButton value={asset.address} label={t("wallet.copyLabel", { symbol: asset.symbol })} />
      </div>
      <div className="wallet-address-warning" role="note">
        <CircleAlert size={16} />
        <span>
          <Trans
            i18nKey="wallet.warning"
            values={{ symbol: asset.symbol, network: asset.network }}
            components={{ b: <b /> }}
          />
        </span>
      </div>
      <ol className="wallet-address-steps">
        <li>{t("wallet.step1")}</li>
        <li>{t("wallet.step2", { symbol: asset.symbol })}</li>
        <li>
          <Trans i18nKey="wallet.step3" components={{ b: <b /> }} />
        </li>
      </ol>
    </div>
  );
}

import { CircleAlert } from "lucide-react";
import type { DepositAsset } from "@shared/deposit-assets";
import { CopyButton } from "./CopyButton";

/** Step 2: reveal the receiving address for the chosen token. */
export function WalletAddress({ asset }: { asset: DepositAsset }) {
  return (
    <div className="wallet-address">
      <label htmlFor={`address-${asset.symbol}`}>
        {asset.name} ({asset.symbol}) receiving address
      </label>
      <div className="wallet-address-row">
        <input
          id={`address-${asset.symbol}`}
          value={asset.address}
          readOnly
          spellCheck={false}
          onFocus={(event) => event.currentTarget.select()}
        />
        <CopyButton value={asset.address} label={`${asset.symbol} address`} />
      </div>
      <div className="wallet-address-warning" role="note">
        <CircleAlert size={16} />
        <span>
          Only send <b>{asset.symbol}</b> on the <b>{asset.network}</b> network.
          Sending another token or using another network can permanently lose
          your funds.
        </span>
      </div>
      <ol className="wallet-address-steps">
        <li>Copy the address above.</li>
        <li>Open your wallet or exchange and send {asset.symbol} to it.</li>
        <li>
          Come back here and fill in the transfer details below, then click{" "}
          <b>I have sent funds</b>.
        </li>
      </ol>
    </div>
  );
}

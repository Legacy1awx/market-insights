import { DEPOSIT_ASSETS, type DepositAsset } from "@shared/deposit-assets";
import { cn } from "@/lib/utils";
import { TokenIcon } from "./TokenIcon";

/** Step 1: choose which token to invest with. */
export function TokenPicker({
  selected,
  onSelect,
}: {
  selected: DepositAsset | null;
  onSelect: (asset: DepositAsset) => void;
}) {
  return (
    <div className="token-picker" role="radiogroup" aria-label="Choose a token">
      {DEPOSIT_ASSETS.map((asset) => {
        const active = selected?.symbol === asset.symbol;
        return (
          <button
            key={asset.symbol}
            type="button"
            role="radio"
            aria-checked={active}
            className={cn("token-option", { selected: active })}
            onClick={() => onSelect(asset)}
          >
            <TokenIcon symbol={asset.symbol} size="lg" />
            <span>
              <b>{asset.name}</b>
              <small>
                {asset.symbol} · {asset.network}
              </small>
            </span>
          </button>
        );
      })}
    </div>
  );
}

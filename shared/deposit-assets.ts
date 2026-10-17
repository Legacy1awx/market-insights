export const DEPOSIT_ASSETS = [
  {
    symbol: "USDT",
    name: "Tether",
    network: "TRON · TRC-20",
    networkCode: "TRON-TRC20",
    address: "TYqFs9VwDRvWZtWDbYnCz7k8p69D7EEyV9",
    note: "Send USDT using the TRON (TRC-20) network only.",
  },
  {
    symbol: "BTC",
    name: "Bitcoin",
    network: "Bitcoin",
    networkCode: "BITCOIN",
    address: "bc1qarlvunv38mhewdrdz6mfurjdnq0fe6gdreydlk",
    note: "Send Bitcoin (BTC) on the Bitcoin network.",
  },
  {
    symbol: "ETH",
    name: "Ethereum",
    network: "Ethereum",
    networkCode: "ETHEREUM",
    address: "0x40B8D54d0518169f20BEBF0f962DD6161C58e0A0",
    note: "Send ETH on the Ethereum network.",
  },
  {
    symbol: "SOL",
    name: "Solana",
    network: "Solana",
    networkCode: "SOLANA",
    address: "HEihqsuKbAEtkCrr3BraCS2r12UxrgdsaED7PcM2f8sx",
    note: "Send SOL on the Solana network.",
  },
] as const;

export type DepositAsset = (typeof DEPOSIT_ASSETS)[number];

/** Finds the deposit asset for a symbol or stored network code. */
export function findDepositAsset(symbolOrNetwork: string) {
  return DEPOSIT_ASSETS.find(
    (asset) =>
      asset.symbol === symbolOrNetwork || asset.networkCode === symbolOrNetwork,
  );
}

/** Human-readable network name, e.g. "TRON-TRC20" → "TRON · TRC-20". */
export function networkLabel(networkCode: string) {
  return findDepositAsset(networkCode)?.network ?? networkCode;
}

/** Public block explorer link for a transaction. */
export function explorerUrl(symbol: string, transactionHash: string) {
  const hash = encodeURIComponent(transactionHash);
  if (symbol === "BTC") return `https://mempool.space/tx/${hash}`;
  if (symbol === "ETH") return `https://etherscan.io/tx/${hash}`;
  if (symbol === "USDT") return `https://tronscan.org/#/transaction/${hash}`;
  return `https://solscan.io/tx/${hash}`;
}

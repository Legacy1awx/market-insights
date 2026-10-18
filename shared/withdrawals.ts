/** Shared between client and server: withdrawal statuses and validation. */

export const WITHDRAWAL_STATUSES = [
  "pending",
  "processing",
  "completed",
  "rejected",
] as const;
export type WithdrawalStatus = (typeof WITHDRAWAL_STATUSES)[number];

export const WITHDRAWAL_SYMBOLS = ["USDT", "BTC", "ETH", "SOL"] as const;
export type WithdrawalSymbol = (typeof WITHDRAWAL_SYMBOLS)[number];

/** Completed and rejected requests can no longer change. */
export function isFinalWithdrawalStatus(status: WithdrawalStatus) {
  return status === "completed" || status === "rejected";
}

/** Requests that still reserve part of the investment's balance. */
export function isOpenWithdrawalStatus(status: WithdrawalStatus) {
  return status === "pending" || status === "processing";
}

const ADDRESS_PATTERNS: Record<WithdrawalSymbol, RegExp> = {
  // TRON (TRC-20) addresses: base58, start with T, 34 characters.
  USDT: /^T[1-9A-HJ-NP-Za-km-z]{33}$/,
  // Legacy (1…/3…) or bech32 (bc1…) Bitcoin addresses.
  BTC: /^(?:[13][1-9A-HJ-NP-Za-km-z]{25,34}|bc1[02-9ac-hj-np-z]{11,71})$/,
  ETH: /^0x[0-9a-fA-F]{40}$/,
  // Solana public keys: base58, 32–44 characters.
  SOL: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
};

export const ADDRESS_HINTS: Record<WithdrawalSymbol, string> = {
  USDT: "A TRON (TRC-20) address starting with T",
  BTC: "A Bitcoin address starting with bc1, 1 or 3",
  ETH: "An Ethereum address starting with 0x",
  SOL: "A Solana address",
};

export function isValidWithdrawalAddress(symbol: string, address: string) {
  const pattern = ADDRESS_PATTERNS[symbol as WithdrawalSymbol];
  return Boolean(pattern?.test(address.trim()));
}

/** Positive USD amount with up to two decimals, e.g. "250" or "99.95". */
export const USD_AMOUNT_PATTERN = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/;

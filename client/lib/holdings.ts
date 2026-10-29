/** The personal portfolio tracker, kept in this browser only. */
export type Holding = {
  id: string;
  symbol: string;
  quantity: number;
  averageCost: number;
};

export const HOLDINGS_STORAGE = "northstar-portfolio";

const DEFAULT_HOLDINGS: Holding[] = [
  { id: "holding-btc", symbol: "BTC", quantity: 0.18, averageCost: 61_700 },
  { id: "holding-eth", symbol: "ETH", quantity: 1.2, averageCost: 3_120 },
  { id: "holding-sol", symbol: "SOL", quantity: 18.4, averageCost: 168 },
];

export function readHoldings(): Holding[] {
  try {
    const value = localStorage.getItem(HOLDINGS_STORAGE);
    return value ? (JSON.parse(value) as Holding[]) : DEFAULT_HOLDINGS;
  } catch {
    return DEFAULT_HOLDINGS;
  }
}

/**
 * Portfolio value over time from each holding's price history. Only points
 * where every holding has a price are kept, so the line never dips because a
 * series is missing.
 */
export function holdingsHistory(
  holdings: Holding[],
  series: Record<string, { time: number; close: number }[]>,
) {
  const active = holdings.filter((holding) => holding.quantity > 0);
  if (!active.length || active.some((holding) => !series[holding.symbol]?.length))
    return [];
  const length = Math.min(...active.map((holding) => series[holding.symbol].length));
  const reference = series[active[0].symbol].slice(-length);
  return reference.map((point, index) => ({
    time: point.time,
    value: active.reduce((sum, holding) => {
      const rows = series[holding.symbol];
      return sum + holding.quantity * rows[rows.length - length + index].close;
    }, 0),
  }));
}

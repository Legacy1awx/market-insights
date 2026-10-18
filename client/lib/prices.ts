export type TokenQuote = { price: number; change24h: number | null };
export type TokenQuotes = Record<string, TokenQuote>;

const TRACKED = ["BTC", "ETH", "SOL"] as const;
const COINGECKO_IDS: Record<(typeof TRACKED)[number], string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
};

async function fromBinance(signal?: AbortSignal): Promise<TokenQuotes> {
  const symbols = encodeURIComponent(
    JSON.stringify(TRACKED.map((symbol) => `${symbol}USDT`)),
  );
  const response = await fetch(
    `https://api.binance.com/api/v3/ticker/24hr?symbols=${symbols}`,
    { signal },
  );
  if (!response.ok) throw new Error("Binance prices unavailable");
  const tickers = (await response.json()) as {
    symbol: string;
    lastPrice: string;
    priceChangePercent: string;
  }[];
  return Object.fromEntries(
    tickers.map((ticker) => [
      ticker.symbol.replace(/USDT$/, ""),
      {
        price: Number(ticker.lastPrice),
        change24h: Number(ticker.priceChangePercent),
      },
    ]),
  );
}

async function fromCoinGecko(signal?: AbortSignal): Promise<TokenQuotes> {
  const ids = Object.values(COINGECKO_IDS).join(",");
  const response = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`,
    { signal },
  );
  if (!response.ok) throw new Error("CoinGecko prices unavailable");
  const data = (await response.json()) as Record<
    string,
    { usd?: number; usd_24h_change?: number }
  >;
  return Object.fromEntries(
    TRACKED.map((symbol) => {
      const quote = data[COINGECKO_IDS[symbol]];
      return [
        symbol,
        { price: quote?.usd ?? 0, change24h: quote?.usd_24h_change ?? null },
      ];
    }),
  );
}

/**
 * Current USD prices for the investable tokens. Binance is tried first;
 * CoinGecko is the fallback where Binance is unavailable. USDT is $1.
 */
export async function fetchUsdQuotes(signal?: AbortSignal) {
  const quotes = await fromBinance(signal).catch(() => fromCoinGecko(signal));
  const valid = Object.fromEntries(
    Object.entries(quotes).filter(([, quote]) => quote.price > 0),
  );
  return { USDT: { price: 1, change24h: 0 }, ...valid } as TokenQuotes;
}

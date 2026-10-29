/**
 * Live market data. Binance's public market-data hosts provide prices,
 * candles and the live ticker stream (they work in regions where
 * api.binance.com is blocked); CoinGecko provides market caps, supply,
 * 7-day sparklines, global totals, and is the fallback for prices and candles.
 *
 * Requests are cached briefly and shared between callers, so pages can ask
 * freely without tripping the public APIs' rate limits.
 */

export const BINANCE_REST = "https://data-api.binance.vision/api/v3";
export const BINANCE_STREAM = "wss://data-stream.binance.vision/stream";
const COINGECKO = "https://api.coingecko.com/api/v3";

export const COINGECKO_IDS: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  BNB: "binancecoin",
  XRP: "ripple",
  ADA: "cardano",
  AVAX: "avalanche-2",
  LINK: "chainlink",
  USDT: "tether",
};

export type Timeframe = "1D" | "1W" | "1M" | "3M" | "1Y" | "5Y" | "ALL";
export const TIMEFRAMES: Timeframe[] = ["1D", "1W", "1M", "3M", "1Y", "5Y", "ALL"];

export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  /** Quote volume in USD; 0 when the source doesn't report it. */
  volume: number;
};

export type Ticker = {
  price: number;
  change24h: number;
  volume24h: number;
  high24h: number;
  low24h: number;
};

export type AssetMarket = Ticker & {
  marketCap: number;
  rank: number | null;
  circulatingSupply: number | null;
  maxSupply: number | null;
  /** Hourly prices for the last 7 days. */
  sparkline: number[];
};

export type GlobalMarket = {
  totalMarketCap: number;
  totalVolume: number;
  marketCapChange24h: number;
  dominance: Record<string, number>;
};

export type FearGreed = {
  value: number;
  classification:
    | "extremeFear"
    | "fear"
    | "neutral"
    | "greed"
    | "extremeGreed";
};

const cache = new Map<string, { at: number; value: Promise<unknown> }>();

function cached<T>(key: string, ttlMs: number, load: () => Promise<T>) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as Promise<T>;
  const value = load();
  cache.set(key, { at: Date.now(), value });
  // Failures shouldn't stick: the next caller retries.
  value.catch(() => {
    if (cache.get(key)?.value === value) cache.delete(key);
  });
  return value;
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return (await response.json()) as T;
}

const toBinance = (symbol: string) => `${symbol}USDT`;

// ---------- Prices ----------

type CoinGeckoMarket = {
  id: string;
  current_price: number;
  price_change_percentage_24h: number | null;
  market_cap: number;
  market_cap_rank: number | null;
  total_volume: number;
  high_24h: number | null;
  low_24h: number | null;
  circulating_supply: number | null;
  max_supply: number | null;
  sparkline_in_7d?: { price: number[] };
};

/** Market caps, supply and 7-day sparklines for the tracked assets. */
export function fetchAssetMarkets(): Promise<Record<string, AssetMarket>> {
  return cached("markets", 90_000, async () => {
    const ids = Object.values(COINGECKO_IDS).join(",");
    const rows = await getJson<CoinGeckoMarket[]>(
      `${COINGECKO}/coins/markets?vs_currency=usd&ids=${ids}&sparkline=true&price_change_percentage=24h`,
    );
    const bySymbol = Object.fromEntries(
      Object.entries(COINGECKO_IDS).map(([symbol, id]) => [id, symbol]),
    );
    return Object.fromEntries(
      rows.map((row) => [
        bySymbol[row.id],
        {
          price: row.current_price,
          change24h: row.price_change_percentage_24h ?? 0,
          volume24h: row.total_volume,
          high24h: row.high_24h ?? row.current_price,
          low24h: row.low_24h ?? row.current_price,
          marketCap: row.market_cap,
          rank: row.market_cap_rank,
          circulatingSupply: row.circulating_supply,
          maxSupply: row.max_supply,
          sparkline: row.sparkline_in_7d?.price ?? [],
        },
      ]),
    );
  });
}

type BinanceTicker = {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  quoteVolume: string;
  highPrice: string;
  lowPrice: string;
};

const parseBinanceTicker = (ticker: BinanceTicker): Ticker => ({
  price: Number(ticker.lastPrice),
  change24h: Number(ticker.priceChangePercent),
  volume24h: Number(ticker.quoteVolume),
  high24h: Number(ticker.highPrice),
  low24h: Number(ticker.lowPrice),
});

/** 24h tickers from Binance, falling back to CoinGecko. USDT is always ~$1. */
export function fetchTickers(symbols: string[]): Promise<Record<string, Ticker>> {
  const tradable = symbols.filter((symbol) => symbol !== "USDT");
  return cached(`tickers:${symbols.join(",")}`, 15_000, async () => {
    let tickers: Record<string, Ticker>;
    try {
      const query = encodeURIComponent(JSON.stringify(tradable.map(toBinance)));
      const rows = await getJson<BinanceTicker[]>(
        `${BINANCE_REST}/ticker/24hr?symbols=${query}`,
      );
      tickers = Object.fromEntries(
        rows.map((row) => [
          row.symbol.replace(/USDT$/, ""),
          parseBinanceTicker(row),
        ]),
      );
    } catch {
      const markets = await fetchAssetMarkets();
      tickers = Object.fromEntries(
        tradable.flatMap((symbol) =>
          markets[symbol] ? [[symbol, markets[symbol]]] : [],
        ),
      );
    }
    if (symbols.includes("USDT")) {
      const usdt = await fetchAssetMarkets()
        .then((markets) => markets.USDT)
        .catch(() => undefined);
      tickers.USDT = usdt ?? {
        price: 1,
        change24h: 0,
        volume24h: 0,
        high24h: 1,
        low24h: 1,
      };
    }
    return tickers;
  });
}

/**
 * Streams 24h tickers from Binance. Reconnects with backoff and pauses while
 * the tab is hidden. Returns an unsubscribe function.
 */
export function subscribeTickers(
  symbols: string[],
  onTicker: (symbol: string, ticker: Ticker) => void,
  onStatus?: (status: "connecting" | "live" | "reconnecting" | "offline") => void,
) {
  const streams = symbols
    .filter((symbol) => symbol !== "USDT")
    .map((symbol) => `${toBinance(symbol).toLowerCase()}@ticker`)
    .join("/");
  let socket: WebSocket | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let backoff = 1000;
  let closed = false;

  const connect = () => {
    if (closed || document.hidden) return;
    onStatus?.(backoff > 1000 ? "reconnecting" : "connecting");
    socket = new WebSocket(`${BINANCE_STREAM}?streams=${streams}`);
    socket.onopen = () => {
      backoff = 1000;
      onStatus?.("live");
    };
    socket.onmessage = (event) => {
      try {
        const data = (JSON.parse(event.data) as { data?: Record<string, string> })
          .data;
        if (!data?.s || !data.c) return;
        onTicker(data.s.replace(/USDT$/, ""), {
          price: Number(data.c),
          change24h: Number(data.P),
          volume24h: Number(data.q),
          high24h: Number(data.h),
          low24h: Number(data.l),
        });
      } catch {
        // Ignore malformed frames; the next one will arrive shortly.
      }
    };
    socket.onclose = () => {
      if (closed) return;
      if (document.hidden) return onStatus?.("offline");
      onStatus?.("reconnecting");
      timer = setTimeout(() => {
        backoff = Math.min(backoff * 2, 30_000);
        connect();
      }, backoff);
    };
    socket.onerror = () => socket?.close();
  };
  const onVisibility = () => {
    if (document.hidden) socket?.close();
    else if (!socket || socket.readyState === WebSocket.CLOSED) {
      backoff = 1000;
      connect();
    }
  };
  document.addEventListener("visibilitychange", onVisibility);
  connect();
  return () => {
    closed = true;
    document.removeEventListener("visibilitychange", onVisibility);
    if (timer) clearTimeout(timer);
    socket?.close();
  };
}

// ---------- Candles ----------

const BINANCE_INTERVALS: Record<Timeframe, [interval: string, limit: number]> = {
  "1D": ["15m", 96],
  "1W": ["1h", 168],
  "1M": ["4h", 180],
  "3M": ["12h", 180],
  "1Y": ["1d", 365],
  "5Y": ["1w", 260],
  ALL: ["1M", 200],
};
// The public CoinGecko API serves at most a year of OHLC history.
const COINGECKO_DAYS: Record<Timeframe, number> = {
  "1D": 1,
  "1W": 7,
  "1M": 30,
  "3M": 90,
  "1Y": 365,
  "5Y": 365,
  ALL: 365,
};

async function binanceCandles(symbol: string, timeframe: Timeframe) {
  const [interval, limit] = BINANCE_INTERVALS[timeframe];
  const rows = await getJson<(string | number)[][]>(
    `${BINANCE_REST}/klines?symbol=${toBinance(symbol)}&interval=${interval}&limit=${limit}`,
  );
  return rows.map<Candle>((row) => ({
    time: Number(row[0]),
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[7]),
  }));
}

async function coinGeckoCandles(symbol: string, timeframe: Timeframe) {
  const id = COINGECKO_IDS[symbol];
  if (!id) throw new Error(`No CoinGecko id for ${symbol}`);
  const rows = await getJson<number[][]>(
    `${COINGECKO}/coins/${id}/ohlc?vs_currency=usd&days=${COINGECKO_DAYS[timeframe]}`,
  );
  return rows.map<Candle>(([time, open, high, low, close]) => ({
    time,
    open,
    high,
    low,
    close,
    volume: 0,
  }));
}

/** Historical USD candles for a symbol over a timeframe. */
export function fetchCandles(symbol: string, timeframe: Timeframe) {
  const [interval] = BINANCE_INTERVALS[timeframe];
  // Short timeframes go stale quickly; long ones barely move.
  const ttl = timeframe === "1D" ? 60_000 : 5 * 60_000;
  return cached(`candles:${symbol}:${interval}`, ttl, async () => {
    const candles =
      symbol === "USDT"
        ? await coinGeckoCandles(symbol, timeframe)
        : await binanceCandles(symbol, timeframe).catch(() =>
            coinGeckoCandles(symbol, timeframe),
          );
    if (candles.length < 2) throw new Error(`No history for ${symbol}`);
    return candles;
  });
}

// ---------- Market-wide ----------

export function fetchGlobalMarket(): Promise<GlobalMarket> {
  return cached("global", 5 * 60_000, async () => {
    const { data } = await getJson<{
      data: {
        total_market_cap: Record<string, number>;
        total_volume: Record<string, number>;
        market_cap_change_percentage_24h_usd: number;
        market_cap_percentage: Record<string, number>;
      };
    }>(`${COINGECKO}/global`);
    return {
      totalMarketCap: data.total_market_cap.usd,
      totalVolume: data.total_volume.usd,
      marketCapChange24h: data.market_cap_change_percentage_24h_usd,
      dominance: Object.fromEntries(
        Object.entries(data.market_cap_percentage).map(([key, value]) => [
          key.toUpperCase(),
          value,
        ]),
      ),
    };
  });
}

/** The Crypto Fear & Greed Index (alternative.me), 0–100. */
export function fetchFearGreed(): Promise<FearGreed> {
  return cached("fear-greed", 30 * 60_000, async () => {
    const body = await getJson<{ data: { value: string }[] }>(
      "https://api.alternative.me/fng/?limit=1",
    );
    const value = Number(body.data[0]?.value);
    if (!Number.isFinite(value)) throw new Error("No index value");
    const classification: FearGreed["classification"] =
      value <= 24
        ? "extremeFear"
        : value <= 45
          ? "fear"
          : value <= 55
            ? "neutral"
            : value <= 75
              ? "greed"
              : "extremeGreed";
    return { value, classification };
  });
}

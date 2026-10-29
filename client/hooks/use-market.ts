import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchAssetMarkets,
  fetchCandles,
  fetchFearGreed,
  fetchGlobalMarket,
  fetchTickers,
  subscribeTickers,
  type AssetMarket,
  type Candle,
  type FearGreed,
  type GlobalMarket,
  type Ticker,
  type Timeframe,
} from "@/lib/market";

/** Polls a loader while mounted; keeps the last good value on failure. */
function usePolled<T>(load: () => Promise<T>, intervalMs: number) {
  const [value, setValue] = useState<T | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    const run = () =>
      load()
        .then((next) => {
          if (!active) return;
          setValue(next);
          setError(false);
        })
        .catch(() => active && setError(true));
    void run();
    const timer = window.setInterval(() => {
      if (!document.hidden) void run();
    }, intervalMs);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [load, intervalMs]);
  return { value, error };
}

/** Market caps, supply and 7-day sparklines (CoinGecko), refreshed every 2 min. */
export function useAssetMarkets() {
  return usePolled(fetchAssetMarkets, 120_000);
}

export function useGlobalMarket() {
  return usePolled<GlobalMarket>(fetchGlobalMarket, 5 * 60_000);
}

export function useFearGreed() {
  return usePolled<FearGreed>(fetchFearGreed, 30 * 60_000);
}

/**
 * Live 24h tickers: an initial snapshot, then Binance's stream. If the stream
 * can't connect, falls back to polling every 30 seconds.
 */
export function useLiveTickers(symbols: string[]) {
  const key = symbols.join(",");
  const [tickers, setTickers] = useState<Record<string, Ticker>>({});
  const [live, setLive] = useState(false);
  useEffect(() => {
    const list = key.split(",");
    let active = true;
    let streaming = false;
    let lastSnapshot = 0;
    const snapshot = () =>
      fetchTickers(list)
        .then((next) => {
          if (!active) return;
          lastSnapshot = Date.now();
          setTickers((current) => ({ ...next, ...(streaming ? current : {}) }));
        })
        .catch(() => undefined);
    void snapshot();
    // Without the stream, refresh every 30s; retry a failed first load sooner.
    const poll = window.setInterval(() => {
      if (streaming || document.hidden) return;
      if (lastSnapshot === 0 || Date.now() - lastSnapshot >= 30_000) void snapshot();
    }, 5_000);
    const unsubscribe = subscribeTickers(
      list,
      (symbol, ticker) => {
        if (active) setTickers((current) => ({ ...current, [symbol]: ticker }));
      },
      (status) => {
        streaming = status === "live";
        if (active) setLive(streaming);
      },
    );
    return () => {
      active = false;
      window.clearInterval(poll);
      unsubscribe();
    };
  }, [key]);
  return { tickers, live };
}

/**
 * Real candles for a symbol and timeframe. When `livePrice` is given, the
 * latest candle follows it so the chart moves with the ticker.
 */
export function useCandles(symbol: string, timeframe: Timeframe, livePrice?: number) {
  const [state, setState] = useState<{
    key: string;
    candles: Candle[];
    error: boolean;
  }>({ key: "", candles: [], error: false });
  const [attempt, setAttempt] = useState(0);
  const key = `${symbol}:${timeframe}`;

  useEffect(() => {
    let active = true;
    const load = () =>
      fetchCandles(symbol, timeframe)
        .then((candles) => {
          failures = 0;
          if (active) setState({ key, candles, error: false });
        })
        .catch(() => {
          if (!active) return;
          setState((current) => ({ ...current, key, error: true }));
          // Public APIs rate-limit bursts; back off and try again a few times.
          if (++failures <= 3) retryTimer = window.setTimeout(load, failures * 8_000);
        });
    let failures = 0;
    let retryTimer: number | undefined;
    void load();
    // Refresh so the newest candle keeps up with the market.
    const timer = window.setInterval(() => {
      if (!document.hidden) void load();
    }, timeframe === "1D" ? 60_000 : 5 * 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.clearTimeout(retryTimer);
    };
  }, [key, symbol, timeframe, attempt]);

  const candles = useMemo(() => {
    const current = state.key === key ? state.candles : [];
    if (!livePrice || current.length === 0) return current;
    const last = current[current.length - 1];
    return [
      ...current.slice(0, -1),
      {
        ...last,
        close: livePrice,
        high: Math.max(last.high, livePrice),
        low: Math.min(last.low, livePrice),
      },
    ];
  }, [state, key, livePrice]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return {
    candles,
    loading: state.key !== key || (!state.error && state.candles.length === 0),
    error: state.key === key && state.error && state.candles.length === 0,
    retry,
  };
}

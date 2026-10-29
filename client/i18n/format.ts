import { currentLanguage } from "./index";

// Intl formatters are costly to build, so keep one per locale + options.
const cache = new Map<string, Intl.NumberFormat | Intl.DateTimeFormat>();

function cached<T extends Intl.NumberFormat | Intl.DateTimeFormat>(
  kind: string,
  options: object,
  create: (locale: string) => T,
): T {
  const locale = currentLanguage();
  const key = `${kind}|${locale}|${JSON.stringify(options)}`;
  let formatter = cache.get(key) as T | undefined;
  if (!formatter) {
    formatter = create(locale);
    cache.set(key, formatter);
  }
  return formatter;
}

export function numberFormat(options: Intl.NumberFormatOptions = {}) {
  return cached(
    "number",
    options,
    (locale) => new Intl.NumberFormat(locale, options),
  );
}

/** US-dollar amounts, laid out for the active language. */
export function usdFormat(options: Intl.NumberFormatOptions = {}) {
  return numberFormat({ style: "currency", currency: "USD", ...options });
}

export function formatUsd(value: number, options?: Intl.NumberFormatOptions) {
  return usdFormat(options).format(value);
}

/**
 * A crypto price in USD with sensible precision: sub-dollar assets get four
 * decimals; `compact` drops cents on large values (for chart axes).
 */
export function formatPrice(value: number, compact = false) {
  if (!Number.isFinite(value) || value <= 0) return "—";
  if (value < 1)
    return formatUsd(value, { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  if (compact && value >= 1000) return formatUsd(value, { maximumFractionDigits: 0 });
  return formatUsd(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Compact USD such as "$1.6T" or "$28.4B". */
export function formatCompactUsd(value: number) {
  if (!Number.isFinite(value)) return "—";
  return usdFormat({ notation: "compact", maximumFractionDigits: 2 }).format(value);
}

/** A candle timestamp, detailed enough for the span it sits in. */
export function formatCandleTime(time: number, spanMs: number, detailed = false) {
  const day = 24 * 60 * 60 * 1000;
  const options: Intl.DateTimeFormatOptions =
    spanMs <= 2 * day
      ? detailed
        ? { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }
        : { hour: "numeric", minute: "2-digit" }
      : spanMs <= 400 * day
        ? detailed
          ? { month: "short", day: "numeric", hour: "numeric" }
          : { month: "short", day: "numeric" }
        : { month: "short", year: "numeric" };
  return dateFormat(options).format(new Date(time));
}

export function dateFormat(options: Intl.DateTimeFormatOptions = {}) {
  return cached(
    "date",
    options,
    (locale) => new Intl.DateTimeFormat(locale, options),
  );
}

export function formatDate(
  value: Date | string | number,
  options: Intl.DateTimeFormatOptions = {
    dateStyle: "medium",
    timeStyle: "short",
  },
) {
  return dateFormat(options).format(new Date(value));
}

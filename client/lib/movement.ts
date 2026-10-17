export type IntervalUnit = "minutes" | "hours";

export const MIN_INTERVAL_SECONDS = 60;
export const MAX_INTERVAL_SECONDS = 86_400;

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

/** Converts an admin-entered interval into whole seconds, or null if invalid. */
export function intervalToSeconds(value: string, unit: IntervalUnit) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const seconds = Math.round(amount * (unit === "hours" ? 3600 : 60));
  return seconds >= MIN_INTERVAL_SECONDS && seconds <= MAX_INTERVAL_SECONDS
    ? seconds
    : null;
}

/** Splits stored seconds into the largest whole unit for editing. */
export function secondsToInterval(seconds: number): {
  value: string;
  unit: IntervalUnit;
} {
  if (seconds >= 3600 && seconds % 3600 === 0)
    return { value: String(seconds / 3600), unit: "hours" };
  return { value: String(Math.max(1, Math.round(seconds / 60))), unit: "minutes" };
}

/** "30 sec", "1 min", "15 mins", "2 hours", "1 hr 30 mins". */
export function formatInterval(seconds: number) {
  if (seconds < 60) return `${seconds} sec`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  const parts = [];
  if (hours) parts.push(`${hours} ${hours === 1 ? "hour" : "hours"}`);
  if (minutes) parts.push(`${minutes} ${minutes === 1 ? "min" : "mins"}`);
  return parts.join(" ");
}

export function describeMovement(investment: {
  movementDirection: "up" | "down" | "continuous" | "paused";
  movementAmount: string;
  movementIntervalSeconds: number;
}) {
  if (investment.movementDirection === "paused") return "Paused";
  const amount = usd.format(Number(investment.movementAmount));
  const every = formatInterval(investment.movementIntervalSeconds);
  if (investment.movementDirection === "continuous")
    return `Continuous · ±${amount} every ${every}`;
  return `${investment.movementDirection === "up" ? "+" : "−"}${amount} every ${every}`;
}

export const INTERVAL_ERROR =
  "Movement interval must be between 1 minute and 24 hours.";

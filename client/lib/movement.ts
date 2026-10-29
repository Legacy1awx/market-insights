import i18n from "@/i18n";
import { formatUsd } from "@/i18n/format";

export type IntervalUnit = "minutes" | "hours";

export const MIN_INTERVAL_SECONDS = 60;
export const MAX_INTERVAL_SECONDS = 86_400;

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
  if (seconds < 60) return i18n.t("movement.seconds", { count: seconds });
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  const parts = [];
  if (hours) parts.push(i18n.t("movement.hours", { count: hours }));
  if (minutes) parts.push(i18n.t("movement.minutes", { count: minutes }));
  return parts.join(" ");
}

export function describeMovement(investment: {
  movementDirection: "up" | "down" | "continuous" | "paused";
  movementAmount: string;
  movementIntervalSeconds: number;
}) {
  if (investment.movementDirection === "paused")
    return i18n.t("movement.paused");
  const amount = formatUsd(Number(investment.movementAmount));
  const interval = formatInterval(investment.movementIntervalSeconds);
  if (investment.movementDirection === "continuous")
    return i18n.t("movement.continuous", { amount, interval });
  return i18n.t("movement.every", {
    amount: `${investment.movementDirection === "up" ? "+" : "−"}${amount}`,
    interval,
  });
}

export const INTERVAL_ERROR =
  "Movement interval must be between 1 minute and 24 hours.";

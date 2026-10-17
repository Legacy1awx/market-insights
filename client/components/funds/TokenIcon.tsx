import { cn } from "@/lib/utils";

const TOKEN_COLORS: Record<string, string> = {
  USDT: "#26a17b",
  BTC: "#f7931a",
  ETH: "#627eea",
  SOL: "#9945ff",
};

const TOKEN_GLYPHS: Record<string, string> = {
  USDT: "₮",
  BTC: "₿",
  ETH: "Ξ",
  SOL: "S",
};

export function TokenIcon({
  symbol,
  size = "md",
}: {
  symbol: string;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <span
      className={cn("token-icon", `token-icon-${size}`)}
      style={{ background: TOKEN_COLORS[symbol] ?? "var(--brand)" }}
      aria-hidden="true"
    >
      {TOKEN_GLYPHS[symbol] ?? symbol.charAt(0)}
    </span>
  );
}

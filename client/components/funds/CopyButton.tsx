import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function CopyButton({
  value,
  label,
  className,
  compact = false,
}: {
  value: string;
  /** What is being copied, e.g. "BTC address". */
  label: string;
  className?: string;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`${label} copied`);
    } catch {
      toast.error(`Couldn't copy the ${label.toLowerCase()}`, {
        description: "Select the text and copy it manually.",
      });
    }
  };

  return (
    <button
      type="button"
      className={cn(
        "button",
        compact ? "button-subtle button-small" : "button-primary",
        className,
      )}
      onClick={() => void copy()}
      aria-label={`Copy ${label}`}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
      {!compact && (copied ? "Copied" : "Copy")}
    </button>
  );
}

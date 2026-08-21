import * as React from "react";
import { cn } from "@/lib/utils";

export function Badge({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  variant?: "default" | "gold" | "outline" | "male" | "female" | "muted";
}) {
  const styles: Record<string, string> = {
    default: "bg-clan-red text-white",
    gold: "bg-clan-gold text-clan-ink",
    outline: "border border-clan-brown/30 text-clan-brown dark:text-clan-cream/80",
    male: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
    female: "bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-200",
    muted: "bg-clan-cream text-clan-brown dark:bg-white/10 dark:text-clan-cream/80"
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        styles[variant],
        className
      )}
      {...props}
    />
  );
}

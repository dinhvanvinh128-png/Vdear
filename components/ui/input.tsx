import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type, ...props }, ref) => (
  <input
    type={type}
    ref={ref}
    className={cn(
      "flex h-10 w-full rounded-lg border border-clan-brown/25 bg-white px-3 py-2 text-sm text-clan-ink placeholder:text-clan-brown/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clan-gold disabled:opacity-50 dark:bg-clan-ink dark:text-clan-cream dark:border-white/15",
      className
    )}
    {...props}
  />
));
Input.displayName = "Input";

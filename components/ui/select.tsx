import * as React from "react";
import { cn } from "@/lib/utils";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      "flex h-10 w-full rounded-lg border border-clan-brown/25 bg-white px-3 text-sm text-clan-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clan-gold disabled:opacity-50 dark:bg-clan-ink dark:text-clan-cream dark:border-white/15",
      className
    )}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = "Select";

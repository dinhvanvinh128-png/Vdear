import * as React from "react";
import { cn } from "@/lib/utils";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "flex min-h-[80px] w-full rounded-lg border border-clan-brown/25 bg-white px-3 py-2 text-sm text-clan-ink placeholder:text-clan-brown/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clan-gold disabled:opacity-50 dark:bg-clan-ink dark:text-clan-cream dark:border-white/15",
      className
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

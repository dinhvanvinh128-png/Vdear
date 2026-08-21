import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export function StatCard({
  icon: Icon,
  label,
  value,
  accent
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  accent?: string;
}) {
  return (
    <Card className="flex items-center gap-4 p-5">
      <div
        className={cn(
          "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-clan-red/10 text-clan-red dark:bg-clan-gold/15 dark:text-clan-gold",
          accent
        )}
      >
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <div className="font-serif text-2xl font-bold leading-none">{value}</div>
        <div className="mt-1 text-sm text-clan-brown/70 dark:text-clan-cream/60">{label}</div>
      </div>
    </Card>
  );
}

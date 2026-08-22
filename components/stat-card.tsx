import { Card } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";

export function StatCard({
  icon: Icon,
  label,
  value
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
}) {
  return (
    <Card className="relative overflow-hidden p-5 text-center">
      <span className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-transparent via-clan-gold to-transparent" />
      <Icon className="mx-auto mb-2 h-5 w-5 text-clan-gold" />
      <div className="font-serif text-3xl font-semibold leading-none">{value}</div>
      <div className="mt-1.5 text-xs uppercase tracking-wider text-clan-brown/70 dark:text-clan-cream/55">
        {label}
      </div>
    </Card>
  );
}

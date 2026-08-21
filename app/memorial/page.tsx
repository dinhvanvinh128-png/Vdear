import type { Metadata } from "next";
import Link from "next/link";
import { Flame, MapPin, CalendarDays } from "lucide-react";
import { getMemorials } from "@/lib/data";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "Lịch giỗ",
  description: "Lịch giỗ của dòng họ theo âm lịch và dương lịch — giỗ hôm nay, trong tháng và sắp tới."
};

export default async function MemorialPage() {
  const memorials = await getMemorials();
  const today = new Date("2026-08-21");
  const withDate = memorials
    .map((m) => ({ ...m, _d: m.solar_date ? new Date(m.solar_date) : null }))
    .sort((a, b) => (a._d ? +a._d : 0) - (b._d ? +b._d : 0));

  const thisMonth = withDate.filter(
    (m) => m._d && m._d.getMonth() === today.getMonth() && m._d.getFullYear() === today.getFullYear()
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="section-title mb-2">Lịch giỗ</h1>
      <p className="mb-8 text-clan-brown/70 dark:text-clan-cream/60">
        Ngày giỗ của tổ tiên theo âm lịch, kèm ngày dương lịch tương ứng trong năm.
      </p>

      {thisMonth.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 font-serif text-lg font-semibold">Giỗ trong tháng này</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {thisMonth.map((m) => (
              <MemorialCard key={m.id} m={m} highlight />
            ))}
          </div>
        </div>
      )}

      <h2 className="mb-3 font-serif text-lg font-semibold">Lịch giỗ cả năm</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {withDate.map((m) => (
          <MemorialCard key={m.id} m={m} />
        ))}
      </div>
    </div>
  );
}

function MemorialCard({ m, highlight }: { m: any; highlight?: boolean }) {
  return (
    <Card className={highlight ? "ring-2 ring-clan-gold" : ""}>
      <CardContent className="flex gap-3 pt-5">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-clan-red/10 text-clan-red dark:bg-clan-gold/15 dark:text-clan-gold">
          <Flame className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <Link href={`/member/${m.member_id}`} className="font-serif font-semibold hover:text-clan-red">
            {m.member_name}
          </Link>
          <div className="mt-1 flex flex-wrap gap-2">
            {m.lunar_date && <Badge variant="muted">{m.lunar_date}</Badge>}
            {m.solar_date && (
              <Badge variant="outline">
                <CalendarDays className="mr-1 h-3 w-3" />
                {new Date(m.solar_date).toLocaleDateString("vi-VN")}
              </Badge>
            )}
          </div>
          {m.location && (
            <p className="mt-1 flex items-center gap-1 text-xs text-clan-brown/60">
              <MapPin className="h-3 w-3" /> {m.location}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

import type { Metadata } from "next";
import { CalendarDays, MapPin } from "lucide-react";
import { getEvents } from "@/lib/data";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "Sự kiện dòng họ",
  description: "Các sự kiện của dòng họ: giỗ tổ, họp họ, mừng thọ, cưới hỏi và nhiều hoạt động khác."
};

export default async function EventsPage() {
  const events = (await getEvents()).sort(
    (a, b) => +new Date(a.event_date) - +new Date(b.event_date)
  );
  const today = new Date("2026-08-21");

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="section-title mb-2">Sự kiện dòng họ</h1>
      <p className="mb-8 text-clan-brown/70 dark:text-clan-cream/60">
        Lịch các hoạt động chung của dòng họ.
      </p>
      <div className="space-y-4">
        {events.map((e) => {
          const d = new Date(e.event_date);
          const upcoming = d >= today;
          return (
            <Card key={e.id}>
              <CardContent className="flex gap-4 pt-5">
                <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-xl bg-clan-red text-white">
                  <span className="text-xl font-bold leading-none">{d.getDate()}</span>
                  <span className="text-xs">Th{d.getMonth() + 1}</span>
                </div>
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-serif text-lg font-semibold">{e.title}</h2>
                    <Badge variant={upcoming ? "gold" : "muted"}>
                      {upcoming ? "Sắp tới" : "Đã diễn ra"}
                    </Badge>
                    {e.type && <Badge variant="outline">{e.type}</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-clan-brown/80 dark:text-clan-cream/70">
                    {e.description}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-4 text-sm text-clan-brown/60 dark:text-clan-cream/50">
                    <span className="flex items-center gap-1">
                      <CalendarDays className="h-4 w-4" />
                      {d.toLocaleDateString("vi-VN")}
                    </span>
                    {e.location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-4 w-4" /> {e.location}
                      </span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

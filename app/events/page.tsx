import type { Metadata } from "next";
import { CalendarDays } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Sự kiện dòng họ",
  description: "Các sự kiện của dòng họ: giỗ tổ, họp họ, mừng thọ, cưới hỏi và nhiều hoạt động khác."
};

export default function EventsPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="section-title mb-2">Sự kiện dòng họ</h1>
      <p className="mb-8 text-clan-brown/70 dark:text-clan-cream/60">
        Lịch các hoạt động chung của dòng họ.
      </p>
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-clan-red/10 text-clan-red dark:bg-clan-gold/15 dark:text-clan-gold">
            <CalendarDays className="h-8 w-8" />
          </div>
          <h2 className="font-serif text-xl font-bold">Chưa có sự kiện</h2>
          <p className="max-w-md text-clan-brown/70 dark:text-clan-cream/60">
            Chức năng quản lý sự kiện (họp họ, giỗ tổ, mừng thọ…) sẽ được bổ sung ở
            bản cập nhật tiếp theo.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

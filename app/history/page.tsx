"use client";

import { ScrollText } from "lucide-react";
import { useStore, useHydrated } from "@/lib/store";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { lifeSpan } from "@/lib/utils";

export default function HistoryPage() {
  const hydrated = useHydrated();
  const members = useStore((s) => s.members);
  const ancestor = members.find((m) => m.generation === 1 && m.gender === "male")
    || members.find((m) => m.generation === 1);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <Badge variant="gold">Lịch sử</Badge>
      <h1 className="section-title mb-4 mt-3">Lịch sử dòng họ Lê</h1>

      {!hydrated ? (
        <div className="p-10 text-center text-clan-brown/60">Đang tải…</div>
      ) : ancestor ? (
        <Card className="mb-8">
          <CardContent className="flex flex-col items-center gap-4 pt-6 text-center sm:flex-row sm:text-left">
            <img
              src={ancestor.avatar_url || ""}
              alt={ancestor.full_name}
              className="h-24 w-24 rounded-full border-2 border-clan-gold bg-clan-cream object-cover"
            />
            <div>
              <div className="text-xs uppercase tracking-wide text-clan-brown/60">Thủy tổ</div>
              <h2 className="font-serif text-2xl font-bold">{ancestor.full_name}</h2>
              <p className="text-clan-brown/70 dark:text-clan-cream/60">{lifeSpan(ancestor)}</p>
              {ancestor.biography && (
                <p className="mt-2 text-sm text-clan-brown/80 dark:text-clan-cream/70">{ancestor.biography}</p>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-clan-red/10 text-clan-red dark:bg-clan-gold/15 dark:text-clan-gold">
              <ScrollText className="h-8 w-8" />
            </div>
            <h2 className="font-serif text-xl font-bold">Chưa có nội dung lịch sử</h2>
            <p className="max-w-md text-clan-brown/70 dark:text-clan-cream/60">
              Thêm thủy tổ (đời 1) trong trang Quản lý, phần lịch sử sẽ hiện tại đây.
              Bạn có thể ghi nguồn gốc, công trạng vào ô Tiểu sử của thủy tổ.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

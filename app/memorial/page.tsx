"use client";

import Link from "next/link";
import { Flame } from "lucide-react";
import { useStore, useHydrated } from "@/lib/store";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatYear } from "@/lib/utils";

export default function MemorialPage() {
  const hydrated = useHydrated();
  const members = useStore((s) => s.members);
  const deceased = members
    .filter((m) => !m.is_alive && m.death_date)
    .sort((a, b) => {
      const ma = new Date(a.death_date!).getMonth();
      const mb = new Date(b.death_date!).getMonth();
      return ma - mb;
    });

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="section-title mb-2">Lịch giỗ</h1>
      <p className="mb-8 text-clan-brown/70 dark:text-clan-cream/60">
        Ngày mất của các thành viên đã khuất trong dòng họ.
      </p>

      {!hydrated ? (
        <div className="p-10 text-center text-clan-brown/60">Đang tải…</div>
      ) : deceased.length === 0 ? (
        <div className="rounded-xl border border-dashed border-clan-brown/30 p-12 text-center text-clan-brown/60">
          Chưa có thông tin ngày giỗ. Lịch giỗ sẽ hiện khi bạn thêm thành viên đã mất
          (điền Ngày mất) trong trang Quản lý.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {deceased.map((m) => (
            <Card key={m.id}>
              <CardContent className="flex gap-3 pt-5">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-clan-red/10 text-clan-red dark:bg-clan-gold/15 dark:text-clan-gold">
                  <Flame className="h-6 w-6" />
                </div>
                <div>
                  <Link href={`/member/${m.id}`} className="font-serif font-semibold hover:text-clan-red">
                    {m.full_name}
                  </Link>
                  <div className="mt-1 flex flex-wrap gap-2">
                    <Badge variant="outline">
                      Mất: {new Date(m.death_date!).toLocaleDateString("vi-VN")}
                    </Badge>
                    {m.birth_date && <Badge variant="muted">Sinh {formatYear(m.birth_date)}</Badge>}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

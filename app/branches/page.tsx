"use client";

import Link from "next/link";
import { GitBranch, Users } from "lucide-react";
import { useStore, useHydrated } from "@/lib/store";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function BranchesPage() {
  const hydrated = useHydrated();
  const branches = useStore((s) => s.branches);
  const members = useStore((s) => s.members);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="section-title mb-1">Các chi họ</h1>
          <p className="text-clan-brown/70 dark:text-clan-cream/60">
            Dòng họ chia thành nhiều chi, mỗi chi do một vị tổ khởi lập.
          </p>
        </div>
        <Link href="/quan-ly"><Button>Quản lý</Button></Link>
      </div>

      {!hydrated ? (
        <div className="p-10 text-center text-clan-brown/60">Đang tải…</div>
      ) : branches.length === 0 ? (
        <div className="rounded-xl border border-dashed border-clan-brown/30 p-12 text-center text-clan-brown/60">
          Chưa có chi họ nào. Vào <Link href="/quan-ly" className="text-clan-red underline">Quản lý</Link> để thêm chi.
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-3">
          {branches.map((b) => {
            const count = members.filter((m) => m.branch_id === b.id).length;
            const ancestor = members.find((m) => m.id === b.ancestor_id);
            return (
              <Card key={b.id} className="flex flex-col">
                <div className="flex h-24 items-center justify-center bg-gradient-to-br from-clan-red/15 to-clan-gold/20">
                  <GitBranch className="h-10 w-10 text-clan-red dark:text-clan-gold" />
                </div>
                <CardContent className="flex flex-1 flex-col pt-5">
                  <h2 className="font-serif text-xl font-bold">{b.name}</h2>
                  {ancestor && (
                    <p className="mt-1 text-sm text-clan-brown/70 dark:text-clan-cream/60">
                      Vị tổ: {ancestor.full_name}
                    </p>
                  )}
                  {b.description && (
                    <p className="mt-2 flex-1 text-sm text-clan-brown/80 dark:text-clan-cream/70">{b.description}</p>
                  )}
                  <div className="mt-4">
                    <Badge variant="muted"><Users className="mr-1 h-3 w-3" /> {count} thành viên</Badge>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

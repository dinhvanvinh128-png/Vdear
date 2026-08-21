"use client";

import Link from "next/link";
import { useStore, useHydrated } from "@/lib/store";
import { MembersExplorer } from "@/components/members-explorer";
import { Button } from "@/components/ui/button";

export default function MembersPage() {
  const hydrated = useHydrated();
  const members = useStore((s) => s.members);
  const branches = useStore((s) => s.branches);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="section-title mb-1">Thành viên dòng họ</h1>
          <p className="text-clan-brown/70 dark:text-clan-cream/60">
            Tra cứu và tìm kiếm toàn bộ thành viên qua các đời và các chi.
          </p>
        </div>
        <Link href="/quan-ly"><Button>Quản lý</Button></Link>
      </div>

      {!hydrated ? (
        <div className="p-10 text-center text-clan-brown/60">Đang tải…</div>
      ) : members.length === 0 ? (
        <div className="rounded-xl border border-dashed border-clan-brown/30 p-12 text-center text-clan-brown/60">
          Chưa có thành viên nào. Vào <Link href="/quan-ly" className="text-clan-red underline">Quản lý</Link> để thêm.
        </div>
      ) : (
        <MembersExplorer members={members} branches={branches} />
      )}
    </div>
  );
}

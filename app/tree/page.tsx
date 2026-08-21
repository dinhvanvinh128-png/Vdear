"use client";

import Link from "next/link";
import { TreePine } from "lucide-react";
import { useStore, useHydrated } from "@/lib/store";
import { FamilyTree } from "@/components/tree/family-tree";
import { Button } from "@/components/ui/button";

export default function TreePage() {
  const hydrated = useHydrated();
  const members = useStore((s) => s.members);

  if (!hydrated) {
    return <div className="p-10 text-center text-clan-brown/60">Đang tải…</div>;
  }

  if (members.length === 0) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-clan-red/10 text-clan-red dark:bg-clan-gold/15 dark:text-clan-gold">
          <TreePine className="h-8 w-8" />
        </div>
        <h1 className="font-serif text-2xl font-bold">Cây gia phả còn trống</h1>
        <p className="mt-2 text-clan-brown/70 dark:text-clan-cream/60">
          Chưa có thành viên nào. Hãy vào trang Quản lý để thêm thành viên đầu tiên.
        </p>
        <Link href="/quan-ly" className="mt-6">
          <Button>Quản lý gia phả</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-4rem)] w-full">
      <FamilyTree members={members} />
    </div>
  );
}

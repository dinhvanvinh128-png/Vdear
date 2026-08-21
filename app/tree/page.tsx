import type { Metadata } from "next";
import Link from "next/link";
import { TreePine } from "lucide-react";
import { getMembers } from "@/lib/data";
import { FamilyTree } from "@/components/tree/family-tree";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Cây gia phả",
  description: "Cây phả hệ tương tác của dòng họ — nhiều đời, nhiều chi, phóng to, tìm kiếm và xem hồ sơ từng người."
};

export default async function TreePage() {
  const members = await getMembers();

  if (members.length === 0) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-clan-red/10 text-clan-red dark:bg-clan-gold/15 dark:text-clan-gold">
          <TreePine className="h-8 w-8" />
        </div>
        <h1 className="font-serif text-2xl font-bold">Cây gia phả còn trống</h1>
        <p className="mt-2 text-clan-brown/70 dark:text-clan-cream/60">
          Chưa có thành viên nào để hiển thị. Hãy đăng nhập quản trị và thêm thành
          viên đầu tiên để dựng cây gia phả.
        </p>
        <Link href="/login" className="mt-6">
          <Button>Đăng nhập quản trị</Button>
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

import type { Metadata } from "next";
import Link from "next/link";
import { GitBranch, Users, ArrowRight } from "lucide-react";
import { getBranches, getMembers } from "@/lib/data";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "Chi họ",
  description: "Các chi trong dòng họ, người sáng lập, mô tả và số thành viên mỗi chi."
};

export default async function BranchesPage() {
  const [branches, members] = await Promise.all([getBranches(), getMembers()]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="section-title mb-2">Các chi họ</h1>
      <p className="mb-8 text-clan-brown/70 dark:text-clan-cream/60">
        Dòng họ chia thành nhiều chi, mỗi chi do một vị tổ khởi lập.
      </p>
      {branches.length === 0 && (
        <div className="rounded-xl border border-dashed border-clan-brown/30 p-12 text-center text-clan-brown/60">
          Chưa có chi họ nào. Hãy đăng nhập quản trị để thêm chi họ.
        </div>
      )}
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
                <p className="mt-2 flex-1 text-sm text-clan-brown/80 dark:text-clan-cream/70">
                  {b.description}
                </p>
                <div className="mt-4 flex items-center justify-between">
                  <Badge variant="muted">
                    <Users className="mr-1 h-3 w-3" /> {count} thành viên
                  </Badge>
                  <Link
                    href="/members"
                    className="flex items-center gap-1 text-sm font-medium text-clan-red hover:underline dark:text-clan-gold"
                  >
                    Xem <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

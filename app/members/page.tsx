import type { Metadata } from "next";
import { getMembers, getBranches } from "@/lib/data";
import { MembersExplorer } from "@/components/members-explorer";

export const metadata: Metadata = {
  title: "Thành viên",
  description: "Danh sách toàn bộ thành viên dòng họ, tìm kiếm và lọc theo chi, theo đời."
};

export default async function MembersPage() {
  const [members, branches] = await Promise.all([getMembers(), getBranches()]);
  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <h1 className="section-title mb-2">Thành viên dòng họ</h1>
      <p className="mb-8 text-clan-brown/70 dark:text-clan-cream/60">
        Tra cứu và tìm kiếm toàn bộ thành viên qua các đời và các chi.
      </p>
      <MembersExplorer members={members} branches={branches} />
    </div>
  );
}

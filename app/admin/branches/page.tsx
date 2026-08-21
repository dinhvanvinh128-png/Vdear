import { getBranches, getMembers } from "@/lib/data";
import { BranchManager } from "@/components/admin/branch-manager";

export const dynamic = "force-dynamic";

export default async function AdminBranches() {
  const [branches, members] = await Promise.all([getBranches(), getMembers()]);
  return (
    <div>
      <h1 className="mb-6 font-serif text-2xl font-bold">Quản lý chi họ</h1>
      <BranchManager branches={branches} members={members} />
    </div>
  );
}

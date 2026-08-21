import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getMembers, getBranches } from "@/lib/data";
import { MemberForm } from "@/components/admin/member-form";

export const dynamic = "force-dynamic";

export default async function NewMember() {
  const [members, branches] = await Promise.all([getMembers(), getBranches()]);
  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/admin/members" className="mb-4 inline-flex items-center gap-1 text-sm text-clan-brown/70 hover:text-clan-red">
        <ArrowLeft className="h-4 w-4" /> Danh sách thành viên
      </Link>
      <h1 className="mb-6 font-serif text-2xl font-bold">Thêm thành viên</h1>
      <MemberForm members={members} branches={branches} />
    </div>
  );
}

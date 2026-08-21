import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getMembers, getBranches } from "@/lib/data";
import { MemberForm } from "@/components/admin/member-form";

export const dynamic = "force-dynamic";

export default async function EditMember({ params }: { params: { id: string } }) {
  const [members, branches] = await Promise.all([getMembers(), getBranches()]);
  const member = members.find((m) => m.id === params.id);
  if (!member) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/admin/members" className="mb-4 inline-flex items-center gap-1 text-sm text-clan-brown/70 hover:text-clan-red">
        <ArrowLeft className="h-4 w-4" /> Danh sách thành viên
      </Link>
      <h1 className="mb-6 font-serif text-2xl font-bold">Sửa: {member.full_name}</h1>
      <MemberForm member={member} members={members} branches={branches} />
    </div>
  );
}

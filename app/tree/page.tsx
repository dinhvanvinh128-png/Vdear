import type { Metadata } from "next";
import { getMembers } from "@/lib/data";
import { FamilyTree } from "@/components/tree/family-tree";

export const metadata: Metadata = {
  title: "Cây gia phả",
  description: "Cây phả hệ tương tác của dòng họ — nhiều đời, nhiều chi, phóng to, tìm kiếm và xem hồ sơ từng người."
};

export default async function TreePage() {
  const members = await getMembers();
  return (
    <div className="h-[calc(100vh-4rem)] w-full">
      <FamilyTree members={members} />
    </div>
  );
}

import Link from "next/link";
import { UserPlus, Pencil } from "lucide-react";
import { getMembers, getBranches } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { lifeSpan } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminMembers() {
  const [members, branches] = await Promise.all([getMembers(), getBranches()]);
  const branchName = (id?: string | null) => branches.find((b) => b.id === id)?.name ?? "—";

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold">Thành viên</h1>
          <p className="text-sm text-clan-brown/60">{members.length} người</p>
        </div>
        <Link href="/admin/members/new">
          <Button><UserPlus className="h-4 w-4" /> Thêm thành viên</Button>
        </Link>
      </div>

      {members.length === 0 ? (
        <Card className="p-12 text-center text-clan-brown/60">
          Chưa có thành viên nào. Bấm “Thêm thành viên” để bắt đầu.
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-clan-brown/15 text-clan-brown/60">
              <tr>
                <th className="p-3">Họ tên</th>
                <th className="p-3">Đời</th>
                <th className="p-3">Chi</th>
                <th className="p-3">Năm sinh–mất</th>
                <th className="p-3">Trạng thái</th>
                <th className="p-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-b border-clan-brown/10 last:border-0 hover:bg-clan-cream/50 dark:hover:bg-white/5">
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <img src={m.avatar_url || ""} alt="" className="h-8 w-8 rounded-full bg-clan-cream object-cover" />
                      <div>
                        <div className="font-medium">{m.full_name}</div>
                        {m.nickname && <div className="text-xs text-clan-brown/50">({m.nickname})</div>}
                      </div>
                    </div>
                  </td>
                  <td className="p-3">{m.generation}</td>
                  <td className="p-3">{branchName(m.branch_id)}</td>
                  <td className="p-3">{lifeSpan(m) || "—"}</td>
                  <td className="p-3">
                    <Badge variant={m.is_alive ? "male" : "outline"}>
                      {m.is_alive ? "Còn sống" : "Đã mất"}
                    </Badge>
                  </td>
                  <td className="p-3 text-right">
                    <Link href={`/admin/members/${m.id}/edit`}>
                      <Button variant="outline" size="sm"><Pencil className="h-3.5 w-3.5" /> Sửa</Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { UserPlus, Pencil, Download, Upload, Trash2, Plus } from "lucide-react";
import { useStore, useHydrated } from "@/lib/store";
import { useToast } from "@/components/ui/toast";
import { MemberEditor } from "@/components/manage/member-editor";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { lifeSpan } from "@/lib/utils";
import { useAuth } from "@/lib/auth-store";
import { supabaseConfigured } from "@/lib/supabase/client";
import type { Member } from "@/types";

export default function ManagePage() {
  const hydrated = useHydrated();
  const configured = supabaseConfigured();
  const userId = useAuth((s) => s.userId);
  const authReady = useAuth((s) => s.ready);
  const members = useStore((s) => s.members);
  const branches = useStore((s) => s.branches);
  const deleteMember = useStore((s) => s.deleteMember);
  const addBranch = useStore((s) => s.addBranch);
  const deleteBranch = useStore((s) => s.deleteBranch);
  const replaceAll = useStore((s) => s.replaceAll);
  const clearAll = useStore((s) => s.clearAll);
  const push = useToast((s) => s.push);

  const [editing, setEditing] = useState<Member | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!hydrated || (configured && !authReady)) {
    return <div className="p-10 text-center text-clan-brown/60">Đang tải…</div>;
  }

  // Khi đã bật đám mây: bắt buộc đăng nhập mới được sửa (ai cũng xem được ở các trang khác)
  if (configured && !userId) {
    return (
      <div className="mx-auto max-w-md px-4 py-20">
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
            <span className="seal flex h-12 w-12 text-lg font-semibold">Lê</span>
            <h1 className="font-serif text-xl font-bold">Cần đăng nhập để chỉnh sửa</h1>
            <p className="text-sm text-clan-brown/70 dark:text-clan-cream/60">
              Gia phả được lưu chung trên đám mây. Hãy đăng nhập để thêm/sửa thành viên;
              mọi người khác vẫn xem được bình thường.
            </p>
            <Link href="/login"><Button>Đăng nhập</Button></Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const branchName = (id?: string | null) => branches.find((b) => b.id === id)?.name ?? "—";

  function openAdd() {
    setEditing(null);
    setShowEditor(true);
  }
  function openEdit(m: Member) {
    setEditing(m);
    setShowEditor(true);
  }

  function exportJSON() {
    const blob = new Blob([JSON.stringify({ members, branches }, null, 2)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "gia-pha-le.json";
    a.click();
    URL.revokeObjectURL(url);
    push("success", "Đã xuất dữ liệu.");
  }

  function importJSON(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        replaceAll({ members: data.members ?? [], branches: data.branches ?? [] });
        push("success", "Đã nhập dữ liệu.");
      } catch {
        push("error", "Tệp không hợp lệ.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function onAddBranch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const name = String(fd.get("bname") || "").trim();
    if (!name) return;
    addBranch({ name, ancestor_id: (fd.get("bancestor") as string) || null });
    form.reset();
    push("success", "Đã thêm chi họ.");
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold">Quản lý gia phả</h1>
          <p className="text-sm text-clan-brown/60">
            {members.length} thành viên · {branches.length} chi · Lưu ngay trên trình duyệt này
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={openAdd}><UserPlus className="h-4 w-4" /> Thêm thành viên</Button>
          <Button variant="outline" onClick={exportJSON}><Download className="h-4 w-4" /> Xuất</Button>
          <Button variant="outline" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /> Nhập</Button>
          <ConfirmButton
            label="Xóa hết"
            confirmLabel="Chắc chắn xóa tất cả?"
            onConfirm={() => { clearAll(); push("success", "Đã xóa toàn bộ."); }}
          />
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={importJSON} />
        </div>
      </div>

      {/* Danh sách thành viên */}
      {members.length === 0 ? (
        <Card className="p-12 text-center text-clan-brown/60">
          Chưa có thành viên nào. Bấm <b>Thêm thành viên</b> để bắt đầu (nên thêm thủy tổ đời 1 trước).
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-clan-brown/15 text-clan-brown/60">
              <tr>
                <th className="p-3">Họ tên</th>
                <th className="p-3">Đời</th>
                <th className="p-3">Chi</th>
                <th className="p-3">Năm</th>
                <th className="p-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-b border-clan-brown/10 last:border-0">
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <img src={m.avatar_url || ""} alt="" className="h-8 w-8 rounded-full bg-clan-cream object-cover" />
                      <span className="font-medium">{m.full_name}</span>
                      {!m.is_alive && <span title="Đã mất">🕯️</span>}
                    </div>
                  </td>
                  <td className="p-3">{m.generation}</td>
                  <td className="p-3">{branchName(m.branch_id)}</td>
                  <td className="p-3">{lifeSpan(m) || "—"}</td>
                  <td className="p-3">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => openEdit(m)}>
                        <Pencil className="h-3.5 w-3.5" /> Sửa
                      </Button>
                      <ConfirmButton onConfirm={() => { deleteMember(m.id); push("success", "Đã xóa."); }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Chi họ */}
      <h2 className="mb-3 mt-10 font-serif text-xl font-bold">Chi họ</h2>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-2 lg:col-span-2">
          {branches.length === 0 ? (
            <Card className="p-6 text-center text-clan-brown/60">Chưa có chi họ nào.</Card>
          ) : (
            branches.map((b) => (
              <Card key={b.id}>
                <CardContent className="flex items-center justify-between gap-4 pt-4">
                  <div>
                    <div className="font-serif font-semibold">{b.name}</div>
                    <div className="text-xs text-clan-brown/50">
                      {members.filter((m) => m.branch_id === b.id).length} thành viên
                    </div>
                  </div>
                  <ConfirmButton onConfirm={() => { deleteBranch(b.id); push("success", "Đã xóa chi."); }} />
                </CardContent>
              </Card>
            ))
          )}
        </div>
        <Card className="h-fit">
          <CardContent className="pt-5">
            <h3 className="mb-3 font-serif font-semibold">Thêm chi họ</h3>
            <form onSubmit={onAddBranch} className="space-y-3">
              <Input name="bname" placeholder="Tên chi (vd: Chi Trưởng)" />
              <select name="bancestor" className="h-10 w-full rounded-lg border border-clan-brown/25 bg-white px-3 text-sm dark:bg-clan-ink dark:text-clan-cream">
                <option value="">— Vị tổ của chi (tùy chọn) —</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>{m.full_name}</option>
                ))}
              </select>
              <Button type="submit" className="w-full"><Plus className="h-4 w-4" /> Thêm chi</Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="mt-8 text-center">
        <Link href="/tree" className="text-sm font-medium text-clan-red hover:underline dark:text-clan-gold">
          Xem cây gia phả →
        </Link>
      </div>

      {showEditor && <MemberEditor member={editing} onClose={() => setShowEditor(false)} />}
    </div>
  );
}

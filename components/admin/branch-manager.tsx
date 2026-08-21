"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import type { Branch, Member } from "@/types";
import { branchSchema } from "@/lib/validators";
import { createBranch, deleteBranch } from "@/lib/actions/members";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";

export function BranchManager({
  branches,
  members
}: {
  branches: Branch[];
  members: Member[];
}) {
  const router = useRouter();
  const push = useToast((s) => s.push);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const parsed = branchSchema.safeParse({
      name: fd.get("name"),
      description: fd.get("description"),
      ancestor_id: fd.get("ancestor_id")
    });
    if (!parsed.success) {
      push("error", parsed.error.errors[0].message);
      return;
    }
    setSaving(true);
    const res = await createBranch(parsed.data);
    setSaving(false);
    if (res.ok) {
      push("success", "Đã thêm chi họ.");
      form.reset();
      router.refresh();
    } else {
      push("error", res.error || "Có lỗi xảy ra.");
    }
  }

  async function onDelete(id: string) {
    const res = await deleteBranch(id);
    if (res.ok) {
      push("success", "Đã xóa chi họ.");
      router.refresh();
    } else {
      push("error", res.error || "Không xóa được.");
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        {branches.length === 0 ? (
          <Card className="p-10 text-center text-clan-brown/60">Chưa có chi họ nào.</Card>
        ) : (
          <div className="space-y-3">
            {branches.map((b) => (
              <Card key={b.id}>
                <CardContent className="flex items-start justify-between gap-4 pt-5">
                  <div>
                    <h3 className="font-serif font-semibold">{b.name}</h3>
                    {b.description && (
                      <p className="mt-1 text-sm text-clan-brown/70 dark:text-clan-cream/60">{b.description}</p>
                    )}
                    <p className="mt-1 text-xs text-clan-brown/50">
                      {members.filter((m) => m.branch_id === b.id).length} thành viên
                    </p>
                  </div>
                  <ConfirmButton onConfirm={() => onDelete(b.id)} />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Card className="h-fit">
        <CardContent className="pt-6">
          <h2 className="mb-4 font-serif text-lg font-semibold">Thêm chi họ</h2>
          <form onSubmit={onSubmit} className="space-y-3">
            <div>
              <Label htmlFor="name">Tên chi *</Label>
              <Input id="name" name="name" placeholder="Chi Trưởng" />
            </div>
            <div>
              <Label htmlFor="ancestor_id">Vị tổ của chi</Label>
              <Select id="ancestor_id" name="ancestor_id" defaultValue="">
                <option value="">— Không —</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>{m.full_name}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="description">Mô tả</Label>
              <Textarea id="description" name="description" rows={3} />
            </div>
            <Button type="submit" className="w-full" disabled={saving}>
              <Plus className="h-4 w-4" /> {saving ? "Đang thêm..." : "Thêm chi"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

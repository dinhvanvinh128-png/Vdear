"use client";

import { useStore } from "@/lib/store";
import { memberSchema } from "@/lib/validators";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import type { Member } from "@/types";

export function MemberEditor({
  member,
  onClose
}: {
  member?: Member | null;
  onClose: () => void;
}) {
  const members = useStore((s) => s.members);
  const branches = useStore((s) => s.branches);
  const addMember = useStore((s) => s.addMember);
  const updateMember = useStore((s) => s.updateMember);
  const push = useToast((s) => s.push);

  const others = members.filter((m) => m.id !== member?.id);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const raw = {
      full_name: fd.get("full_name"),
      nickname: fd.get("nickname"),
      gender: fd.get("gender"),
      birth_date: fd.get("birth_date"),
      death_date: fd.get("death_date"),
      birth_place: fd.get("birth_place"),
      hometown: fd.get("hometown"),
      address: fd.get("address"),
      occupation: fd.get("occupation"),
      biography: fd.get("biography"),
      avatar_url: fd.get("avatar_url"),
      generation: fd.get("generation"),
      branch_id: fd.get("branch_id"),
      is_alive: fd.get("is_alive") === "on",
      visibility: "public",
      father_id: fd.get("father_id"),
      mother_id: fd.get("mother_id"),
      spouse_id: fd.get("spouse_id")
    };
    const parsed = memberSchema.safeParse(raw);
    if (!parsed.success) {
      push("error", parsed.error.errors[0].message);
      return;
    }
    const res = member ? updateMember(member.id, parsed.data) : addMember(parsed.data);
    if (res.ok) {
      push("success", member ? "Đã cập nhật." : "Đã thêm thành viên.");
      onClose();
    } else {
      push("error", res.error || "Có lỗi xảy ra.");
    }
  }

  return (
    <div
      className="fixed inset-0 z-[150] flex items-start justify-center overflow-auto bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="my-8 w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl dark:bg-clan-ink"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 font-serif text-xl font-bold">
          {member ? "Sửa thành viên" : "Thêm thành viên"}
        </h2>
        <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="full_name">Họ và tên *</Label>
            <Input id="full_name" name="full_name" defaultValue={member?.full_name} placeholder="Lê Văn A" />
          </div>
          <div>
            <Label htmlFor="nickname">Tên thường gọi</Label>
            <Input id="nickname" name="nickname" defaultValue={member?.nickname ?? ""} />
          </div>
          <div>
            <Label htmlFor="gender">Giới tính</Label>
            <Select id="gender" name="gender" defaultValue={member?.gender ?? "male"}>
              <option value="male">Nam</option>
              <option value="female">Nữ</option>
              <option value="other">Khác</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="birth_date">Ngày sinh</Label>
            <Input id="birth_date" name="birth_date" type="date" defaultValue={member?.birth_date ?? ""} />
          </div>
          <div>
            <Label htmlFor="death_date">Ngày mất</Label>
            <Input id="death_date" name="death_date" type="date" defaultValue={member?.death_date ?? ""} />
          </div>
          <div>
            <Label htmlFor="generation">Đời thứ *</Label>
            <Input id="generation" name="generation" type="number" min={1} max={30} defaultValue={member?.generation ?? 1} />
          </div>
          <div>
            <Label htmlFor="branch_id">Chi họ</Label>
            <Select id="branch_id" name="branch_id" defaultValue={member?.branch_id ?? ""}>
              <option value="">— Chưa xếp chi —</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="father_id">Cha</Label>
            <Select id="father_id" name="father_id" defaultValue={member?.father_id ?? ""}>
              <option value="">— Không —</option>
              {others.filter((m) => m.gender !== "female").map((m) => (
                <option key={m.id} value={m.id}>{m.full_name}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="mother_id">Mẹ</Label>
            <Select id="mother_id" name="mother_id" defaultValue={member?.mother_id ?? ""}>
              <option value="">— Không —</option>
              {others.filter((m) => m.gender !== "male").map((m) => (
                <option key={m.id} value={m.id}>{m.full_name}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="spouse_id">Vợ / Chồng</Label>
            <Select id="spouse_id" name="spouse_id" defaultValue={member?.spouse_id ?? ""}>
              <option value="">— Không —</option>
              {others.map((m) => (
                <option key={m.id} value={m.id}>{m.full_name}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="hometown">Quê quán</Label>
            <Input id="hometown" name="hometown" defaultValue={member?.hometown ?? ""} />
          </div>
          <div>
            <Label htmlFor="occupation">Nghề nghiệp</Label>
            <Input id="occupation" name="occupation" defaultValue={member?.occupation ?? ""} />
          </div>
          <div>
            <Label htmlFor="birth_place">Nơi sinh</Label>
            <Input id="birth_place" name="birth_place" defaultValue={member?.birth_place ?? ""} />
          </div>
          <div>
            <Label htmlFor="address">Nơi ở</Label>
            <Input id="address" name="address" defaultValue={member?.address ?? ""} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="avatar_url">Ảnh đại diện (URL)</Label>
            <Input id="avatar_url" name="avatar_url" defaultValue={member?.avatar_url ?? ""} placeholder="https://... (để trống sẽ tự tạo ảnh)" />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="biography">Tiểu sử</Label>
            <Textarea id="biography" name="biography" rows={3} defaultValue={member?.biography ?? ""} />
          </div>
          <label className="flex items-center gap-2 sm:col-span-2">
            <input type="checkbox" name="is_alive" defaultChecked={member ? member.is_alive : true} className="h-4 w-4" />
            <span className="text-sm">Còn sống</span>
          </label>

          <div className="mt-2 flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="outline" onClick={onClose}>Hủy</Button>
            <Button type="submit">Lưu</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

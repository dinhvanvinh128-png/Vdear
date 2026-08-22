"use client";

import { useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { useStore } from "@/lib/store";
import { memberSchema } from "@/lib/validators";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import type { Member } from "@/types";

const isDataUrl = (s: string) => s.startsWith("data:");

/** Đọc ảnh, cắt vuông và thu nhỏ về 256px, trả về data URL JPEG. */
function fileToAvatar(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const size = 256;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject();
      const s = Math.min(img.width, img.height);
      const sx = (img.width - s) / 2;
      const sy = (img.height - s) / 2;
      ctx.drawImage(img, sx, sy, s, s, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject();
    };
    img.src = url;
  });
}

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
  const [avatar, setAvatar] = useState<string>(member?.avatar_url ?? "");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      push("error", "Vui lòng chọn tệp ảnh.");
      return;
    }
    setBusy(true);
    try {
      setAvatar(await fileToAvatar(file));
    } catch {
      push("error", "Không đọc được ảnh.");
    }
    setBusy(false);
    e.target.value = "";
  }

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
      avatar_url: avatar,
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
            <Label>Ảnh đại diện</Label>
            <div className="flex items-center gap-4">
              {avatar ? (
                <img src={avatar} alt="" className="h-16 w-16 shrink-0 rounded-full object-cover ring-2 ring-clan-gold/50" />
              ) : (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-clan-cream text-clan-brown/40 ring-2 ring-clan-gold/30 dark:bg-white/5">
                  <ImagePlus className="h-6 w-6" />
                </div>
              )}
              <div className="flex-1 space-y-2">
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickFile} />
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>
                    <ImagePlus className="h-4 w-4" /> {busy ? "Đang xử lý..." : "Tải ảnh lên"}
                  </Button>
                  {avatar && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setAvatar("")}>
                      <X className="h-4 w-4" /> Xóa ảnh
                    </Button>
                  )}
                </div>
                <Input
                  placeholder="hoặc dán đường dẫn ảnh (URL)..."
                  value={isDataUrl(avatar) ? "" : avatar}
                  onChange={(e) => setAvatar(e.target.value)}
                  className="h-9"
                />
              </div>
            </div>
            <p className="mt-1 text-xs text-clan-brown/50">
              Ảnh tự thu nhỏ ~256px và lưu trong máy. Để trống sẽ tự tạo ảnh minh họa.
            </p>
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

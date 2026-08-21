"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser, isAdmin } from "@/lib/auth";
import { memberSchema, branchSchema } from "@/lib/validators";

interface ActionResult {
  ok: boolean;
  error?: string;
  id?: string;
}

async function guard() {
  const s = await getSessionUser();
  if (!s.configured) return { supabase: null, error: "Chưa cấu hình Supabase." };
  if (!isAdmin(s)) return { supabase: null, error: "Bạn cần quyền quản trị để thực hiện." };
  return { supabase: createClient(), error: null };
}

/** Kiểm tra chọn cha/mẹ có tạo vòng lặp không (A là cha B, B là cha A...). */
async function createsCycle(
  supabase: any,
  selfId: string | null,
  parentId: string | null
): Promise<boolean> {
  if (!parentId || !selfId) return false;
  if (parentId === selfId) return true;
  const { data } = await supabase.from("members").select("id, father_id, mother_id");
  const map = new Map<string, { father_id: string | null; mother_id: string | null }>();
  for (const r of data ?? []) map.set(r.id, { father_id: r.father_id, mother_id: r.mother_id });

  const seen = new Set<string>();
  const stack = [parentId];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === selfId) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    const p = map.get(cur);
    if (p?.father_id) stack.push(p.father_id);
    if (p?.mother_id) stack.push(p.mother_id);
  }
  return false;
}

/** Đồng bộ quan hệ vợ/chồng hai chiều. */
async function syncSpouse(supabase: any, id: string, spouseId: string | null) {
  // gỡ liên kết cũ trỏ về id (nếu đổi bạn đời)
  await supabase
    .from("members")
    .update({ spouse_id: null })
    .eq("spouse_id", id)
    .neq("id", spouseId ?? "__none__");
  if (spouseId) {
    await supabase.from("members").update({ spouse_id: id }).eq("id", spouseId);
  }
}

export async function createMember(input: unknown): Promise<ActionResult> {
  const { supabase, error } = await guard();
  if (error || !supabase) return { ok: false, error: error! };

  const parsed = memberSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0].message };
  const data = parsed.data;

  const s = await getSessionUser();
  const payload = {
    ...data,
    is_alive: data.death_date ? false : data.is_alive,
    created_by: s.userId
  };

  const { data: inserted, error: insErr } = await supabase
    .from("members")
    .insert(payload)
    .select("id")
    .single();
  if (insErr) return { ok: false, error: insErr.message };

  if (data.father_id && (await createsCycle(supabase, inserted.id, data.father_id)))
    return { ok: false, error: "Quan hệ cha tạo vòng lặp trong gia phả." };

  await syncSpouse(supabase, inserted.id, data.spouse_id ?? null);

  revalidatePath("/admin/members");
  revalidatePath("/tree");
  revalidatePath("/members");
  return { ok: true, id: inserted.id };
}

export async function updateMember(id: string, input: unknown): Promise<ActionResult> {
  const { supabase, error } = await guard();
  if (error || !supabase) return { ok: false, error: error! };

  const parsed = memberSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0].message };
  const data = parsed.data;

  if (data.father_id === id || data.mother_id === id)
    return { ok: false, error: "Không thể chọn chính mình làm cha/mẹ." };
  if (data.spouse_id === id)
    return { ok: false, error: "Không thể chọn chính mình làm vợ/chồng." };
  if (await createsCycle(supabase, id, data.father_id ?? null))
    return { ok: false, error: "Quan hệ cha tạo vòng lặp trong gia phả." };
  if (await createsCycle(supabase, id, data.mother_id ?? null))
    return { ok: false, error: "Quan hệ mẹ tạo vòng lặp trong gia phả." };

  const { error: upErr } = await supabase
    .from("members")
    .update({
      ...data,
      is_alive: data.death_date ? false : data.is_alive,
      updated_at: new Date().toISOString()
    })
    .eq("id", id);
  if (upErr) return { ok: false, error: upErr.message };

  await syncSpouse(supabase, id, data.spouse_id ?? null);

  revalidatePath("/admin/members");
  revalidatePath(`/member/${id}`);
  revalidatePath("/tree");
  revalidatePath("/members");
  return { ok: true, id };
}

export async function deleteMember(id: string): Promise<ActionResult> {
  const { supabase, error } = await guard();
  if (error || !supabase) return { ok: false, error: error! };

  // gỡ mọi tham chiếu tới người này
  await supabase.from("members").update({ father_id: null }).eq("father_id", id);
  await supabase.from("members").update({ mother_id: null }).eq("mother_id", id);
  await supabase.from("members").update({ spouse_id: null }).eq("spouse_id", id);

  const { error: delErr } = await supabase.from("members").delete().eq("id", id);
  if (delErr) return { ok: false, error: delErr.message };

  revalidatePath("/admin/members");
  revalidatePath("/tree");
  revalidatePath("/members");
  return { ok: true };
}

export async function createBranch(input: unknown): Promise<ActionResult> {
  const { supabase, error } = await guard();
  if (error || !supabase) return { ok: false, error: error! };

  const parsed = branchSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0].message };

  const { data: inserted, error: insErr } = await supabase
    .from("branches")
    .insert(parsed.data)
    .select("id")
    .single();
  if (insErr) return { ok: false, error: insErr.message };

  revalidatePath("/admin/branches");
  revalidatePath("/branches");
  return { ok: true, id: inserted.id };
}

export async function deleteBranch(id: string): Promise<ActionResult> {
  const { supabase, error } = await guard();
  if (error || !supabase) return { ok: false, error: error! };
  const { error: delErr } = await supabase.from("branches").delete().eq("id", id);
  if (delErr) return { ok: false, error: delErr.message };
  revalidatePath("/admin/branches");
  revalidatePath("/branches");
  return { ok: true };
}

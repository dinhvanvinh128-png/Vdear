import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/utils";
import {
  demoMembers,
  demoBranches,
  demoEvents,
  demoMemorials
} from "@/lib/demo-data";
import type {
  Member,
  Branch,
  ClanEvent,
  MemorialDay,
  ClanStats
} from "@/types";

/**
 * Lớp truy cập dữ liệu. Nếu Supabase đã cấu hình → đọc từ database.
 * Nếu chưa → dùng dữ liệu demo để website không trống khi chạy lần đầu.
 */

export async function getMembers(): Promise<Member[]> {
  if (isSupabaseConfigured()) {
    const supabase = createClient();
    const { data, error } = await supabase!
      .from("members")
      .select("*")
      .order("generation", { ascending: true })
      .order("birth_date", { ascending: true });
    if (!error && data) return data as Member[];
  }
  return demoMembers;
}

export async function getMemberById(id: string): Promise<Member | null> {
  if (isSupabaseConfigured()) {
    const supabase = createClient();
    const { data } = await supabase!
      .from("members")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (data) return data as Member;
    return null;
  }
  return demoMembers.find((m) => m.id === id) ?? null;
}

export async function getBranches(): Promise<Branch[]> {
  if (isSupabaseConfigured()) {
    const supabase = createClient();
    const { data } = await supabase!.from("branches").select("*").order("name");
    if (data) return data as Branch[];
  }
  return demoBranches;
}

export async function getEvents(): Promise<ClanEvent[]> {
  if (isSupabaseConfigured()) {
    const supabase = createClient();
    const { data } = await supabase!
      .from("events")
      .select("*")
      .order("event_date", { ascending: true });
    if (data) return data as ClanEvent[];
  }
  return demoEvents;
}

export async function getMemorials(): Promise<MemorialDay[]> {
  if (isSupabaseConfigured()) {
    const supabase = createClient();
    const { data } = await supabase!.from("memorial_days").select("*");
    if (data && data.length) return data as MemorialDay[];
  }
  return demoMemorials;
}

export async function getStats(): Promise<ClanStats> {
  const members = await getMembers();
  const branches = await getBranches();
  const generations = members.reduce((max, m) => Math.max(max, m.generation), 0);
  return {
    total: members.length,
    male: members.filter((m) => m.gender === "male").length,
    female: members.filter((m) => m.gender === "female").length,
    alive: members.filter((m) => m.is_alive).length,
    deceased: members.filter((m) => !m.is_alive).length,
    generations,
    branches: branches.length
  };
}

/* ----------------- Helpers quan hệ (thuần, dùng chung) ----------------- */

export function childrenOf(all: Member[], id: string): Member[] {
  return all
    .filter((m) => m.father_id === id || m.mother_id === id)
    .sort(
      (a, b) =>
        (a.birth_date ? +new Date(a.birth_date) : 0) -
        (b.birth_date ? +new Date(b.birth_date) : 0)
    );
}

export function siblingsOf(all: Member[], m: Member): Member[] {
  if (!m.father_id && !m.mother_id) return [];
  return all.filter(
    (x) =>
      x.id !== m.id &&
      ((m.father_id && x.father_id === m.father_id) ||
        (m.mother_id && x.mother_id === m.mother_id))
  );
}

export function spouseOf(all: Member[], m: Member): Member | null {
  if (!m.spouse_id) return null;
  return all.find((x) => x.id === m.spouse_id) ?? null;
}

export function parentsOf(all: Member[], m: Member): {
  father: Member | null;
  mother: Member | null;
} {
  return {
    father: m.father_id ? all.find((x) => x.id === m.father_id) ?? null : null,
    mother: m.mother_id ? all.find((x) => x.id === m.mother_id) ?? null : null
  };
}

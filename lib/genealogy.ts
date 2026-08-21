import type { Member } from "@/types";

/** Các hàm thuần về quan hệ gia phả, dùng chung cho store và giao diện. */

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

export function parentsOf(all: Member[], m: Member) {
  return {
    father: m.father_id ? all.find((x) => x.id === m.father_id) ?? null : null,
    mother: m.mother_id ? all.find((x) => x.id === m.mother_id) ?? null : null
  };
}

/** Kiểm tra chọn parentId có tạo vòng lặp không (A là cha B rồi B là cha A...). */
export function wouldCreateCycle(
  all: Member[],
  selfId: string,
  parentId: string | null | undefined
): boolean {
  if (!parentId) return false;
  if (parentId === selfId) return true;
  const byId = new Map(all.map((m) => [m.id, m]));
  const seen = new Set<string>();
  const stack = [parentId];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === selfId) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    const p = byId.get(cur);
    if (p?.father_id) stack.push(p.father_id);
    if (p?.mother_id) stack.push(p.mother_id);
  }
  return false;
}

/** Đồng bộ quan hệ vợ/chồng hai chiều, trả về mảng mới. */
export function syncSpouse(members: Member[], id: string, spouseId: string | null): Member[] {
  return members.map((m) => {
    if (m.id === id) return { ...m, spouse_id: spouseId };
    // người này trước đây là bạn đời của id nhưng nay bị đổi → gỡ
    if (m.spouse_id === id && m.id !== spouseId) return { ...m, spouse_id: null };
    // người được chọn làm bạn đời → trỏ ngược lại id
    if (spouseId && m.id === spouseId) return { ...m, spouse_id: id };
    return m;
  });
}

export function computeStats(members: Member[]) {
  const generations = members.reduce((mx, m) => Math.max(mx, m.generation), 0);
  return {
    total: members.length,
    male: members.filter((m) => m.gender === "male").length,
    female: members.filter((m) => m.gender === "female").length,
    alive: members.filter((m) => m.is_alive).length,
    deceased: members.filter((m) => !m.is_alive).length,
    generations
  };
}

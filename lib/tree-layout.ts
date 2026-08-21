import type { Member } from "@/types";

export const NODE_W = 180;
export const NODE_H = 92;
const H_GAP = 44;
const V_GAP = 96;
const COUPLE_GAP = 34;

export interface TreeLayout {
  pos: Record<string, { x: number; y: number }>;
  visible: Set<string>;
  couples: [string, string][];
  hasChildren: Set<string>;
}

/**
 * Bố cục cây gia phả theo cặp vợ chồng, mỗi đời một hàng.
 * `collapsed` chứa id các nút đang thu gọn (ẩn con cháu).
 */
export function layoutTree(members: Member[], collapsed: Set<string>): TreeLayout {
  const byId = new Map(members.map((m) => [m.id, m]));
  const pos: Record<string, { x: number; y: number }> = {};
  const visible = new Set<string>();
  const couples: [string, string][] = [];
  const rendered = new Set<string>();
  let cursorX = 0;

  const hasChildren = new Set<string>();
  for (const m of members) {
    if (m.father_id) hasChildren.add(m.father_id);
    if (m.mother_id) hasChildren.add(m.mother_id);
  }

  function bloodChildren(id: string): Member[] {
    return members
      .filter((m) => m.father_id === id || m.mother_id === id)
      .sort(
        (a, b) =>
          (a.birth_date ? +new Date(a.birth_date) : 0) -
          (b.birth_date ? +new Date(b.birth_date) : 0)
      );
  }

  function place(id: string, depth: number): number {
    if (rendered.has(id)) return pos[id] ? pos[id].x + NODE_W / 2 : cursorX;
    rendered.add(id);
    visible.add(id);

    const person = byId.get(id)!;
    const spouse = person.spouse_id ? byId.get(person.spouse_id) : undefined;
    if (spouse) {
      rendered.add(spouse.id);
      visible.add(spouse.id);
    }

    const y = depth * (NODE_H + V_GAP);
    const coupleW = spouse ? NODE_W * 2 + COUPLE_GAP : NODE_W;
    const kids = collapsed.has(id) ? [] : bloodChildren(id);

    let leftX: number;
    if (kids.length === 0) {
      leftX = cursorX;
      cursorX += coupleW + H_GAP;
    } else {
      const centers = kids.map((k) => place(k.id, depth + 1));
      const childrenCenter = (centers[0] + centers[centers.length - 1]) / 2;
      leftX = childrenCenter - coupleW / 2;
    }

    pos[person.id] = { x: leftX, y };
    if (spouse) {
      pos[spouse.id] = { x: leftX + NODE_W + COUPLE_GAP, y };
      couples.push([person.id, spouse.id]);
    }
    return leftX + coupleW / 2;
  }

  const roots = members
    .filter((m) => !m.father_id && !m.mother_id)
    .filter((m) => {
      if (!m.spouse_id) return true;
      const s = byId.get(m.spouse_id);
      return !(s && (s.father_id || s.mother_id)); // loại vợ/chồng "lấy vào"
    });

  for (const r of roots) {
    if (rendered.has(r.id)) continue;
    place(r.id, 0);
    cursorX += H_GAP * 2;
  }
  // an toàn: các nút chưa được đặt (dữ liệu rời rạc)
  for (const m of members) {
    if (!rendered.has(m.id)) {
      place(m.id, 0);
      cursorX += H_GAP;
    }
  }

  // chuẩn hóa toạ độ về gốc 0
  const xs = Object.values(pos).map((p) => p.x);
  const minX = xs.length ? Math.min(...xs) : 0;
  for (const k of Object.keys(pos)) pos[k].x -= minX;

  return { pos, visible, couples, hasChildren };
}

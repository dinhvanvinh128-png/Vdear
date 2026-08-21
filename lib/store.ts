"use client";

import { useEffect, useState } from "react";
import { create } from "zustand";
import { persist, createJSONStorage, type StateStorage } from "zustand/middleware";
import type { Member, Branch } from "@/types";
import { wouldCreateCycle, syncSpouse } from "@/lib/genealogy";

/** Kho lưu an toàn cho SSR: dùng localStorage ở trình duyệt, no-op trên server. */
const safeStorage: StateStorage = {
  getItem: (name) => (typeof window !== "undefined" ? window.localStorage.getItem(name) : null),
  setItem: (name, value) => {
    if (typeof window !== "undefined") window.localStorage.setItem(name, value);
  },
  removeItem: (name) => {
    if (typeof window !== "undefined") window.localStorage.removeItem(name);
  }
};

export interface MemberDraft {
  full_name: string;
  nickname?: string;
  gender: "male" | "female" | "other";
  birth_date?: string;
  death_date?: string;
  birth_place?: string;
  hometown?: string;
  address?: string;
  occupation?: string;
  biography?: string;
  avatar_url?: string;
  generation: number;
  branch_id?: string | null;
  is_alive: boolean;
  father_id?: string | null;
  mother_id?: string | null;
  spouse_id?: string | null;
}

interface StoreState {
  members: Member[];
  branches: Branch[];

  addMember: (d: MemberDraft) => { ok: boolean; error?: string; id?: string };
  updateMember: (id: string, d: MemberDraft) => { ok: boolean; error?: string };
  deleteMember: (id: string) => void;

  addBranch: (b: { name: string; description?: string; ancestor_id?: string | null }) => void;
  deleteBranch: (id: string) => void;

  replaceAll: (data: { members: Member[]; branches: Branch[] }) => void;
  clearAll: () => void;
}

function uid() {
  return "m" + Math.random().toString(36).slice(2, 9);
}
function bid() {
  return "b" + Math.random().toString(36).slice(2, 9);
}

function avatar(name: string) {
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name || "member")}`;
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      members: [],
      branches: [],

      addMember: (d) => {
        const id = uid();
        const member: Member = {
          ...d,
          id,
          is_alive: d.death_date ? false : d.is_alive,
          avatar_url: d.avatar_url || avatar(d.full_name),
          branch_id: d.branch_id ?? null,
          father_id: d.father_id ?? null,
          mother_id: d.mother_id ?? null,
          spouse_id: d.spouse_id ?? null,
          visibility: "public"
        };
        let next = [...get().members, member];
        if (
          wouldCreateCycle(next, id, member.father_id) ||
          wouldCreateCycle(next, id, member.mother_id)
        ) {
          return { ok: false, error: "Quan hệ cha/mẹ tạo vòng lặp trong gia phả." };
        }
        next = syncSpouse(next, id, member.spouse_id ?? null);
        set({ members: next });
        return { ok: true, id };
      },

      updateMember: (id, d) => {
        if (d.father_id === id || d.mother_id === id)
          return { ok: false, error: "Không thể chọn chính mình làm cha/mẹ." };
        if (d.spouse_id === id)
          return { ok: false, error: "Không thể chọn chính mình làm vợ/chồng." };

        let next = get().members.map((m) =>
          m.id === id
            ? {
                ...m,
                ...d,
                id,
                is_alive: d.death_date ? false : d.is_alive,
                avatar_url: d.avatar_url || m.avatar_url || avatar(d.full_name),
                branch_id: d.branch_id ?? null,
                father_id: d.father_id ?? null,
                mother_id: d.mother_id ?? null,
                spouse_id: d.spouse_id ?? null
              }
            : m
        );
        if (
          wouldCreateCycle(next, id, d.father_id) ||
          wouldCreateCycle(next, id, d.mother_id)
        ) {
          return { ok: false, error: "Quan hệ cha/mẹ tạo vòng lặp trong gia phả." };
        }
        next = syncSpouse(next, id, d.spouse_id ?? null);
        set({ members: next });
        return { ok: true };
      },

      deleteMember: (id) => {
        const next = get()
          .members.filter((m) => m.id !== id)
          .map((m) => ({
            ...m,
            father_id: m.father_id === id ? null : m.father_id,
            mother_id: m.mother_id === id ? null : m.mother_id,
            spouse_id: m.spouse_id === id ? null : m.spouse_id
          }));
        set({ members: next });
      },

      addBranch: (b) =>
        set((s) => ({
          branches: [
            ...s.branches,
            { id: bid(), name: b.name, description: b.description ?? null, ancestor_id: b.ancestor_id ?? null }
          ]
        })),

      deleteBranch: (id) =>
        set((s) => ({
          branches: s.branches.filter((b) => b.id !== id),
          members: s.members.map((m) => (m.branch_id === id ? { ...m, branch_id: null } : m))
        })),

      replaceAll: (data) =>
        set({ members: data.members ?? [], branches: data.branches ?? [] }),

      clearAll: () => set({ members: [], branches: [] })
    }),
    {
      name: "giapha-le",
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({ members: s.members, branches: s.branches })
    }
  )
);

/**
 * Hook nhỏ: chỉ trả true SAU khi component đã mount ở trình duyệt.
 * Giúp lần render đầu (server + client) khớp nhau, tránh lỗi hydration,
 * đồng thời khi true thì dữ liệu localStorage đã sẵn sàng.
 */
export function useHydrated() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

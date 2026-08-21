"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { Member, Branch } from "@/types";
import { MemberCard } from "@/components/member-card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function MembersExplorer({
  members,
  branches
}: {
  members: Member[];
  branches: Branch[];
}) {
  const [q, setQ] = useState("");
  const [branch, setBranch] = useState<string>("all");
  const [gen, setGen] = useState<string>("all");

  const generations = useMemo(
    () => Array.from(new Set(members.map((m) => m.generation))).sort((a, b) => a - b),
    [members]
  );

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return members.filter((m) => {
      if (branch !== "all" && m.branch_id !== branch) return false;
      if (gen !== "all" && String(m.generation) !== gen) return false;
      if (!query) return true;
      return (
        m.full_name.toLowerCase().includes(query) ||
        (m.nickname || "").toLowerCase().includes(query) ||
        (m.occupation || "").toLowerCase().includes(query) ||
        (m.hometown || "").toLowerCase().includes(query)
      );
    });
  }, [members, q, branch, gen]);

  return (
    <div>
      <div className="mb-6 space-y-4 rounded-xl border border-clan-brown/15 bg-white p-4 dark:bg-clan-ink">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-clan-brown/50" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm theo tên, tên gọi, nghề nghiệp, quê quán..."
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <FilterChip active={branch === "all"} onClick={() => setBranch("all")}>
            Tất cả chi
          </FilterChip>
          {branches.map((b) => (
            <FilterChip key={b.id} active={branch === b.id} onClick={() => setBranch(b.id)}>
              {b.name}
            </FilterChip>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <FilterChip active={gen === "all"} onClick={() => setGen("all")}>
            Mọi đời
          </FilterChip>
          {generations.map((g) => (
            <FilterChip key={g} active={gen === String(g)} onClick={() => setGen(String(g))}>
              Đời {g}
            </FilterChip>
          ))}
        </div>
      </div>

      <div className="mb-4 text-sm text-clan-brown/70 dark:text-clan-cream/60">
        {filtered.length} thành viên
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-clan-brown/30 p-12 text-center text-clan-brown/60">
          Không tìm thấy thành viên phù hợp.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((m) => (
            <MemberCard key={m.id} member={m} />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button onClick={onClick}>
      <Badge
        variant={active ? "default" : "outline"}
        className={cn("cursor-pointer transition-colors", !active && "hover:bg-clan-cream")}
      >
        {children}
      </Badge>
    </button>
  );
}

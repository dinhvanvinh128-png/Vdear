"use client";

import { memo } from "react";
import { Handle, Position } from "reactflow";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { Member } from "@/types";
import { lifeSpan } from "@/lib/utils";

export interface MemberNodeData {
  member: Member;
  hasChildren: boolean;
  collapsed: boolean;
  highlighted: boolean;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
}

function MemberNodeBase({ data }: { data: MemberNodeData }) {
  const { member, hasChildren, collapsed, highlighted } = data;
  const accent =
    member.gender === "male" ? "#5b8def" : member.gender === "female" ? "#e07aa8" : "#c6a15b";
  const ring = highlighted ? "ring-4 ring-clan-gold" : "";

  return (
    <div
      className={`relative w-[180px] overflow-hidden rounded-lg border border-clan-gold/45 bg-white shadow-tablet ${ring} dark:bg-[#241b16]`}
    >
      {/* chỉ vàng trên đỉnh — kiểu bài vị */}
      <span className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-transparent via-clan-gold to-transparent" />
      {/* vạch màu giới tính bên trái */}
      <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: accent }} />

      <Handle type="target" position={Position.Top} id="t" className="!bg-clan-brown/50" />
      <Handle type="source" position={Position.Bottom} id="b" className="!bg-clan-brown/50" />
      <Handle type="target" position={Position.Left} id="l" className="!bg-clan-gold" />
      <Handle type="source" position={Position.Right} id="r" className="!bg-clan-gold" />

      <button className="flex w-full items-center gap-2.5 py-2.5 pl-3.5 pr-2 text-left" onClick={() => data.onOpen(member.id)}>
        <img
          src={member.avatar_url || ""}
          alt=""
          className="h-11 w-11 shrink-0 rounded-full bg-clan-cream object-cover ring-1 ring-clan-gold/40"
        />
        <div className="min-w-0">
          <div className="flex items-center gap-1">
            <span className="truncate font-serif text-[15px] font-semibold text-clan-ink dark:text-clan-cream">
              {member.full_name}
            </span>
            {!member.is_alive && <span className="text-xs">🕯️</span>}
          </div>
          <div className="text-[11px] text-clan-brown/65 dark:text-clan-cream/55">
            {lifeSpan(member) || "—"}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-clan-gold">
            Đời {member.generation}
          </div>
        </div>
      </button>

      {hasChildren && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            data.onToggle(member.id);
          }}
          title={collapsed ? "Mở rộng nhánh" : "Thu gọn nhánh"}
          className="absolute -bottom-3 left-1/2 z-10 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full border border-clan-gold/50 bg-white text-clan-brown shadow dark:bg-[#241b16] dark:text-clan-cream"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      )}
    </div>
  );
}

export const MemberNode = memo(MemberNodeBase);

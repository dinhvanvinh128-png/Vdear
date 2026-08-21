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
  const male = member.gender === "male";
  const border = male ? "border-blue-400" : member.gender === "female" ? "border-pink-400" : "border-clan-brown/40";
  const ring = highlighted ? "ring-4 ring-clan-gold" : "";

  return (
    <div className={`relative w-[180px] rounded-xl border-2 ${border} ${ring} bg-white shadow-md dark:bg-clan-ink`}>
      <Handle type="target" position={Position.Top} id="t" className="!bg-clan-brown/50" />
      <Handle type="source" position={Position.Bottom} id="b" className="!bg-clan-brown/50" />
      <Handle type="target" position={Position.Left} id="l" className="!bg-clan-gold" />
      <Handle type="source" position={Position.Right} id="r" className="!bg-clan-gold" />

      <button
        className="flex w-full items-center gap-2 p-2.5 text-left"
        onClick={() => data.onOpen(member.id)}
      >
        <img
          src={member.avatar_url || ""}
          alt=""
          className="h-11 w-11 shrink-0 rounded-full border border-clan-gold/40 bg-clan-cream object-cover"
        />
        <div className="min-w-0">
          <div className="flex items-center gap-1">
            <span className="truncate text-sm font-semibold text-clan-ink dark:text-clan-cream">
              {member.full_name}
            </span>
            {!member.is_alive && <span className="text-xs">🕯️</span>}
          </div>
          <div className="text-[11px] text-clan-brown/70 dark:text-clan-cream/60">
            {lifeSpan(member) || "—"}
          </div>
          <div className="text-[10px] font-medium text-clan-red dark:text-clan-gold">
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
          className="absolute -bottom-3 left-1/2 z-10 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full border border-clan-brown/30 bg-white text-clan-brown shadow dark:bg-clan-ink dark:text-clan-cream"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      )}
    </div>
  );
}

export const MemberNode = memo(MemberNodeBase);

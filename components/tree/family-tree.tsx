"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useReactFlow,
  type Node,
  type Edge
} from "reactflow";
import "reactflow/dist/style.css";
import { Search, Maximize2, RotateCcw } from "lucide-react";
import type { Member } from "@/types";
import { layoutTree, NODE_W, NODE_H } from "@/lib/tree-layout";
import { MemberNode, type MemberNodeData } from "./member-node";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const nodeTypes = { member: MemberNode };

function TreeInner({ members }: { members: Member[] }) {
  const router = useRouter();
  const rf = useReactFlow();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const toggle = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const openMember = useCallback(
    (id: string) => router.push(`/member/${id}`),
    [router]
  );

  const { nodes, edges } = useMemo(() => {
    const { pos, visible, couples, hasChildren } = layoutTree(members, collapsed);
    const nodeList: Node<MemberNodeData>[] = [];
    for (const m of members) {
      if (!visible.has(m.id) || !pos[m.id]) continue;
      nodeList.push({
        id: m.id,
        type: "member",
        position: pos[m.id],
        data: {
          member: m,
          hasChildren: hasChildren.has(m.id),
          collapsed: collapsed.has(m.id),
          highlighted: highlightId === m.id,
          onToggle: toggle,
          onOpen: openMember
        }
      });
    }

    const edgeList: Edge[] = [];
    // cạnh vợ chồng
    for (const [a, b] of couples) {
      if (!visible.has(a) || !visible.has(b)) continue;
      const [left, right] = pos[a].x <= pos[b].x ? [a, b] : [b, a];
      edgeList.push({
        id: `s-${a}-${b}`,
        source: left,
        target: right,
        sourceHandle: "r",
        targetHandle: "l",
        type: "straight",
        style: { stroke: "#c9a227", strokeWidth: 2.5 }
      });
    }
    // cạnh cha/mẹ - con
    for (const m of members) {
      if (!visible.has(m.id)) continue;
      const parent =
        m.father_id && visible.has(m.father_id)
          ? m.father_id
          : m.mother_id && visible.has(m.mother_id)
          ? m.mother_id
          : null;
      if (!parent) continue;
      edgeList.push({
        id: `p-${parent}-${m.id}`,
        source: parent,
        target: m.id,
        sourceHandle: "b",
        targetHandle: "t",
        type: "smoothstep",
        style: { stroke: "#8a1f1f", strokeWidth: 1.8 }
      });
    }
    return { nodes: nodeList, edges: edgeList };
  }, [members, collapsed, highlightId, toggle, openMember]);

  const search = useCallback(() => {
    const q = query.trim().toLowerCase();
    if (!q) return;
    const found = members.find(
      (m) =>
        m.full_name.toLowerCase().includes(q) ||
        (m.nickname || "").toLowerCase().includes(q)
    );
    if (found) {
      setHighlightId(found.id);
      const p = layoutTree(members, collapsed).pos[found.id];
      if (p) rf.setCenter(p.x + NODE_W / 2, p.y + NODE_H / 2, { zoom: 1.1, duration: 600 });
    }
  }, [query, members, collapsed, rf]);

  return (
    <div className="relative h-[calc(100vh-4rem)] w-full">
      {/* Thanh công cụ nổi */}
      <div className="absolute left-3 top-3 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-clan-brown/15 bg-white/95 p-2 shadow dark:bg-clan-ink/95">
        <div className="flex items-center gap-1">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="Tìm người trong cây..."
            className="h-9 w-44"
          />
          <Button size="icon" variant="gold" className="h-9 w-9" onClick={search} aria-label="Tìm">
            <Search className="h-4 w-4" />
          </Button>
        </div>
        <Button size="sm" variant="outline" onClick={() => rf.fitView({ duration: 500, padding: 0.2 })}>
          <Maximize2 className="h-4 w-4" /> Toàn cây
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setCollapsed(new Set());
            setHighlightId(null);
            setTimeout(() => rf.fitView({ duration: 500, padding: 0.2 }), 50);
          }}
        >
          <RotateCcw className="h-4 w-4" /> Đặt lại
        </Button>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.15}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
      >
        <Background color="#c9a227" gap={24} size={1} />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          nodeColor={(n) =>
            (n.data as MemberNodeData)?.member?.gender === "female" ? "#f9a8d4" : "#93c5fd"
          }
          className="!bg-clan-cream"
        />
      </ReactFlow>
    </div>
  );
}

export function FamilyTree({ members }: { members: Member[] }) {
  return (
    <ReactFlowProvider>
      <TreeInner members={members} />
    </ReactFlowProvider>
  );
}

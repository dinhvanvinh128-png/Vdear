"use client";

import { useEffect, useRef } from "react";
import { getSupabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-store";
import { useStore } from "@/lib/store";
import { clerkEnabled } from "@/lib/config";

/**
 * Đồng bộ đám mây (local-first):
 * - Ai cũng KÉO dữ liệu dùng chung từ Supabase (bảng clan_data 'main').
 * - Khi đã đăng nhập (Clerk), mọi thay đổi được ĐẨY lên đám mây.
 * Nếu chưa cấu hình Supabase → chỉ chạy cục bộ.
 */
export function CloudSync() {
  const applying = useRef<string>("");
  const userId = useAuth((s) => s.userId);
  const ready = useAuth((s) => s.ready);

  // Nếu Clerk không bật thì không có ClerkBridge để set ready → tự set tại đây
  useEffect(() => {
    if (!clerkEnabled) useAuth.getState().setReady(true);
  }, []);

  // Kéo dữ liệu dùng chung (khi sẵn sàng và mỗi lần đăng nhập/đăng xuất)
  useEffect(() => {
    const sb = getSupabase();
    if (!sb || !ready) return;
    let cancel = false;
    (async () => {
      const { data } = await sb.from("clan_data").select("data").eq("id", "main").maybeSingle();
      if (cancel) return;
      const cloud = (data?.data ?? null) as { members?: any[]; branches?: any[] } | null;
      const local = {
        members: useStore.getState().members,
        branches: useStore.getState().branches
      };
      if (cloud && Array.isArray(cloud.members) && cloud.members.length > 0) {
        const payload = { members: cloud.members, branches: cloud.branches ?? [] };
        applying.current = JSON.stringify(payload);
        useStore.getState().replaceAll(payload);
      } else if (userId && local.members.length > 0) {
        applying.current = JSON.stringify(local);
        await sb.from("clan_data").upsert({ id: "main", data: local, updated_at: new Date().toISOString() });
      }
    })();
    return () => {
      cancel = true;
    };
  }, [ready, userId]);

  // Đẩy thay đổi lên đám mây (chỉ khi đã đăng nhập)
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    let t: ReturnType<typeof setTimeout>;
    const unsub = useStore.subscribe((state) => {
      if (!useAuth.getState().userId) return;
      const snap = JSON.stringify({ members: state.members, branches: state.branches });
      if (snap === applying.current) return;
      clearTimeout(t);
      t = setTimeout(() => {
        applying.current = snap;
        sb.from("clan_data")
          .upsert({ id: "main", data: JSON.parse(snap), updated_at: new Date().toISOString() })
          .then(() => {}, () => {});
      }, 800);
    });
    return () => {
      clearTimeout(t);
      unsub();
    };
  }, []);

  return null;
}

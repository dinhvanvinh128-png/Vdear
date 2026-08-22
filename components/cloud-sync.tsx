"use client";

import { useEffect, useRef } from "react";
import { getSupabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-store";
import { useStore } from "@/lib/store";

/**
 * Đồng bộ đám mây (local-first):
 * - Theo dõi phiên đăng nhập Supabase → cập nhật useAuth.
 * - Ai cũng KÉO dữ liệu dùng chung từ đám mây (bảng clan_data 'main').
 * - Khi đã đăng nhập, mọi thay đổi được ĐẨY lên đám mây (chống dội bằng snapshot).
 * Nếu chưa cấu hình Supabase → không làm gì, app chạy cục bộ như thường.
 */
export function CloudSync() {
  const applying = useRef<string>("");
  const userId = useAuth((s) => s.userId);
  const ready = useAuth((s) => s.ready);

  // 1) Khởi tạo phiên + lắng nghe đăng nhập/đăng xuất
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) {
      useAuth.getState().setReady(true);
      return;
    }
    let mounted = true;
    sb.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      const u = data.session?.user;
      useAuth.getState().setAuth(u ? { id: u.id, email: u.email ?? null } : null);
      useAuth.getState().setReady(true);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => {
      const u = session?.user;
      useAuth.getState().setAuth(u ? { id: u.id, email: u.email ?? null } : null);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // 2) Kéo dữ liệu dùng chung (khi sẵn sàng, và mỗi lần đăng nhập/đăng xuất)
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
        // Đám mây trống mà máy đang có dữ liệu → nạp lên làm dữ liệu chung
        applying.current = JSON.stringify(local);
        await sb.from("clan_data").upsert({ id: "main", data: local, updated_at: new Date().toISOString() });
      }
    })();
    return () => {
      cancel = true;
    };
  }, [ready, userId]);

  // 3) Đẩy thay đổi lên đám mây (chỉ khi đã đăng nhập)
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    let t: ReturnType<typeof setTimeout>;
    const unsub = useStore.subscribe((state) => {
      if (!useAuth.getState().userId) return;
      const snap = JSON.stringify({ members: state.members, branches: state.branches });
      if (snap === applying.current) return;
      clearTimeout(t);
      t = setTimeout(async () => {
        applying.current = snap;
        await sb
          .from("clan_data")
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

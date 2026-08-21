import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/types";

export interface SessionInfo {
  configured: boolean;
  userId: string | null;
  email: string | null;
  role: UserRole | null;
}

/** Lấy thông tin phiên đăng nhập + vai trò ở phía server. */
export async function getSessionUser(): Promise<SessionInfo> {
  const supabase = createClient();
  if (!supabase) return { configured: false, userId: null, email: null, role: null };

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return { configured: true, userId: null, email: null, role: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  return {
    configured: true,
    userId: user.id,
    email: user.email ?? null,
    role: (profile?.role as UserRole) ?? "member"
  };
}

export function isAdmin(s: SessionInfo): boolean {
  return s.role === "admin";
}

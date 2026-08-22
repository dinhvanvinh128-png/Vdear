"use client";

import { useEffect } from "react";
import { useUser } from "@clerk/clerk-react";
import { useAuth } from "@/lib/auth-store";

/**
 * Cầu nối Clerk → store nội bộ. Chỉ render khi Clerk đã bật (bên trong ClerkProvider).
 * Đưa trạng thái đăng nhập vào useAuth để navbar / cloud-sync dùng mà không cần
 * gọi hook Clerk trực tiếp (tránh lỗi khi Clerk chưa bật).
 */
export function ClerkBridge() {
  const { isLoaded, isSignedIn, user } = useUser();
  useEffect(() => {
    if (!isLoaded) return;
    useAuth.getState().setAuth(
      isSignedIn && user
        ? { id: user.id, email: user.primaryEmailAddress?.emailAddress ?? null }
        : null
    );
    useAuth.getState().setReady(true);
  }, [isLoaded, isSignedIn, user?.id]);
  return null;
}

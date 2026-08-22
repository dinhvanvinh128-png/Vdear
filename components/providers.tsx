"use client";

import { ClerkProvider } from "@clerk/clerk-react";
import { CLERK_PUBLISHABLE_KEY } from "@/lib/config";

/** Bọc app bằng Clerk khi đã cấu hình; nếu chưa thì trả nguyên children (chế độ cục bộ). */
export function Providers({ children }: { children: React.ReactNode }) {
  if (!CLERK_PUBLISHABLE_KEY) return <>{children}</>;
  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} afterSignOutUrl="/">
      {children}
    </ClerkProvider>
  );
}

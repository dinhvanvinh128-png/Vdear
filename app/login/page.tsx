"use client";

import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { clerkEnabled } from "@/lib/config";
import { SignInButton, SignedIn, SignedOut } from "@clerk/clerk-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function LoginPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-16">
      <span className="seal mb-5 flex h-14 w-14 text-xl font-semibold">Lê</span>
      <h1 className="font-serif text-2xl font-semibold">Đăng nhập</h1>
      <p className="mb-6 mt-1 text-center text-sm text-clan-brown/70 dark:text-clan-cream/60">
        Đăng nhập để chỉnh sửa gia phả dùng chung.
      </p>

      <Card className="w-full">
        <CardContent className="flex flex-col items-center gap-4 py-8">
          {!clerkEnabled ? (
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Chưa bật đăng nhập. Web đang chạy chế độ cục bộ (lưu trong máy). Xem
                README để bật Clerk.
              </span>
            </div>
          ) : (
            <>
              <SignedOut>
                <SignInButton mode="modal">
                  <Button size="lg">Đăng nhập / Đăng ký</Button>
                </SignInButton>
                <p className="text-center text-xs text-clan-brown/60">
                  Hỗ trợ email, Google và nhiều cách khác qua Clerk.
                </p>
              </SignedOut>
              <SignedIn>
                <p className="text-sm text-clan-brown/70 dark:text-clan-cream/60">Bạn đã đăng nhập.</p>
                <Link href="/quan-ly"><Button>Vào trang Quản lý</Button></Link>
              </SignedIn>
            </>
          )}
        </CardContent>
      </Card>

      <Link href="/" className="mt-6 text-sm text-clan-brown/60 hover:underline">← Về trang chủ</Link>
    </div>
  );
}

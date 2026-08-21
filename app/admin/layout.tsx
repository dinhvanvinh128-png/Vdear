import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { getSessionUser, isAdmin } from "@/lib/auth";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionUser();

  if (!session.configured || !isAdmin(session)) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-20">
        <Card className="w-full">
          <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30">
              <ShieldAlert className="h-7 w-7" />
            </div>
            <h1 className="font-serif text-xl font-bold">Cần quyền quản trị</h1>
            <p className="text-sm text-clan-brown/70 dark:text-clan-cream/60">
              {!session.configured
                ? "Chưa cấu hình Supabase. Hãy thêm biến môi trường và chạy migration (xem README) để bật trang quản trị."
                : session.userId
                ? "Tài khoản của bạn chưa có quyền quản trị. Liên hệ admin hoặc đặt vai trò 'admin' trong bảng profiles."
                : "Vui lòng đăng nhập bằng tài khoản quản trị."}
            </p>
            <Link href="/login">
              <Button>Đăng nhập</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row">
      <AdminSidebar email={session.email} />
      <div className="flex-1 p-4 sm:p-6 lg:p-8">{children}</div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  GitBranch,
  TreePine,
  CalendarDays,
  Flame,
  LogOut,
  ArrowLeft
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

const items = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/members", label: "Thành viên", icon: Users },
  { href: "/admin/branches", label: "Chi họ", icon: GitBranch }
];

const links = [
  { href: "/tree", label: "Cây gia phả", icon: TreePine },
  { href: "/events", label: "Sự kiện", icon: CalendarDays },
  { href: "/memorial", label: "Lịch giỗ", icon: Flame }
];

export function AdminSidebar({ email }: { email: string | null }) {
  const pathname = usePathname();

  async function signOut() {
    const supabase = createClient();
    await supabase?.auth.signOut();
    window.location.href = "/";
  }

  return (
    <aside className="flex w-full shrink-0 flex-col border-b border-clan-brown/15 bg-white p-4 dark:bg-clan-ink lg:h-[calc(100vh-4rem)] lg:w-64 lg:border-b-0 lg:border-r">
      <div className="mb-4">
        <div className="font-serif text-lg font-bold text-clan-red dark:text-clan-gold">Quản trị</div>
        {email && <div className="truncate text-xs text-clan-brown/60">{email}</div>}
      </div>

      <nav className="flex flex-wrap gap-1 lg:flex-col">
        {items.map((it) => {
          const active = pathname === it.href || (it.href !== "/admin" && pathname.startsWith(it.href));
          return (
            <Link
              key={it.href}
              href={it.href}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium",
                active
                  ? "bg-clan-red text-white"
                  : "text-clan-ink hover:bg-clan-cream dark:text-clan-cream dark:hover:bg-white/10"
              )}
            >
              <it.icon className="h-4 w-4" /> {it.label}
            </Link>
          );
        })}
      </nav>

      <div className="my-3 hidden h-px bg-clan-brown/10 lg:block" />
      <nav className="hidden gap-1 lg:flex lg:flex-col">
        <div className="px-3 text-xs uppercase tracking-wide text-clan-brown/50">Xem trang</div>
        {links.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-clan-brown/80 hover:bg-clan-cream dark:text-clan-cream/70 dark:hover:bg-white/10"
          >
            <it.icon className="h-4 w-4" /> {it.label}
          </Link>
        ))}
      </nav>

      <div className="mt-auto hidden pt-4 lg:block">
        <Link href="/" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-clan-brown/70 hover:bg-clan-cream dark:text-clan-cream/60 dark:hover:bg-white/10">
          <ArrowLeft className="h-4 w-4" /> Về trang chủ
        </Link>
        <button
          onClick={signOut}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
        >
          <LogOut className="h-4 w-4" /> Đăng xuất
        </button>
      </div>
    </aside>
  );
}

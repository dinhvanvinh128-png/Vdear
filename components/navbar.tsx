"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X, TreePine, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { InstallButton } from "@/components/install-button";
import { useAuth } from "@/lib/auth-store";
import { supabaseConfigured, getSupabase } from "@/lib/supabase/client";

const nav = [
  { href: "/", label: "Trang chủ" },
  { href: "/tree", label: "Cây gia phả" },
  { href: "/members", label: "Thành viên" },
  { href: "/branches", label: "Chi họ" },
  { href: "/history", label: "Lịch sử" },
  { href: "/events", label: "Sự kiện" },
  { href: "/memorial", label: "Lịch giỗ" },
  { href: "/library", label: "Thư viện" }
];

export function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const userId = useAuth((s) => s.userId);
  const configured = supabaseConfigured();

  function toggleDark() {
    document.documentElement.classList.toggle("dark");
  }

  async function signOut() {
    await getSupabase()?.auth.signOut();
    window.location.href = "/";
  }

  return (
    <header className="sticky top-0 z-40 border-b border-clan-gold/30 bg-clan-cream/95 backdrop-blur dark:bg-clan-ink/95">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="seal flex h-9 w-9 text-base font-semibold">Lê</span>
          <div className="leading-tight">
            <div className="font-serif text-lg font-semibold text-clan-red dark:text-clan-gold">Gia Phả Họ Lê</div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-clan-brown/60 dark:text-clan-cream/50">
              Uống nước nhớ nguồn
            </div>
          </div>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-lg px-3 py-2 text-sm font-medium text-clan-ink/80 transition-colors hover:bg-white hover:text-clan-red dark:text-clan-cream/80 dark:hover:bg-white/10",
                pathname === item.href && "bg-white text-clan-red dark:bg-white/10 dark:text-clan-gold"
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <button
            onClick={toggleDark}
            aria-label="Chế độ tối"
            className="rounded-lg p-2 text-clan-ink hover:bg-white dark:text-clan-cream dark:hover:bg-white/10"
          >
            <Sun className="hidden h-5 w-5 dark:block" />
            <Moon className="h-5 w-5 dark:hidden" />
          </button>
          <InstallButton className="hidden sm:inline-flex" />
          {configured &&
            (userId ? (
              <Button size="sm" variant="outline" className="hidden sm:inline-flex" onClick={signOut}>
                Đăng xuất
              </Button>
            ) : (
              <Link href="/login" className="hidden sm:block">
                <Button size="sm" variant="outline">Đăng nhập</Button>
              </Link>
            ))}
          <Link href="/quan-ly" className="hidden sm:block">
            <Button size="sm">Quản lý</Button>
          </Link>
          <button
            className="rounded-lg p-2 text-clan-ink hover:bg-white dark:text-clan-cream lg:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label="Menu"
          >
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {open && (
        <nav className="border-t border-clan-brown/15 bg-clan-cream px-4 py-3 dark:bg-clan-ink lg:hidden">
          <div className="grid gap-1">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "rounded-lg px-3 py-3 text-base font-medium text-clan-ink dark:text-clan-cream",
                  pathname === item.href
                    ? "bg-white text-clan-red dark:bg-white/10 dark:text-clan-gold"
                    : "hover:bg-white dark:hover:bg-white/10"
                )}
              >
                {item.label}
              </Link>
            ))}
            <Link href="/quan-ly" onClick={() => setOpen(false)} className="mt-2">
              <Button className="w-full">Quản lý</Button>
            </Link>
            {configured &&
              (userId ? (
                <Button variant="outline" className="mt-2 w-full" onClick={signOut}>Đăng xuất</Button>
              ) : (
                <Link href="/login" onClick={() => setOpen(false)} className="mt-2">
                  <Button variant="outline" className="w-full">Đăng nhập</Button>
                </Link>
              ))}
            <InstallButton className="mt-2 w-full" />
          </div>
        </nav>
      )}
    </header>
  );
}

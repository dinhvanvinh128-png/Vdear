import Link from "next/link";
import { TreePine } from "lucide-react";

export function Footer() {
  return (
    <footer className="mt-16 border-t border-clan-brown/15 bg-clan-brown/5 dark:border-white/10 dark:bg-black/20">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="flex items-center gap-2 text-clan-red dark:text-clan-gold">
            <TreePine className="h-6 w-6" />
            <span className="font-serif text-lg font-bold">Gia Phả</span>
          </div>
          <p className="mt-3 text-sm text-clan-brown/70 dark:text-clan-cream/60">
            Lưu giữ cội nguồn — Kết nối các thế hệ dòng họ Lê.
          </p>
        </div>
        <div>
          <h4 className="mb-3 font-semibold">Khám phá</h4>
          <ul className="space-y-2 text-sm text-clan-brown/70 dark:text-clan-cream/60">
            <li><Link href="/tree" className="hover:text-clan-red">Cây gia phả</Link></li>
            <li><Link href="/members" className="hover:text-clan-red">Thành viên</Link></li>
            <li><Link href="/branches" className="hover:text-clan-red">Chi họ</Link></li>
            <li><Link href="/history" className="hover:text-clan-red">Lịch sử dòng họ</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="mb-3 font-semibold">Hoạt động</h4>
          <ul className="space-y-2 text-sm text-clan-brown/70 dark:text-clan-cream/60">
            <li><Link href="/events" className="hover:text-clan-red">Sự kiện</Link></li>
            <li><Link href="/memorial" className="hover:text-clan-red">Lịch giỗ</Link></li>
            <li><Link href="/library" className="hover:text-clan-red">Thư viện ảnh</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="mb-3 font-semibold">Công cụ</h4>
          <ul className="space-y-2 text-sm text-clan-brown/70 dark:text-clan-cream/60">
            <li><Link href="/quan-ly" className="hover:text-clan-red">Quản lý gia phả</Link></li>
            <li><Link href="/tree" className="hover:text-clan-red">Cây gia phả</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-clan-brown/15 py-4 text-center text-xs text-clan-brown/60 dark:border-white/10 dark:text-clan-cream/50">
        © {new Date().getFullYear()} Gia Phả Dòng Họ Lê · Uống nước nhớ nguồn
      </div>
    </footer>
  );
}

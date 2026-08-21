import Link from "next/link";
import {
  Users,
  Layers,
  GitBranch,
  Flame,
  Heart,
  CalendarDays,
  ArrowRight,
  TreePine
} from "lucide-react";
import { getStats, getEvents, getMembers } from "@/lib/data";
import { StatCard } from "@/components/stat-card";
import { MemberCard } from "@/components/member-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function HomePage() {
  const [stats, events, members] = await Promise.all([
    getStats(),
    getEvents(),
    getMembers()
  ]);

  const upcoming = events
    .filter((e) => new Date(e.event_date) >= new Date("2026-08-21"))
    .slice(0, 3);
  const featured = members.filter((m) => m.generation <= 2).slice(0, 4);

  return (
    <div className="paper-texture">
      {/* HERO */}
      <section className="relative overflow-hidden bg-gradient-to-b from-clan-red to-clan-red-dark text-white">
        <div className="mx-auto max-w-5xl px-4 py-20 text-center sm:py-28">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full border-2 border-clan-gold bg-white/10">
            <TreePine className="h-10 w-10 text-clan-gold" />
          </div>
          <p className="font-serif text-clan-gold-light">Uống nước nhớ nguồn</p>
          <h1 className="mt-2 font-serif text-4xl font-bold sm:text-6xl">
            Gia Phả Dòng Họ<br />Nguyễn Phúc
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-white/85">
            Nơi lưu giữ cội nguồn, kết nối các thế hệ và trực quan hóa toàn bộ
            cây phả hệ của dòng họ qua nhiều đời, nhiều chi.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/tree">
              <Button size="lg" variant="gold">
                Xem cây gia phả <ArrowRight className="h-5 w-5" />
              </Button>
            </Link>
            <Link href="/members">
              <Button size="lg" variant="outline" className="border-white/40 text-white hover:bg-white/10">
                Danh sách thành viên
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* THỐNG KÊ */}
      <section className="mx-auto -mt-10 max-w-7xl px-4">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          <StatCard icon={Users} label="Thành viên" value={stats.total} />
          <StatCard icon={Layers} label="Số đời" value={stats.generations} />
          <StatCard icon={GitBranch} label="Số chi" value={stats.branches} />
          <StatCard icon={Heart} label="Còn sống" value={stats.alive} />
          <StatCard icon={Flame} label="Đã mất" value={stats.deceased} />
          <StatCard icon={Users} label="Nam / Nữ" value={`${stats.male}/${stats.female}`} />
        </div>
      </section>

      {/* GIỚI THIỆU */}
      <section className="mx-auto max-w-7xl px-4 py-16">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <Badge variant="gold">Giới thiệu</Badge>
            <h2 className="section-title mt-3">Cội nguồn dòng họ</h2>
            <p className="mt-4 text-clan-brown/80 dark:text-clan-cream/70">
              Dòng họ Nguyễn Phúc khởi nguồn từ Thủy tổ Nguyễn Phúc Nguyên, người
              khai cơ lập nghiệp và gây dựng nền nếp gia phong. Trải qua nhiều
              đời, con cháu tỏa ra ba chi lớn, mỗi chi một nghiệp nhưng chung một
              cội rễ.
            </p>
            <p className="mt-3 text-clan-brown/80 dark:text-clan-cream/70">
              Website này số hóa toàn bộ gia phả, giúp con cháu dù ở đâu cũng có
              thể tra cứu tổ tiên, quan hệ họ hàng và gìn giữ lịch sử dòng họ.
            </p>
            <div className="mt-6 flex gap-3">
              <Link href="/history">
                <Button variant="default">Đọc lịch sử dòng họ</Button>
              </Link>
              <Link href="/branches">
                <Button variant="outline">Các chi họ</Button>
              </Link>
            </div>
          </div>
          <Card className="overflow-hidden">
            <div className="bg-gradient-to-br from-clan-gold/20 to-clan-red/10 p-8">
              <h3 className="font-serif text-xl font-bold">Ba chi lớn</h3>
              <ul className="mt-4 space-y-3">
                {["Chi Trưởng — giữ việc thờ tự tổ tiên", "Chi Hai — nghiệp nông và giáo", "Chi Ba — nghề buôn bán"].map((t) => (
                  <li key={t} className="flex items-start gap-3">
                    <GitBranch className="mt-0.5 h-5 w-5 shrink-0 text-clan-red dark:text-clan-gold" />
                    <span className="text-clan-brown/80 dark:text-clan-cream/70">{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        </div>
      </section>

      {/* SỰ KIỆN SẮP TỚI */}
      <section className="mx-auto max-w-7xl px-4 pb-4">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="section-title">Sự kiện sắp tới</h2>
          <Link href="/events" className="text-sm font-medium text-clan-red hover:underline dark:text-clan-gold">
            Xem tất cả →
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {upcoming.map((e) => (
            <Card key={e.id}>
              <CardContent className="pt-5">
                <Badge variant="muted">{e.type}</Badge>
                <h3 className="mt-2 font-serif text-lg font-semibold">{e.title}</h3>
                <p className="mt-1 flex items-center gap-2 text-sm text-clan-brown/70 dark:text-clan-cream/60">
                  <CalendarDays className="h-4 w-4" />
                  {new Date(e.event_date).toLocaleDateString("vi-VN")}
                </p>
                <p className="mt-2 line-clamp-2 text-sm text-clan-brown/70 dark:text-clan-cream/60">
                  {e.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* THÀNH VIÊN TIÊU BIỂU */}
      <section className="mx-auto max-w-7xl px-4 py-12">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="section-title">Tổ tiên các đời</h2>
          <Link href="/members" className="text-sm font-medium text-clan-red hover:underline dark:text-clan-gold">
            Tất cả thành viên →
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {featured.map((m) => (
            <MemberCard key={m.id} member={m} />
          ))}
        </div>
      </section>
    </div>
  );
}

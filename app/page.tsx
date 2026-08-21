import Link from "next/link";
import {
  Users,
  Layers,
  GitBranch,
  Flame,
  Heart,
  CalendarDays,
  ArrowRight,
  TreePine,
  UserPlus
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

  const isEmpty = members.length === 0;
  const upcoming = events
    .filter((e) => new Date(e.event_date) >= new Date())
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
            Gia Phả Dòng Họ Lê
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

      {isEmpty ? (
        /* TRẠNG THÁI TRỐNG — chưa có dữ liệu, mời thêm */
        <section className="mx-auto max-w-3xl px-4 py-16">
          <Card>
            <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-clan-red/10 text-clan-red dark:bg-clan-gold/15 dark:text-clan-gold">
                <UserPlus className="h-8 w-8" />
              </div>
              <h2 className="font-serif text-2xl font-bold">Gia phả còn trống</h2>
              <p className="max-w-md text-clan-brown/70 dark:text-clan-cream/60">
                Chưa có thành viên nào. Hãy cấu hình Supabase và đăng nhập bằng tài
                khoản quản trị để bắt đầu thêm tổ tiên và con cháu của dòng họ.
                (Xem hướng dẫn trong README.)
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <Link href="/login">
                  <Button>Đăng nhập quản trị</Button>
                </Link>
                <Link href="/history">
                  <Button variant="outline">Giới thiệu dòng họ</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </section>
      ) : (
        <>
          {/* SỰ KIỆN SẮP TỚI */}
          {upcoming.length > 0 && (
            <section className="mx-auto max-w-7xl px-4 pb-4 pt-14">
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
                      {e.type && <Badge variant="muted">{e.type}</Badge>}
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
          )}

          {/* THÀNH VIÊN ĐỜI ĐẦU */}
          {featured.length > 0 && (
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
          )}
        </>
      )}
    </div>
  );
}

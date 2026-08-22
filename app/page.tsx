"use client";

import Link from "next/link";
import {
  Users,
  Layers,
  GitBranch,
  Flame,
  Heart,
  ArrowRight,
  TreePine,
  UserPlus
} from "lucide-react";
import { useStore, useHydrated } from "@/lib/store";
import { computeStats } from "@/lib/genealogy";
import { StatCard } from "@/components/stat-card";
import { MemberCard } from "@/components/member-card";
import { InstallButton } from "@/components/install-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function HomePage() {
  const hydrated = useHydrated();
  const members = useStore((s) => s.members);
  const branches = useStore((s) => s.branches);

  const stats = hydrated
    ? computeStats(members)
    : { total: 0, male: 0, female: 0, alive: 0, deceased: 0, generations: 0 };
  const branchCount = hydrated ? branches.length : 0;
  const featured = hydrated ? members.filter((m) => m.generation <= 2).slice(0, 4) : [];
  const isEmpty = hydrated && members.length === 0;

  return (
    <div className="paper-texture">
      <section className="lacquer relative overflow-hidden text-clan-cream">
        {/* Câu đối dọc hai bên (chỉ hiện màn hình lớn) */}
        <span className="cau-doi absolute left-6 top-1/2 hidden -translate-y-1/2 font-serif text-sm text-clan-gold/80 xl:block">
          Cây có cội · nước có nguồn
        </span>
        <span className="cau-doi absolute right-6 top-1/2 hidden -translate-y-1/2 font-serif text-sm text-clan-gold/80 xl:block">
          Con một nhà · muôn đời ghi
        </span>

        <div className="mx-auto max-w-3xl px-4 py-20 sm:py-28">
          <div className="frame-gold relative rounded-lg bg-black/10 px-6 py-12 text-center sm:px-12">
            {/* Con triện */}
            <span className="seal absolute -right-3 -top-3 h-14 w-14 animate-seal-in text-lg font-semibold sm:-right-4 sm:-top-4 sm:h-16 sm:w-16 sm:text-xl">
              Lê
            </span>

            <p className="eyebrow text-clan-gold-light">Gia phả · dòng họ</p>
            <h1 className="mt-3 font-serif text-5xl font-semibold leading-none text-clan-gold-light sm:text-7xl">
              Họ Lê
            </h1>
            <div className="rule-gold mx-auto my-6 w-40" />
            <p className="mx-auto max-w-xl font-serif text-lg italic text-clan-cream/85">
              Uống nước nhớ nguồn — lưu giữ cội rễ, nối liền các thế hệ qua từng đời,
              từng chi của dòng họ.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link href="/tree">
                <Button size="lg" variant="gold">Xem cây gia phả <ArrowRight className="h-5 w-5" /></Button>
              </Link>
              <Link href="/quan-ly">
                <Button size="lg" variant="outline" className="border-clan-gold/50 text-clan-cream hover:bg-white/10">
                  Quản lý gia phả
                </Button>
              </Link>
              <InstallButton className="h-12 px-6 text-base" />
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto -mt-10 max-w-7xl px-4">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          <StatCard icon={Users} label="Thành viên" value={stats.total} />
          <StatCard icon={Layers} label="Số đời" value={stats.generations} />
          <StatCard icon={GitBranch} label="Số chi" value={branchCount} />
          <StatCard icon={Heart} label="Còn sống" value={stats.alive} />
          <StatCard icon={Flame} label="Đã mất" value={stats.deceased} />
          <StatCard icon={Users} label="Nam / Nữ" value={`${stats.male}/${stats.female}`} />
        </div>
      </section>

      {isEmpty ? (
        <section className="mx-auto max-w-3xl px-4 py-16">
          <Card>
            <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-clan-red/10 text-clan-red dark:bg-clan-gold/15 dark:text-clan-gold">
                <UserPlus className="h-8 w-8" />
              </div>
              <h2 className="font-serif text-2xl font-bold">Gia phả còn trống</h2>
              <p className="max-w-md text-clan-brown/70 dark:text-clan-cream/60">
                Chưa có thành viên nào. Hãy vào trang Quản lý để thêm thủy tổ và con cháu
                của dòng họ. Dữ liệu được lưu ngay trên trình duyệt này.
              </p>
              <Link href="/quan-ly"><Button>Bắt đầu thêm thành viên</Button></Link>
            </CardContent>
          </Card>
        </section>
      ) : (
        featured.length > 0 && (
          <section className="mx-auto max-w-7xl px-4 py-14">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="section-title">Tổ tiên các đời</h2>
              <Link href="/members" className="text-sm font-medium text-clan-red hover:underline dark:text-clan-gold">
                Tất cả thành viên →
              </Link>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {featured.map((m) => <MemberCard key={m.id} member={m} />)}
            </div>
          </section>
        )
      )}
    </div>
  );
}

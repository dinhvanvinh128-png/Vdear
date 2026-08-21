import Link from "next/link";
import { Users, Layers, GitBranch, Flame, Heart, UserPlus, CalendarDays } from "lucide-react";
import { getStats, getEvents } from "@/lib/data";
import { StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default async function AdminDashboard() {
  const [stats, events] = await Promise.all([getStats(), getEvents()]);
  const upcoming = events.filter((e) => new Date(e.event_date) >= new Date()).length;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-2xl font-bold">Bảng điều khiển</h1>
        <Link href="/admin/members/new">
          <Button><UserPlus className="h-4 w-4" /> Thêm thành viên</Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        <StatCard icon={Users} label="Tổng thành viên" value={stats.total} />
        <StatCard icon={Layers} label="Số đời" value={stats.generations} />
        <StatCard icon={GitBranch} label="Số chi" value={stats.branches} />
        <StatCard icon={Heart} label="Còn sống" value={stats.alive} />
        <StatCard icon={Flame} label="Đã mất" value={stats.deceased} />
        <StatCard icon={Users} label="Nam" value={stats.male} />
        <StatCard icon={Users} label="Nữ" value={stats.female} />
        <StatCard icon={CalendarDays} label="Sự kiện sắp tới" value={upcoming} />
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="pt-6">
            <h2 className="mb-2 font-serif text-lg font-semibold">Bắt đầu nhanh</h2>
            <ol className="list-inside list-decimal space-y-1 text-sm text-clan-brown/80 dark:text-clan-cream/70">
              <li>Tạo các <Link href="/admin/branches" className="text-clan-red underline">chi họ</Link> trước.</li>
              <li>Thêm <Link href="/admin/members/new" className="text-clan-red underline">thủy tổ (đời 1)</Link>, để trống cha/mẹ.</li>
              <li>Thêm con cháu và chọn cha/mẹ để dựng cây.</li>
              <li>Xem kết quả ở <Link href="/tree" className="text-clan-red underline">cây gia phả</Link>.</li>
            </ol>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <h2 className="mb-2 font-serif text-lg font-semibold">Ghi chú</h2>
            <p className="text-sm text-clan-brown/80 dark:text-clan-cream/70">
              Hệ thống tự động chống quan hệ vòng lặp (không cho A là cha B rồi B là
              cha A), đồng bộ quan hệ vợ/chồng hai chiều, và cập nhật cây gia phả ngay
              sau khi lưu.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

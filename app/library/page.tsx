import type { Metadata } from "next";
import { ImageIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "Thư viện",
  description: "Album ảnh và tư liệu dòng họ: ảnh tổ tiên, nhà thờ họ, họp họ, mộ phần và tài liệu cổ."
};

const albums = [
  { id: "a1", title: "Nhà thờ họ", count: 12 },
  { id: "a2", title: "Họp họ thường niên", count: 24 },
  { id: "a3", title: "Ảnh tổ tiên", count: 8 },
  { id: "a4", title: "Mộ phần", count: 15 },
  { id: "a5", title: "Tư liệu cổ", count: 6 },
  { id: "a6", title: "Sự kiện dòng họ", count: 30 }
];

export default function LibraryPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="section-title mb-2">Thư viện dòng họ</h1>
      <p className="mb-8 text-clan-brown/70 dark:text-clan-cream/60">
        Ảnh và tư liệu được lưu trữ an toàn qua Supabase Storage. (Ảnh mẫu hiển thị
        khi chưa cấu hình Storage.)
      </p>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {albums.map((al) => (
          <Card key={al.id} className="overflow-hidden">
            <div className="flex h-40 items-center justify-center bg-gradient-to-br from-clan-brown/15 to-clan-gold/20">
              <ImageIcon className="h-12 w-12 text-clan-brown/50" />
            </div>
            <div className="flex items-center justify-between p-4">
              <h2 className="font-serif font-semibold">{al.title}</h2>
              <Badge variant="muted">{al.count} ảnh</Badge>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

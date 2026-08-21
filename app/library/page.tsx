import type { Metadata } from "next";
import { ImageIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Thư viện",
  description: "Album ảnh và tư liệu dòng họ: ảnh tổ tiên, nhà thờ họ, họp họ, mộ phần và tài liệu cổ."
};

export default function LibraryPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="section-title mb-2">Thư viện dòng họ</h1>
      <p className="mb-8 text-clan-brown/70 dark:text-clan-cream/60">
        Ảnh và tư liệu của dòng họ sẽ được lưu trữ an toàn qua Supabase Storage.
      </p>
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-clan-brown/10 text-clan-brown/60">
            <ImageIcon className="h-8 w-8" />
          </div>
          <h2 className="font-serif text-xl font-bold">Chưa có album nào</h2>
          <p className="max-w-md text-clan-brown/70 dark:text-clan-cream/60">
            Chức năng tải ảnh và tài liệu (Supabase Storage) sẽ được bổ sung ở phase
            tiếp theo. Khi đó quản trị viên có thể tạo album và tải ảnh dòng họ lên.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

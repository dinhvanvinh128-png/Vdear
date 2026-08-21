import type { Metadata } from "next";
import { ScrollText } from "lucide-react";
import { getMembers } from "@/lib/data";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { lifeSpan } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Lịch sử dòng họ",
  description: "Nguồn gốc, thủy tổ, các đời và quá trình phát triển của dòng họ Lê."
};

export default async function HistoryPage() {
  const members = await getMembers();
  const ancestor = members.find((m) => m.generation === 1 && m.gender === "male");

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <Badge variant="gold">Lịch sử</Badge>
      <h1 className="section-title mb-4 mt-3">Lịch sử dòng họ Lê</h1>

      {ancestor ? (
        <Card className="mb-8">
          <CardContent className="flex flex-col items-center gap-4 pt-6 text-center sm:flex-row sm:text-left">
            <img
              src={ancestor.avatar_url || ""}
              alt={ancestor.full_name}
              className="h-24 w-24 rounded-full border-2 border-clan-gold bg-clan-cream object-cover"
            />
            <div>
              <div className="text-xs uppercase tracking-wide text-clan-brown/60">Thủy tổ</div>
              <h2 className="font-serif text-2xl font-bold">{ancestor.full_name}</h2>
              <p className="text-clan-brown/70 dark:text-clan-cream/60">{lifeSpan(ancestor)}</p>
              {ancestor.biography && (
                <p className="mt-2 text-sm text-clan-brown/80 dark:text-clan-cream/70">
                  {ancestor.biography}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-clan-red/10 text-clan-red dark:bg-clan-gold/15 dark:text-clan-gold">
              <ScrollText className="h-8 w-8" />
            </div>
            <h2 className="font-serif text-xl font-bold">Chưa có nội dung lịch sử</h2>
            <p className="max-w-md text-clan-brown/70 dark:text-clan-cream/60">
              Phần lịch sử dòng họ (nguồn gốc, thủy tổ, các đời, những sự kiện lớn và
              quá trình phát triển) sẽ được quản trị viên biên soạn và cập nhật tại đây.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

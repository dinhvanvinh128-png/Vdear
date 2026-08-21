import type { Metadata } from "next";
import { getMembers } from "@/lib/data";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { lifeSpan } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Lịch sử dòng họ",
  description: "Nguồn gốc, thủy tổ, các đời và quá trình phát triển của dòng họ Nguyễn Phúc."
};

const timeline = [
  { year: "Cuối TK 19", title: "Khởi nguồn", text: "Thủy tổ Nguyễn Phúc Nguyên khai cơ lập nghiệp tại làng, gây dựng nền nếp gia phong." },
  { year: "Đầu TK 20", title: "Hình thành ba chi", text: "Các con của Thủy tổ trưởng thành, lập nên ba chi lớn: Chi Trưởng, Chi Hai và Chi Ba." },
  { year: "1945 – 1975", title: "Phân tán và hội tụ", text: "Trải qua binh biến, con cháu tỏa đi nhiều nơi nhưng vẫn giữ liên lạc và gia phả." },
  { year: "1985 – nay", title: "Khôi phục gia phả", text: "Con cháu chung tay tu sửa nhà thờ họ, sưu tầm tư liệu và biên soạn lại gia phả." },
  { year: "2026", title: "Số hóa gia phả", text: "Gia phả được số hóa, xây dựng website để lưu giữ và kết nối các thế hệ." }
];

export default async function HistoryPage() {
  const members = await getMembers();
  const ancestor = members.find((m) => m.generation === 1 && m.gender === "male");

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <Badge variant="gold">Lịch sử</Badge>
      <h1 className="section-title mb-4 mt-3">Lịch sử dòng họ Nguyễn Phúc</h1>

      {ancestor && (
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
              <p className="mt-2 text-sm text-clan-brown/80 dark:text-clan-cream/70">
                {ancestor.biography}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <h2 className="mb-6 font-serif text-xl font-bold">Dòng thời gian</h2>
      <ol className="relative border-l-2 border-clan-gold/40 pl-6">
        {timeline.map((t) => (
          <li key={t.year} className="mb-8 last:mb-0">
            <span className="absolute -left-[9px] flex h-4 w-4 items-center justify-center rounded-full bg-clan-red ring-4 ring-clan-cream dark:ring-[#1a1512]" />
            <div className="text-sm font-semibold text-clan-red dark:text-clan-gold">{t.year}</div>
            <h3 className="font-serif text-lg font-semibold">{t.title}</h3>
            <p className="mt-1 text-sm text-clan-brown/80 dark:text-clan-cream/70">{t.text}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

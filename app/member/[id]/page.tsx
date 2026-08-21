import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  MapPin,
  Briefcase,
  Calendar,
  Home,
  Users,
  Heart,
  QrCode
} from "lucide-react";
import {
  getMembers,
  getBranches,
  childrenOf,
  siblingsOf,
  spouseOf,
  parentsOf
} from "@/lib/data";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MemberCard } from "@/components/member-card";
import { lifeSpan, toOrdinalGen } from "@/lib/utils";

export async function generateMetadata({
  params
}: {
  params: { id: string };
}): Promise<Metadata> {
  const members = await getMembers();
  const m = members.find((x) => x.id === params.id);
  if (!m) return { title: "Không tìm thấy thành viên" };
  return {
    title: m.full_name,
    description: `Hồ sơ ${m.full_name} — ${toOrdinalGen(m.generation)}${
      m.occupation ? ", " + m.occupation : ""
    }. ${m.biography || ""}`.trim()
  };
}

export default async function MemberProfile({ params }: { params: { id: string } }) {
  const [members, branches] = await Promise.all([getMembers(), getBranches()]);
  const member = members.find((m) => m.id === params.id);
  if (!member) notFound();

  const { father, mother } = parentsOf(members, member);
  const spouse = spouseOf(members, member);
  const children = childrenOf(members, member.id);
  const siblings = siblingsOf(members, member);
  const branch = branches.find((b) => b.id === member.branch_id);

  const profileUrl = `https://gia-pha.vercel.app/member/${member.id}`;
  const qr = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(
    profileUrl
  )}`;

  const info: { icon: any; label: string; value?: string | null }[] = [
    { icon: Calendar, label: "Ngày sinh", value: member.birth_date },
    { icon: Calendar, label: "Ngày mất", value: member.death_date },
    { icon: Home, label: "Quê quán", value: member.hometown },
    { icon: MapPin, label: "Nơi sinh", value: member.birth_place },
    { icon: MapPin, label: "Nơi ở", value: member.address },
    { icon: Briefcase, label: "Nghề nghiệp", value: member.occupation }
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      {/* Header hồ sơ */}
      <Card className="overflow-hidden">
        <div className="h-28 bg-gradient-to-r from-clan-red to-clan-red-dark" />
        <CardContent className="pt-0">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <img
              src={member.avatar_url || ""}
              alt={member.full_name}
              className="-mt-12 h-28 w-28 rounded-2xl border-4 border-white bg-clan-cream object-cover shadow-lg dark:border-clan-ink"
            />
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-serif text-2xl font-bold sm:text-3xl">
                  {member.full_name}
                </h1>
                {!member.is_alive && <span title="Đã mất">🕯️</span>}
              </div>
              {member.nickname && (
                <p className="text-clan-brown/70 dark:text-clan-cream/60">
                  Thường gọi: {member.nickname}
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge variant={member.gender === "male" ? "male" : "female"}>
                  {member.gender === "male" ? "Nam" : member.gender === "female" ? "Nữ" : "Khác"}
                </Badge>
                <Badge variant="gold">{toOrdinalGen(member.generation)}</Badge>
                {branch && <Badge variant="muted">{branch.name}</Badge>}
                <Badge variant={member.is_alive ? "male" : "outline"}>
                  {member.is_alive ? "Còn sống" : "Đã mất"}
                </Badge>
              </div>
              <p className="mt-2 text-sm text-clan-brown/70 dark:text-clan-cream/60">
                {lifeSpan(member)}
              </p>
            </div>
            <div className="flex flex-col items-center rounded-lg border border-clan-brown/15 p-2">
              <img src={qr} alt="QR hồ sơ" width={110} height={110} className="rounded" />
              <span className="mt-1 flex items-center gap-1 text-[11px] text-clan-brown/60">
                <QrCode className="h-3 w-3" /> Quét để mở hồ sơ
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Thông tin */}
        <div className="lg:col-span-2">
          <Card>
            <CardContent className="pt-5">
              <h2 className="mb-4 font-serif text-lg font-semibold">Thông tin</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {info
                  .filter((i) => i.value)
                  .map((i) => (
                    <div key={i.label} className="flex items-start gap-3">
                      <i.icon className="mt-0.5 h-5 w-5 shrink-0 text-clan-red dark:text-clan-gold" />
                      <div>
                        <div className="text-xs text-clan-brown/60 dark:text-clan-cream/50">{i.label}</div>
                        <div className="text-sm">{i.value}</div>
                      </div>
                    </div>
                  ))}
              </div>
              {member.biography && (
                <>
                  <h3 className="mb-2 mt-6 font-serif font-semibold">Tiểu sử</h3>
                  <p className="text-sm leading-relaxed text-clan-brown/80 dark:text-clan-cream/70">
                    {member.biography}
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          {/* Con cái */}
          {children.length > 0 && (
            <div className="mt-6">
              <h2 className="mb-3 flex items-center gap-2 font-serif text-lg font-semibold">
                <Users className="h-5 w-5 text-clan-red dark:text-clan-gold" /> Con ({children.length})
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {children.map((c) => (
                  <MemberCard key={c.id} member={c} />
                ))}
              </div>
            </div>
          )}

          {/* Anh chị em */}
          {siblings.length > 0 && (
            <div className="mt-6">
              <h2 className="mb-3 font-serif text-lg font-semibold">
                Anh chị em ({siblings.length})
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {siblings.map((s) => (
                  <MemberCard key={s.id} member={s} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Quan hệ trực hệ */}
        <div>
          <Card>
            <CardContent className="pt-5">
              <h2 className="mb-4 flex items-center gap-2 font-serif text-lg font-semibold">
                <Heart className="h-5 w-5 text-clan-red dark:text-clan-gold" /> Quan hệ
              </h2>
              <RelRow label="Cha" member={father} />
              <RelRow label="Mẹ" member={mother} />
              <RelRow label="Vợ / Chồng" member={spouse} />
              {!father && !mother && !spouse && (
                <p className="text-sm text-clan-brown/60">Chưa có thông tin quan hệ.</p>
              )}
            </CardContent>
          </Card>
          <Link
            href="/tree"
            className="mt-4 block rounded-xl border border-clan-brown/15 bg-white p-4 text-center text-sm font-medium text-clan-red hover:bg-clan-cream dark:bg-clan-ink dark:text-clan-gold"
          >
            Xem trong cây gia phả →
          </Link>
        </div>
      </div>
    </div>
  );
}

function RelRow({ label, member }: { label: string; member: any }) {
  if (!member) return null;
  return (
    <Link
      href={`/member/${member.id}`}
      className="flex items-center gap-3 rounded-lg p-2 hover:bg-clan-cream dark:hover:bg-white/5"
    >
      <img
        src={member.avatar_url || ""}
        alt=""
        className="h-10 w-10 rounded-full border border-clan-gold/40 bg-clan-cream object-cover"
      />
      <div>
        <div className="text-xs text-clan-brown/60 dark:text-clan-cream/50">{label}</div>
        <div className="text-sm font-medium">{member.full_name}</div>
      </div>
    </Link>
  );
}

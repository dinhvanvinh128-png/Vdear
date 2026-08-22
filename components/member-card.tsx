import Link from "next/link";
import { Card } from "@/components/ui/card";
import { lifeSpan, toOrdinalGen } from "@/lib/utils";
import type { Member } from "@/types";

export function MemberCard({ member }: { member: Member }) {
  const genderRing =
    member.gender === "male"
      ? "ring-blue-400/60"
      : member.gender === "female"
      ? "ring-pink-400/60"
      : "ring-clan-gold/60";

  return (
    <Link href={`/member/${member.id}`} className="group block">
      <Card className="relative overflow-hidden p-5 text-center shadow-tablet transition-transform duration-150 group-hover:-translate-y-0.5">
        <span className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-transparent via-clan-gold to-transparent" />
        <div className="relative mx-auto h-16 w-16">
          <img
            src={member.avatar_url || ""}
            alt={member.full_name}
            className={`h-16 w-16 rounded-full bg-clan-cream object-cover ring-2 ${genderRing}`}
          />
          {!member.is_alive && (
            <span className="absolute -bottom-1 -right-1 text-sm" title="Đã mất">🕯️</span>
          )}
        </div>
        <h3 className="mt-3 truncate font-serif text-lg font-semibold group-hover:text-clan-red dark:group-hover:text-clan-gold">
          {member.full_name}
        </h3>
        {member.nickname && (
          <p className="truncate text-xs text-clan-brown/55 dark:text-clan-cream/45">
            {member.nickname}
          </p>
        )}
        <p className="mt-1 text-sm text-clan-brown/70 dark:text-clan-cream/60">
          {lifeSpan(member) || "—"}
        </p>
        <p className="mt-2 text-[11px] uppercase tracking-wider text-clan-gold">
          {toOrdinalGen(member.generation)}
        </p>
      </Card>
    </Link>
  );
}

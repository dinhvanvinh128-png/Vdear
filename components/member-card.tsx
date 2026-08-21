import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { lifeSpan, toOrdinalGen } from "@/lib/utils";
import type { Member } from "@/types";

export function MemberCard({ member }: { member: Member }) {
  return (
    <Link href={`/member/${member.id}`}>
      <Card className="group h-full overflow-hidden transition-shadow hover:shadow-md">
        <div className="flex items-center gap-4 p-4">
          <img
            src={member.avatar_url || ""}
            alt={member.full_name}
            className="h-16 w-16 shrink-0 rounded-full border-2 border-clan-gold/40 bg-clan-cream object-cover"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate font-serif text-base font-semibold group-hover:text-clan-red">
                {member.full_name}
              </h3>
              {!member.is_alive && (
                <span title="Đã mất" className="text-sm">🕯️</span>
              )}
            </div>
            {member.nickname && (
              <p className="truncate text-xs text-clan-brown/60 dark:text-clan-cream/50">
                ({member.nickname})
              </p>
            )}
            <p className="mt-1 text-sm text-clan-brown/70 dark:text-clan-cream/60">
              {lifeSpan(member) || "—"}
            </p>
            <div className="mt-2 flex flex-wrap gap-1">
              <Badge variant={member.gender === "male" ? "male" : "female"}>
                {member.gender === "male" ? "Nam" : member.gender === "female" ? "Nữ" : "Khác"}
              </Badge>
              <Badge variant="muted">{toOrdinalGen(member.generation)}</Badge>
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
}

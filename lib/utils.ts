import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** true nếu Supabase đã được cấu hình bằng biến môi trường */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export function formatYear(date?: string | null): string {
  if (!date) return "";
  const y = new Date(date).getFullYear();
  return Number.isNaN(y) ? String(date) : String(y);
}

export function lifeSpan(m: {
  birth_date?: string | null;
  death_date?: string | null;
}): string {
  const b = formatYear(m.birth_date);
  const d = formatYear(m.death_date);
  if (!b && !d) return "";
  return `${b || "?"}${d ? " – " + d : ""}`;
}

export function avatarFallback(name: string, gender?: string): string {
  const seed = encodeURIComponent(name || "member");
  const style = gender === "female" ? "avataaars" : "avataaars";
  return `https://api.dicebear.com/7.x/${style}/svg?seed=${seed}`;
}

export function toOrdinalGen(n: number): string {
  return `Đời thứ ${n}`;
}

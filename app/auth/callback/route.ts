import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Đổi mã OAuth (Google) lấy phiên đăng nhập. */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = createClient();
    if (supabase) await supabase.auth.exchangeCodeForSession(code);
  }
  return NextResponse.redirect(`${origin}${next}`);
}

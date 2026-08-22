"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail, Lock, AlertCircle } from "lucide-react";
import { getSupabase, supabaseConfigured } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

export default function LoginPage() {
  const router = useRouter();
  const configured = supabaseConfigured();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    const sb = getSupabase();
    if (!sb) {
      setMsg("Chưa cấu hình Supabase.");
      return;
    }
    setLoading(true);
    setMsg(null);
    const res =
      mode === "signin"
        ? await sb.auth.signInWithPassword({ email, password })
        : await sb.auth.signUp({ email, password });
    setLoading(false);
    if (res.error) {
      setMsg(res.error.message);
      return;
    }
    if (mode === "signup" && !res.data.session) {
      setMsg("Đã gửi email xác nhận. Kiểm tra hộp thư rồi đăng nhập.");
      return;
    }
    router.push("/quan-ly");
    router.refresh();
  }

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-16">
      <span className="seal mb-5 flex h-14 w-14 text-xl font-semibold">Lê</span>
      <h1 className="font-serif text-2xl font-semibold">
        {mode === "signin" ? "Đăng nhập" : "Đăng ký"}
      </h1>
      <p className="mb-6 mt-1 text-center text-sm text-clan-brown/70 dark:text-clan-cream/60">
        Đăng nhập để chỉnh sửa gia phả dùng chung.
      </p>

      <Card className="w-full">
        <CardContent className="pt-6">
          {!configured && (
            <div className="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Chưa cấu hình Supabase — web đang chạy chế độ cục bộ.</span>
            </div>
          )}

          <form onSubmit={handleEmail} className="space-y-3">
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-clan-brown/50" />
              <Input type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-9" />
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-clan-brown/50" />
              <Input type="password" required placeholder="Mật khẩu (≥ 6 ký tự)" value={password} onChange={(e) => setPassword(e.target.value)} className="pl-9" />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Đang xử lý..." : mode === "signin" ? "Đăng nhập" : "Đăng ký"}
            </Button>
          </form>

          {msg && <p className="mt-4 text-center text-sm text-clan-red">{msg}</p>}

          <p className="mt-4 text-center text-sm text-clan-brown/70 dark:text-clan-cream/60">
            {mode === "signin" ? "Chưa có tài khoản? " : "Đã có tài khoản? "}
            <button
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              className="font-medium text-clan-red hover:underline dark:text-clan-gold"
            >
              {mode === "signin" ? "Đăng ký" : "Đăng nhập"}
            </button>
          </p>
        </CardContent>
      </Card>

      <Link href="/" className="mt-6 text-sm text-clan-brown/60 hover:underline">← Về trang chủ</Link>
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { TreePine, Mail, Lock, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

export default function LoginPage() {
  const supabase = createClient();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) {
      setMsg("Chưa cấu hình Supabase. Hãy thêm biến môi trường để bật đăng nhập.");
      return;
    }
    setLoading(true);
    setMsg(null);
    const fn =
      mode === "signin"
        ? supabase.auth.signInWithPassword({ email, password })
        : supabase.auth.signUp({ email, password });
    const { error } = await fn;
    setLoading(false);
    if (error) setMsg(error.message);
    else if (mode === "signup") setMsg("Đã gửi email xác nhận. Vui lòng kiểm tra hộp thư.");
    else window.location.href = "/";
  }

  async function handleGoogle() {
    if (!supabase) {
      setMsg("Chưa cấu hình Supabase. Hãy thêm biến môi trường để bật đăng nhập.");
      return;
    }
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/` }
    });
  }

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-16">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full border-2 border-clan-gold bg-clan-red text-clan-gold">
        <TreePine className="h-8 w-8" />
      </div>
      <h1 className="font-serif text-2xl font-bold">
        {mode === "signin" ? "Đăng nhập" : "Đăng ký"}
      </h1>
      <p className="mb-6 mt-1 text-center text-sm text-clan-brown/70 dark:text-clan-cream/60">
        Truy cập gia phả dòng họ Lê
      </p>

      <Card className="w-full">
        <CardContent className="pt-6">
          {!supabase && (
            <div className="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Website đang chạy ở chế độ demo. Cấu hình Supabase (xem README) để
                bật đăng nhập và lưu dữ liệu thật.
              </span>
            </div>
          )}

          <form onSubmit={handleEmail} className="space-y-3">
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-clan-brown/50" />
              <Input
                type="email"
                required
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-clan-brown/50" />
              <Input
                type="password"
                required
                placeholder="Mật khẩu"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Đang xử lý..." : mode === "signin" ? "Đăng nhập" : "Đăng ký"}
            </Button>
          </form>

          <div className="my-4 flex items-center gap-3 text-xs text-clan-brown/50">
            <span className="h-px flex-1 bg-clan-brown/15" /> hoặc <span className="h-px flex-1 bg-clan-brown/15" />
          </div>

          <Button variant="outline" className="w-full" onClick={handleGoogle}>
            Đăng nhập với Google
          </Button>

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

      <Link href="/" className="mt-6 text-sm text-clan-brown/60 hover:underline">
        ← Về trang chủ
      </Link>
    </div>
  );
}

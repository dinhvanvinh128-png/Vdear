"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/**
 * Nút "Cài app". Tự hiện khi trình duyệt cho phép cài (Android/desktop Chrome).
 * Trên iPhone (Safari không có sự kiện cài) sẽ hiện hướng dẫn thao tác tay.
 * Tự ẩn khi app đã được cài / đang chạy dạng standalone.
 */
export function InstallButton({ className }: { className?: string }) {
  const [deferred, setDeferred] = useState<any>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [installed, setInstalled] = useState(false);
  const push = useToast((s) => s.push);

  useEffect(() => {
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;
    if (standalone) {
      setInstalled(true);
      return;
    }
    const ua = window.navigator.userAgent || "";
    setIsIOS(/iphone|ipad|ipod/i.test(ua));

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return null;
  // Chỉ hiện khi cài được (Android/desktop) hoặc trên iOS (hướng dẫn tay)
  if (!deferred && !isIOS) return null;

  async function onClick() {
    if (deferred) {
      deferred.prompt();
      try {
        await deferred.userChoice;
      } catch {}
      setDeferred(null);
      return;
    }
    if (isIOS) {
      push("success", "Trên iPhone: bấm nút Chia sẻ → “Thêm vào MH chính”.");
    }
  }

  return (
    <Button size="sm" variant="gold" onClick={onClick} className={className}>
      <Download className="h-4 w-4" /> Cài app
    </Button>
  );
}

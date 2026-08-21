"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Nút cần xác nhận trước khi thực hiện (ví dụ: xóa).
 * Bấm lần 1 hiện xác nhận, bấm "Xóa" để chạy `onConfirm`.
 */
export function ConfirmButton({
  onConfirm,
  label = "Xóa",
  confirmLabel = "Chắc chắn xóa?",
  message
}: {
  onConfirm: () => void | Promise<void>;
  label?: string;
  confirmLabel?: string;
  message?: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!open) {
    return (
      <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
        {label}
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {message && <span className="text-xs text-clan-brown/70">{message}</span>}
      <Button
        variant="destructive"
        size="sm"
        disabled={loading}
        onClick={async () => {
          setLoading(true);
          await onConfirm();
          setLoading(false);
          setOpen(false);
        }}
      >
        {loading ? "Đang xóa..." : confirmLabel}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={loading}>
        Hủy
      </Button>
    </div>
  );
}

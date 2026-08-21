"use client";

import { create } from "zustand";
import { CheckCircle2, XCircle, X } from "lucide-react";

type ToastType = "success" | "error";
interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastStore {
  toasts: Toast[];
  push: (type: ToastType, message: string) => void;
  remove: (id: number) => void;
}

export const useToast = create<ToastStore>((set) => ({
  toasts: [],
  push: (type, message) => {
    const id = Date.now() + Math.random();
    set((s) => ({ toasts: [...s.toasts, { id, type, message }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3500);
  },
  remove: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}));

/** Hàm tiện dụng gọi ngoài React nếu cần. */
export const toast = {
  success: (m: string) => useToast.getState().push("success", m),
  error: (m: string) => useToast.getState().push("error", m)
};

export function Toaster() {
  const { toasts, remove } = useToast();
  return (
    <div className="fixed bottom-4 right-4 z-[200] flex w-full max-w-sm flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="flex items-start gap-3 rounded-xl border border-clan-brown/15 bg-white p-3 shadow-lg animate-fade-in dark:bg-clan-ink"
        >
          {t.type === "success" ? (
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
          ) : (
            <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          )}
          <p className="flex-1 text-sm text-clan-ink dark:text-clan-cream">{t.message}</p>
          <button onClick={() => remove(t.id)} className="text-clan-brown/50 hover:text-clan-brown">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

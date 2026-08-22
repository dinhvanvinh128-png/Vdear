"use client";

import { create } from "zustand";

interface AuthState {
  ready: boolean;
  email: string | null;
  userId: string | null;
  setAuth: (u: { id: string; email: string | null } | null) => void;
  setReady: (v: boolean) => void;
}

export const useAuth = create<AuthState>((set) => ({
  ready: false,
  email: null,
  userId: null,
  setAuth: (u) => set({ userId: u?.id ?? null, email: u?.email ?? null }),
  setReady: (v) => set({ ready: v })
}));

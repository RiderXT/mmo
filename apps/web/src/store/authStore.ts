import { create } from "zustand";
import type { AuthUser } from "@mmo/shared";

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  isBootstrapping: boolean;
  setSession: (user: AuthUser, accessToken: string) => void;
  clearSession: () => void;
  setBootstrapping: (value: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  isBootstrapping: true,
  setSession: (user, accessToken) => set({ user, accessToken }),
  clearSession: () => set({ user: null, accessToken: null }),
  setBootstrapping: (value) => set({ isBootstrapping: value }),
}));

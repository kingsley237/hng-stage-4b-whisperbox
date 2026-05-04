import { create } from 'zustand';

interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  publicKey: string;
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  privateKey: CryptoKey | null;
  isLoading: boolean;
  setAuth: (
    user: AuthUser,
    accessToken: string,
    refreshToken: string,
    privateKey: CryptoKey
  ) => void;
  setPrivateKey: (key: CryptoKey) => void;
  setAccessToken: (token: string) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  privateKey: null,
  isLoading: true,

  setAuth: (user, accessToken, refreshToken, privateKey) =>
    set({ user, accessToken, refreshToken, privateKey, isLoading: false }),

  setPrivateKey: (privateKey) => set({ privateKey }),

  setAccessToken: (accessToken) => set({ accessToken }),

  clearAuth: () =>
    set({
      user: null,
      accessToken: null,
      refreshToken: null,
      privateKey: null,
      isLoading: false,
    }),
}));
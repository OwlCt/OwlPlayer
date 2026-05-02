import { create } from "zustand";
import api from "../api";
import { usePlayerStore } from "./playerStore";
import { setManualOfflineMode } from "../hooks/useOnlineStatus";
import { prefetchImageUrls } from "../utils/imagePrefetch";

// localStorage keys
const TOKEN_KEY = "auth-token";
const REFRESH_TOKEN_KEY = "auth-refresh-token";
const USER_KEY = "auth-user";

// User type
export interface User {
  id: string;
  email: string;
  username: string;
  avatar_url: string;
  is_email_verified: boolean;
  is_active: boolean;
  is_admin: boolean;
  user_group: "normal" | "vip";
  created_at: string;
  updated_at: string;
}

// Token pair from API
export interface TokenPair {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

// Auth state interface
interface AuthState {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;
  pendingVerificationEmail: string | null;

  // Actions
  login: (identifier: string, password: string) => Promise<void>;
  register: (
    email: string,
    username: string,
    password: string,
  ) => Promise<boolean>;
  verifyEmail: (email: string, code: string) => Promise<void>;
  resendCode: (email: string) => Promise<void>;
  logout: () => void;
  refreshAccessToken: () => Promise<boolean>;
  fetchCurrentUser: () => Promise<void>;
  clearError: () => void;
  setPendingVerificationEmail: (email: string | null) => void;
  initialize: () => void;
  setAuthenticatedSession: (user: User, tokenPair: TokenPair) => void;
  // Password reset actions
  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (
    email: string,
    code: string,
    newPassword: string,
  ) => Promise<void>;
  // Email login actions
  sendLoginCode: (email: string) => Promise<void>;
  loginWithCode: (email: string, code: string) => Promise<void>;
}

// Helper functions for localStorage
const loadToken = (): string | null => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

const loadRefreshToken = (): string | null => {
  try {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  } catch {
    return null;
  }
};

const loadUser = (): User | null => {
  try {
    const saved = localStorage.getItem(USER_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
};

const saveTokens = (accessToken: string, refreshToken: string): void => {
  try {
    localStorage.setItem(TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  } catch {
    // Ignore if localStorage unavailable
  }
};

const saveUser = (user: User): void => {
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    // Ignore if localStorage unavailable
  }
};

const clearStorage = (): void => {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {
    // Ignore if localStorage unavailable
  }
};

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  refreshToken: null,
  isAuthenticated: false,
  isInitialized: false,
  isLoading: false,
  error: null,
  pendingVerificationEmail: null,

  initialize: () => {
    const token = loadToken();
    const refreshToken = loadRefreshToken();
    const user = loadUser();

    if (token && user) {
      set({
        token,
        refreshToken,
        user,
        isAuthenticated: true,
        isInitialized: true,
      });
      const avatarUrl = user.avatar_url || "/api/avatars/default.svg";
      prefetchImageUrls([avatarUrl]);
    } else {
      set({ isInitialized: true });
    }
  },

  setAuthenticatedSession: (user, tokenPair) => {
    saveTokens(tokenPair.access_token, tokenPair.refresh_token);
    saveUser(user);
    set({
      user,
      token: tokenPair.access_token,
      refreshToken: tokenPair.refresh_token,
      isAuthenticated: true,
      isInitialized: true,
      isLoading: false,
      error: null,
    });
  },

  login: async (identifier, password) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.post<{
        success: boolean;
        user?: User;
        token?: {
          access_token: string;
          refresh_token: string;
          expires_in: number;
        };
        error?: { message: string };
      }>("/auth/login", {
        identifier,
        password,
      });

      if (!response.data.success) {
        throw new Error(response.data.error?.message || "Login failed");
      }

      const user = response.data.user!;
      const token = response.data.token!;
      saveTokens(token.access_token, token.refresh_token);
      saveUser(user);

      set({
        user,
        token: token.access_token,
        refreshToken: token.refresh_token,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
      const avatarUrl = user.avatar_url || "/api/avatars/default.svg";
      prefetchImageUrls([avatarUrl]);
    } catch (err: unknown) {
      // Extract error message from axios error response if available
      let message = "Login failed";
      if (err && typeof err === "object" && "response" in err) {
        const axiosErr = err as {
          response?: { data?: { error?: { message?: string } } };
        };
        message = axiosErr.response?.data?.error?.message || message;
      } else if (err instanceof Error) {
        message = err.message;
      }
      set({ isLoading: false, error: message });
      throw err;
    }
  },

  register: async (email, username, password) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.post<{
        success: boolean;
        verification_required?: boolean;
        error?: { message: string };
      }>("/auth/register", {
        email,
        username,
        password,
      });

      if (!response.data.success) {
        throw new Error(response.data.error?.message || "Registration failed");
      }

      const verificationRequired = response.data.verification_required === true;

      set({
        isLoading: false,
        error: null,
        pendingVerificationEmail: verificationRequired ? email : null,
      });
      return verificationRequired;
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Registration failed";
      set({ isLoading: false, error: message });
      throw err;
    }
  },

  verifyEmail: async (email, code) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.post<{
        success: boolean;
        error?: { message: string };
      }>("/auth/verify-email", {
        email,
        code,
      });

      if (!response.data.success) {
        throw new Error(response.data.error?.message || "Verification failed");
      }

      set({
        isLoading: false,
        error: null,
        pendingVerificationEmail: null,
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Verification failed";
      set({ isLoading: false, error: message });
      throw err;
    }
  },

  resendCode: async (email) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.post<{
        success: boolean;
        error?: { message: string };
      }>("/auth/resend-code", {
        email,
      });

      if (!response.data.success) {
        throw new Error(
          response.data.error?.message || "Failed to resend code",
        );
      }

      set({ isLoading: false, error: null });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to resend code";
      set({ isLoading: false, error: message });
      throw err;
    }
  },

  logout: () => {
    // Stop playback and clear player state
    const playerStore = usePlayerStore.getState();
    if (playerStore.audioRef) {
      playerStore.audioRef.pause();
      playerStore.audioRef.src = "";
    }
    playerStore.clearQueue();

    // Manual offline mode is a session-level toggle. Clear it on logout so the
    // next login is not blocked by a previous user's bandwidth-saving setting.
    setManualOfflineMode(false);

    clearStorage();
    set({
      user: null,
      token: null,
      refreshToken: null,
      isAuthenticated: false,
      error: null,
    });
  },

  refreshAccessToken: async () => {
    const { refreshToken } = get();
    if (!refreshToken) return false;

    try {
      const response = await api.post<{
        status: string;
        data?: { tokens: TokenPair };
        error?: { message: string };
      }>("/auth/refresh", {
        refresh_token: refreshToken,
      });

      if (response.data.status === "error") {
        get().logout();
        return false;
      }

      const { tokens } = response.data.data!;
      saveTokens(tokens.access_token, tokens.refresh_token);

      set({
        token: tokens.access_token,
        refreshToken: tokens.refresh_token,
      });

      return true;
    } catch {
      get().logout();
      return false;
    }
  },

  fetchCurrentUser: async () => {
    const { token } = get();
    if (!token) return;

    try {
      const response = await api.get<{
        success: boolean;
        data?: User;
        error?: { message: string };
      }>("/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.data.success) {
        throw new Error(response.data.error?.message || "Failed to fetch user");
      }

      const user = response.data.data!;
      saveUser(user);
      set({ user });
    } catch {
      // Token might be invalid, try refresh
      const refreshed = await get().refreshAccessToken();
      if (refreshed) {
        await get().fetchCurrentUser();
      }
    }
  },

  clearError: () => set({ error: null }),

  setPendingVerificationEmail: (email) =>
    set({ pendingVerificationEmail: email }),

  forgotPassword: async (email) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.post<{
        success: boolean;
        message?: string;
        error?: { message: string };
      }>("/auth/forgot-password", {
        email,
      });

      if (!response.data.success) {
        throw new Error(
          response.data.error?.message || "Failed to send reset code",
        );
      }

      set({ isLoading: false, error: null });
    } catch (err: unknown) {
      // Extract error message from axios error response if available
      let message = "发送重置验证码失败";
      if (err && typeof err === "object" && "response" in err) {
        const axiosErr = err as {
          response?: { data?: { error?: { message?: string } } };
        };
        message = axiosErr.response?.data?.error?.message || message;
      } else if (err instanceof Error) {
        message = err.message;
      }
      set({ isLoading: false, error: message });
      throw err;
    }
  },

  resetPassword: async (email, code, newPassword) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.post<{
        success: boolean;
        message?: string;
        error?: { message: string };
      }>("/auth/reset-password", {
        email,
        code,
        new_password: newPassword,
      });

      if (!response.data.success) {
        throw new Error(
          response.data.error?.message || "Password reset failed",
        );
      }

      set({ isLoading: false, error: null });
    } catch (err: unknown) {
      // Extract error message from axios error response if available
      let message = "密码重置失败";
      if (err && typeof err === "object" && "response" in err) {
        const axiosErr = err as {
          response?: { data?: { error?: { message?: string } } };
        };
        message = axiosErr.response?.data?.error?.message || message;
      } else if (err instanceof Error) {
        message = err.message;
      }
      set({ isLoading: false, error: message });
      throw err;
    }
  },

  sendLoginCode: async (email) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.post<{
        success: boolean;
        message?: string;
        error?: { message: string };
      }>("/auth/send-login-code", {
        email,
      });

      if (!response.data.success) {
        throw new Error(
          response.data.error?.message || "Failed to send login code",
        );
      }

      set({ isLoading: false, error: null });
    } catch (err: unknown) {
      // Extract error message from axios error response if available
      let message = "发送登录验证码失败";
      if (err && typeof err === "object" && "response" in err) {
        const axiosErr = err as {
          response?: { data?: { error?: { message?: string } } };
        };
        message = axiosErr.response?.data?.error?.message || message;
      } else if (err instanceof Error) {
        message = err.message;
      }
      set({ isLoading: false, error: message });
      throw err;
    }
  },

  loginWithCode: async (email, code) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.post<{
        success: boolean;
        user?: User;
        token?: {
          access_token: string;
          refresh_token: string;
          expires_in: number;
        };
        error?: { message: string };
      }>("/auth/login-with-code", {
        email,
        code,
      });

      if (!response.data.success) {
        throw new Error(response.data.error?.message || "Login failed");
      }

      const user = response.data.user!;
      const token = response.data.token!;
      saveTokens(token.access_token, token.refresh_token);
      saveUser(user);

      set({
        user,
        token: token.access_token,
        refreshToken: token.refresh_token,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
    } catch (err: unknown) {
      // Extract error message from axios error response if available
      let message = "登录失败";
      if (err && typeof err === "object" && "response" in err) {
        const axiosErr = err as {
          response?: { data?: { error?: { message?: string } } };
        };
        message = axiosErr.response?.data?.error?.message || message;
      } else if (err instanceof Error) {
        message = err.message;
      }
      set({ isLoading: false, error: message });
      throw err;
    }
  },
}));

// Export helpers for testing
export {
  TOKEN_KEY,
  REFRESH_TOKEN_KEY,
  USER_KEY,
  loadToken,
  loadRefreshToken,
  loadUser,
  saveTokens,
  saveUser,
  clearStorage,
};

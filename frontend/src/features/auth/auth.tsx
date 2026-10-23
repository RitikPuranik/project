
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/shared/lib/api";
import type { Person } from "@/shared/lib/types";

type Status = "loading" | "authed" | "anon";

interface AuthContextValue {
  user: Person | null;
  status: Status;
  login: (email: string, password: string, remember: boolean) => Promise<void>;
  completeOAuth: (accessToken: string, refreshToken: string) => Promise<void>;
  register: (name: string, email: string, password: string, role?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface RawUser {
  id?: string;
  _id?: string;
  name: string;
  email: string;
  role: Person["role"];
  avatar?: string;
}

const normalize = (u: RawUser): Person => ({
  _id: (u._id ?? u.id) as string,
  name: u.name,
  email: u.email,
  role: u.role,
  avatar: u.avatar,
});

function storageWithToken(): Storage | null {
  if (typeof window === "undefined") return null;
  if (localStorage.getItem("accessToken")) return localStorage;
  if (sessionStorage.getItem("accessToken")) return sessionStorage;
  return null;
}

function clearTokens() {
  for (const s of [localStorage, sessionStorage]) {
    s.removeItem("accessToken");
    s.removeItem("refreshToken");
    s.removeItem("user");
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const [user, setUser] = useState<Person | null>(null);
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    let alive = true;
    const store = storageWithToken();
    if (!store) {
      queueMicrotask(() => alive && setStatus("anon"));
      return () => {
        alive = false;
      };
    }
    api
      .get<{ user: RawUser }>("/auth/me")
      .then(({ data }) => {
        if (!alive) return;
        const u = normalize(data.user);
        store.setItem("user", JSON.stringify(u));
        setUser(u);
        setStatus("authed");
      })
      .catch(() => {
        if (!alive) return;
        clearTokens();
        setStatus("anon");
      });
    return () => {
      alive = false;
    };
  }, []);

  const persist = useCallback(
    (data: { user: RawUser; accessToken: string; refreshToken: string }, remember: boolean) => {
      clearTokens();
      const store = remember ? localStorage : sessionStorage;
      const u = normalize(data.user);
      store.setItem("accessToken", data.accessToken);
      store.setItem("refreshToken", data.refreshToken);
      store.setItem("user", JSON.stringify(u));
      setUser(u);
      setStatus("authed");
    },
    []
  );

  const login = useCallback(
    async (email: string, password: string, remember: boolean) => {
      const { data } = await api.post("/auth/login", { email, password, rememberMe: remember });
      persist(data, remember);
    },
    [persist]
  );

  // Finishes a redirect-based sign-in (Google): store the tokens, then load the profile.
  const completeOAuth = useCallback(
    async (accessToken: string, refreshToken: string) => {
      clearTokens();
      localStorage.setItem("accessToken", accessToken);
      localStorage.setItem("refreshToken", refreshToken);
      try {
        const { data } = await api.get<{ user: RawUser }>("/auth/me");
        persist({ user: data.user, accessToken, refreshToken }, true);
      } catch (err) {
        clearTokens();
        throw err;
      }
    },
    [persist]
  );

  const register = useCallback(
    async (name: string, email: string, password: string, role?: string) => {
      const { data } = await api.post("/auth/register", { name, email, password, role });
      persist(data, true);
    },
    [persist]
  );

  const logout = useCallback(async () => {
    const refreshToken = localStorage.getItem("refreshToken") || sessionStorage.getItem("refreshToken");
    try {
      if (refreshToken) await api.post("/auth/logout", { refreshToken });
    } catch {
      /* sign out locally even if the API is unreachable */
    }
    clearTokens();
    setUser(null);
    setStatus("anon");
    navigate("/login", { replace: true });
  }, [navigate]);

  const value = useMemo(
    () => ({ user, status, login, completeOAuth, register, logout }),
    [user, status, login, completeOAuth, register, logout]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

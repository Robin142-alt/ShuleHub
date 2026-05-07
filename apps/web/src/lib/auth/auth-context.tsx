"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

import type {
  AuthSession,
  AuthState,
  AuthUser,
  PortalCredentials,
  SchoolCredentials,
  SuperAdminCredentials,
  SystemDomain,
  TokenPair,
} from "./types";

/* ─── Storage Keys ───────────────────────────────────────────────── */
const STORAGE_PREFIX = "shulehub_auth";
const getStorageKey = (domain: SystemDomain) => `${STORAGE_PREFIX}_${domain}`;

/* ─── Demo Token Generator ───────────────────────────────────────── */
function createDemoTokens(): TokenPair {
  const now = Date.now();
  return {
    accessToken: `sh_${Math.random().toString(36).slice(2, 18)}`,
    refreshToken: `sh_rt_${Math.random().toString(36).slice(2, 18)}`,
    expiresAt: now + 30 * 60 * 1000, // 30 min
    refreshExpiresAt: now + 7 * 24 * 60 * 60 * 1000, // 7 days
  };
}

function createDemoSession(user: AuthUser): AuthSession {
  return {
    id: `session_${Math.random().toString(36).slice(2, 10)}`,
    user,
    tokens: createDemoTokens(),
    deviceId: `device_${Math.random().toString(36).slice(2, 8)}`,
    ipAddress: "197.248.x.x",
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "server",
    createdAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
    trustedDevice: true,
  };
}

function readStoredAuthState(domain: SystemDomain): AuthState {
  const baseState: AuthState = {
    user: null,
    session: null,
    isAuthenticated: false,
    isLoading: false,
    error: null,
  };

  if (typeof window === "undefined") {
    return {
      ...baseState,
      isLoading: true,
    };
  }

  try {
    const stored = localStorage.getItem(getStorageKey(domain));

    if (!stored) {
      return baseState;
    }

    const session: AuthSession = JSON.parse(stored);

    if (session.tokens.expiresAt > Date.now()) {
      return {
        user: session.user,
        session,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      };
    }

    if (session.tokens.refreshExpiresAt > Date.now()) {
      const refreshed = { ...session, tokens: createDemoTokens() };
      localStorage.setItem(getStorageKey(domain), JSON.stringify(refreshed));

      return {
        user: refreshed.user,
        session: refreshed,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      };
    }

    localStorage.removeItem(getStorageKey(domain));
  } catch {
    // Storage unavailable
  }

  return baseState;
}

/* ─── Context Type ───────────────────────────────────────────────── */
interface AuthContextValue extends AuthState {
  loginSuperAdmin: (creds: SuperAdminCredentials) => Promise<void>;
  loginSchool: (creds: SchoolCredentials) => Promise<void>;
  loginPortal: (creds: PortalCredentials) => Promise<void>;
  logout: () => void;
  logoutAll: () => void;
  refreshSession: () => Promise<void>;
  currentDomain: SystemDomain | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/* ─── Provider ───────────────────────────────────────────────────── */
export function AuthProvider({
  domain,
  children,
}: {
  domain: SystemDomain;
  children: ReactNode;
}) {
  const router = useRouter();
  const [state, setState] = useState<AuthState>(() => readStoredAuthState(domain));

  const persistSession = useCallback(
    (session: AuthSession) => {
      try {
        localStorage.setItem(getStorageKey(domain), JSON.stringify(session));
      } catch {
        // Storage unavailable
      }
    },
    [domain],
  );

  const loginSuperAdmin = useCallback(
    async (creds: SuperAdminCredentials) => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      await new Promise((r) => setTimeout(r, 300));

      const user: AuthUser = {
        id: "sa_001",
        email: creds.email,
        name: "Robin Mwangi",
        domain: "superadmin",
        role: "platform_owner",
        permissions: ["*"],
        lastLoginAt: new Date().toISOString(),
        mfaEnabled: true,
      };

      const session = createDemoSession(user);
      persistSession(session);
      setState({
        user,
        session,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
    },
    [persistSession],
  );

  const loginSchool = useCallback(
    async (creds: SchoolCredentials) => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      await new Promise((r) => setTimeout(r, 250));

      // Map identifier to role for demo
      const roleMap: Record<string, { role: string; name: string }> = {
        "principal@greenfield.ac.ke": { role: "principal", name: "Dr. Wanjiku Muthoni" },
        "bursar@greenfield.ac.ke": { role: "bursar", name: "James Ochieng" },
        "teacher@greenfield.ac.ke": { role: "teacher", name: "Grace Akinyi" },
        "admin@greenfield.ac.ke": { role: "admin", name: "Peter Kamau" },
      };

      const match = roleMap[creds.identifier.toLowerCase()] ?? {
        role: "principal",
        name: "School Staff",
      };

      const user: AuthUser = {
        id: `sch_${Math.random().toString(36).slice(2, 8)}`,
        email: creds.identifier,
        name: match.name,
        domain: "school",
        role: match.role as AuthUser["role"],
        tenantId: creds.tenantSlug,
        permissions: ["school.*"],
        lastLoginAt: new Date().toISOString(),
        mfaEnabled: false,
      };

      const session = createDemoSession(user);
      persistSession(session);
      setState({
        user,
        session,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
    },
    [persistSession],
  );

  const loginPortal = useCallback(
    async (creds: PortalCredentials) => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      await new Promise((r) => setTimeout(r, 220));

      const isStudent = /^SH-/i.test(creds.identifier);

      const user: AuthUser = {
        id: `portal_${Math.random().toString(36).slice(2, 8)}`,
        phone: isStudent ? undefined : creds.identifier,
        name: isStudent ? "Aisha Njeri" : "Margaret Njeri",
        domain: "portal",
        role: isStudent ? "student" : "parent",
        permissions: isStudent ? ["portal.student.*"] : ["portal.parent.*"],
        lastLoginAt: new Date().toISOString(),
        mfaEnabled: false,
      };

      const session = createDemoSession(user);
      persistSession(session);
      setState({
        user,
        session,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
    },
    [persistSession],
  );

  const logout = useCallback(() => {
    localStorage.removeItem(getStorageKey(domain));
    setState({
      user: null,
      session: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });

    const loginPaths: Record<SystemDomain, string> = {
      superadmin: "/superadmin/login",
      school: "/school/login",
      portal: "/portal/login",
    };
    router.push(loginPaths[domain]);
  }, [domain, router]);

  const logoutAll = useCallback(() => {
    localStorage.removeItem(getStorageKey("superadmin"));
    localStorage.removeItem(getStorageKey("school"));
    localStorage.removeItem(getStorageKey("portal"));
    logout();
  }, [logout]);

  const refreshSession = useCallback(async () => {
    if (!state.session) return;
    const refreshed: AuthSession = {
      ...state.session,
      tokens: createDemoTokens(),
      lastActiveAt: new Date().toISOString(),
    };
    persistSession(refreshed);
    setState((prev) => ({ ...prev, session: refreshed }));
  }, [state.session, persistSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      loginSuperAdmin,
      loginSchool,
      loginPortal,
      logout,
      logoutAll,
      refreshSession,
      currentDomain: domain,
    }),
    [state, loginSuperAdmin, loginSchool, loginPortal, logout, logoutAll, refreshSession, domain],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/* ─── Hook ───────────────────────────────────────────────────────── */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}

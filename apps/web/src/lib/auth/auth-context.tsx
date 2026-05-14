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
  AuthState,
  PortalCredentials,
  SchoolCredentials,
  SuperAdminCredentials,
  SystemDomain,
} from "./types";

const STORAGE_PREFIX = "shulehub_auth";
const getStorageKey = (domain: SystemDomain) => `${STORAGE_PREFIX}_${domain}`;

function emptyAuthState(isLoading = false): AuthState {
  return {
    user: null,
    session: null,
    isAuthenticated: false,
    isLoading,
    error: null,
  };
}

function readStoredAuthState(): AuthState {
  if (typeof window === "undefined") {
    return emptyAuthState(true);
  }

  localStorage.removeItem(getStorageKey("superadmin"));
  localStorage.removeItem(getStorageKey("school"));
  localStorage.removeItem(getStorageKey("portal"));
  return emptyAuthState();
}

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

export function AuthProvider({
  domain,
  children,
}: {
  domain: SystemDomain;
  children: ReactNode;
}) {
  const router = useRouter();
  const [state, setState] = useState<AuthState>(() => readStoredAuthState());

  const rejectClientLogin = useCallback(async () => {
    const message = "Authentication must use the secure server gateway.";
    setState((current) => ({
      ...current,
      isAuthenticated: false,
      isLoading: false,
      error: message,
    }));
    throw new Error(message);
  }, []);

  const loginSuperAdmin = useCallback(
    async () => rejectClientLogin(),
    [rejectClientLogin],
  );

  const loginSchool = useCallback(
    async () => rejectClientLogin(),
    [rejectClientLogin],
  );

  const loginPortal = useCallback(
    async () => rejectClientLogin(),
    [rejectClientLogin],
  );

  const logout = useCallback(() => {
    localStorage.removeItem(getStorageKey(domain));
    setState(emptyAuthState());

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
    setState((current) => ({
      ...current,
      isAuthenticated: false,
      session: null,
      user: null,
      error: "Session refresh must use the secure server gateway.",
    }));
  }, []);

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

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}

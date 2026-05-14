"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { TenantResolution } from "./types";

const TENANT_REGISTRY: Record<string, TenantResolution> = {};

const FALLBACK_TENANT: TenantResolution = {
  status: "fallback",
  tenantId: "",
  slug: "",
  name: "No school workspace selected",
  primaryColor: "#059669",
  county: "Awaiting onboarding",
  supportEmail: "support@shulehub.co.ke",
  supportPhone: "Configured during onboarding",
  subscriptionStatus: "suspended",
};

export function resolveTenanFromSubdomain(): TenantResolution {
  if (typeof window === "undefined") return FALLBACK_TENANT;

  const hostname = window.location.hostname;
  const parts = hostname.split(".");

  if (hostname === "localhost" || hostname === "127.0.0.1") {
    const params = new URLSearchParams(window.location.search);
    const tenantParam = params.get("tenant");
    if (tenantParam && TENANT_REGISTRY[tenantParam]) {
      return TENANT_REGISTRY[tenantParam];
    }
    return FALLBACK_TENANT;
  }

  if (parts.length >= 3) {
    const subdomain = parts[0];
    if (["superadmin", "portal", "www", "api"].includes(subdomain)) {
      return FALLBACK_TENANT;
    }
    if (subdomain && TENANT_REGISTRY[subdomain]) {
      return TENANT_REGISTRY[subdomain];
    }
    return {
      ...FALLBACK_TENANT,
      status: "unknown",
      slug: subdomain ?? "",
      name: subdomain ? `Unknown (${subdomain})` : FALLBACK_TENANT.name,
    };
  }

  return FALLBACK_TENANT;
}

export function resolveTenantBySlug(slug: string): TenantResolution {
  return (
    TENANT_REGISTRY[slug] ?? {
      ...FALLBACK_TENANT,
      status: "unknown",
      slug,
      name: slug ? `Unknown (${slug})` : FALLBACK_TENANT.name,
    }
  );
}

interface TenantContextValue {
  tenant: TenantResolution;
  setTenant: (slug: string) => void;
  isResolved: boolean;
}

const TenantContext = createContext<TenantContextValue | null>(null);

export function TenantProvider({
  initialSlug,
  children,
}: {
  initialSlug?: string;
  children: ReactNode;
}) {
  const [tenant, setTenantState] = useState<TenantResolution>(() => {
    if (initialSlug) return resolveTenantBySlug(initialSlug);
    return resolveTenanFromSubdomain();
  });

  const setTenant = (slug: string) => {
    setTenantState(resolveTenantBySlug(slug));
  };

  const value = useMemo<TenantContextValue>(
    () => ({
      tenant,
      setTenant,
      isResolved: tenant.status === "resolved",
    }),
    [tenant],
  );

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant() {
  const ctx = useContext(TenantContext);
  if (!ctx) {
    throw new Error("useTenant must be used within a TenantProvider");
  }
  return ctx;
}

export function getAllTenants(): TenantResolution[] {
  return Object.values(TENANT_REGISTRY);
}

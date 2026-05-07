"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { TenantResolution } from "./types";

/* ─── Demo Tenant Registry ───────────────────────────────────────── */
const TENANT_REGISTRY: Record<string, TenantResolution> = {
  greenfield: {
    status: "resolved",
    tenantId: "tenant_greenfield",
    slug: "greenfield",
    name: "Greenfield Academy",
    primaryColor: "#059669",
    county: "Nairobi County",
    supportEmail: "support@greenfield.ac.ke",
    supportPhone: "0712 345 678",
    subscriptionStatus: "active",
  },
  stmarys: {
    status: "resolved",
    tenantId: "tenant_stmarys",
    slug: "stmarys",
    name: "St. Mary's Girls Secondary",
    primaryColor: "#7c3aed",
    county: "Kisumu County",
    supportEmail: "support@stmarys.ac.ke",
    supportPhone: "0723 456 789",
    subscriptionStatus: "active",
  },
  "amani-prep": {
    status: "resolved",
    tenantId: "tenant_amani",
    slug: "amani-prep",
    name: "Amani Prep School",
    primaryColor: "#2563eb",
    county: "Mombasa County",
    supportEmail: "support@amaniprep.ac.ke",
    supportPhone: "0734 567 890",
    subscriptionStatus: "grace",
  },
  "nairobi-junior": {
    status: "resolved",
    tenantId: "tenant_nairobi_junior",
    slug: "nairobi-junior",
    name: "Nairobi Junior Academy",
    primaryColor: "#ea580c",
    county: "Nairobi County",
    supportEmail: "support@nairobijunior.ac.ke",
    supportPhone: "0745 678 901",
    subscriptionStatus: "trial",
  },
};

const FALLBACK_TENANT: TenantResolution = {
  status: "fallback",
  tenantId: "tenant_demo",
  slug: "demo",
  name: "Demo School",
  primaryColor: "#059669",
  county: "Nairobi County",
  supportEmail: "support@shulehub.com",
  supportPhone: "0700 000 000",
  subscriptionStatus: "active",
};

/* ─── Tenant Resolution ──────────────────────────────────────────── */
export function resolveTenanFromSubdomain(): TenantResolution {
  if (typeof window === "undefined") return FALLBACK_TENANT;

  const hostname = window.location.hostname;
  // Extract subdomain: {tenant}.app.com or {tenant}.localhost
  const parts = hostname.split(".");

  // For localhost dev: just use fallback or check URL params
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    // Check for tenant query param in dev
    const params = new URLSearchParams(window.location.search);
    const tenantParam = params.get("tenant");
    if (tenantParam && TENANT_REGISTRY[tenantParam]) {
      return TENANT_REGISTRY[tenantParam];
    }
    return FALLBACK_TENANT;
  }

  // Production: extract subdomain
  if (parts.length >= 3) {
    const subdomain = parts[0];
    // Skip system subdomains
    if (["superadmin", "portal", "www", "api"].includes(subdomain)) {
      return FALLBACK_TENANT;
    }
    if (TENANT_REGISTRY[subdomain]) {
      return TENANT_REGISTRY[subdomain];
    }
    return {
      ...FALLBACK_TENANT,
      status: "unknown",
      slug: subdomain,
      name: `Unknown (${subdomain})`,
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
      name: `Unknown (${slug})`,
    }
  );
}

/* ─── Context ────────────────────────────────────────────────────── */
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

/** Get all available tenants for demo switching */
export function getAllTenants(): TenantResolution[] {
  return Object.values(TENANT_REGISTRY);
}

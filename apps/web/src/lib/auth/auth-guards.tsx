"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { useAuth } from "./auth-context";
import type { RouteGuardConfig, SystemDomain, UserRole } from "./types";

const LOGIN_PATHS: Record<SystemDomain, string> = {
  superadmin: "/superadmin/login",
  school: "/school/login",
  portal: "/portal/login",
};

export function RouteGuard({
  config,
  fallbackPath,
  children,
}: {
  config: RouteGuardConfig;
  fallbackPath?: string;
  children: ReactNode;
}) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (!isAuthenticated || !user) {
      router.replace(fallbackPath ?? LOGIN_PATHS[config.domain]);
      return;
    }

    if (user.domain !== config.domain) {
      router.replace(LOGIN_PATHS[config.domain]);
      return;
    }

    if (
      config.requiredRoles &&
      config.requiredRoles.length > 0 &&
      !config.requiredRoles.includes(user.role)
    ) {
      router.replace(LOGIN_PATHS[config.domain]);
    }
  }, [config, fallbackPath, isAuthenticated, isLoading, router, user]);

  if (isLoading) {
    return <RouteGuardSkeleton />;
  }

  if (!isAuthenticated || !user || user.domain !== config.domain) {
    return <RouteGuardSkeleton />;
  }

  if (config.requiredRoles?.length && !config.requiredRoles.includes(user.role)) {
    return <RouteGuardSkeleton />;
  }

  return <>{children}</>;
}

function RouteGuardSkeleton() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="space-y-4 text-center">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-border border-t-accent" />
        <p className="text-sm text-muted">Verifying access...</p>
      </div>
    </div>
  );
}

export function SuperAdminGuard({ children }: { children: ReactNode }) {
  return (
    <RouteGuard
      config={{
        domain: "superadmin",
        requiredRoles: ["platform_owner", "support_agent", "finance_admin", "operations"],
        requireMfa: true,
      }}
    >
      {children}
    </RouteGuard>
  );
}

export function SchoolGuard({
  requiredRoles,
  children,
}: {
  requiredRoles?: UserRole[];
  children: ReactNode;
}) {
  return (
    <RouteGuard
      config={{
        domain: "school",
        requiredRoles,
        requireTenant: true,
      }}
    >
      {children}
    </RouteGuard>
  );
}

export function PortalGuard({ children }: { children: ReactNode }) {
  return (
    <RouteGuard
      config={{
        domain: "portal",
      }}
    >
      {children}
    </RouteGuard>
  );
}

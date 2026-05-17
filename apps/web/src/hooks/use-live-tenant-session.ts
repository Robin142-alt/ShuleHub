"use client";

import { useExperienceSession } from "@/lib/auth/use-experience-session";
import type { LiveAuthSession } from "@/lib/dashboard/api-client";
import { isDashboardApiConfigured } from "@/lib/dashboard/api-client";

export function useLiveTenantSession(tenantId: string) {
  const apiConfigured = isDashboardApiConfigured();
  const authSession = useExperienceSession("school", {
    tenantSlug: tenantId,
    autoLoad: apiConfigured,
  });

  const session: LiveAuthSession | null = authSession.session
    ? {
        tenantId: authSession.session.tenantSlug ?? tenantId,
        user: authSession.session.user,
      }
    : null;

  return {
    apiConfigured,
    session,
    user: authSession.user,
    isLoading: apiConfigured ? authSession.isLoading : false,
    isSubmitting: authSession.isSubmitting,
    error: authSession.error,
    login: async (email: string, password: string) => {
      await authSession.login({
        identifier: email,
        password,
        tenantSlug: tenantId,
      });
    },
    logout: authSession.logout,
    clearError: authSession.clearError,
  };
}

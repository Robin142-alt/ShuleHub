import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  parseExperienceSession,
  PORTAL_SESSION_COOKIE,
  SCHOOL_SESSION_COOKIE,
  SUPERADMIN_SESSION_COOKIE,
} from "@/lib/auth/experience-routing";
import { getDefaultSchoolBranding, getSchoolBrandingBySlug } from "@/lib/auth/school-branding";

function normalizeHeaderValue(value: string | null) {
  return value?.trim().toLowerCase() ?? null;
}

export async function readPlatformRequestContext() {
  const requestHeaders = await headers();
  const experience = normalizeHeaderValue(
    requestHeaders.get("x-platform-experience"),
  );

  if (experience !== "superadmin") {
    redirect("/login");
  }

  const cookieStore = await cookies();
  const session = parseExperienceSession(
    "superadmin",
    cookieStore.get(SUPERADMIN_SESSION_COOKIE)?.value,
  );

  if (!session || session.experience !== "superadmin") {
    redirect("/login");
  }

  return {
    session,
  };
}

export async function readSchoolRequestContext() {
  const requestHeaders = await headers();
  const experience = normalizeHeaderValue(
    requestHeaders.get("x-platform-experience"),
  );

  if (experience !== "school") {
    redirect("/login");
  }

  const cookieStore = await cookies();
  const session = parseExperienceSession(
    "school",
    cookieStore.get(SCHOOL_SESSION_COOKIE)?.value,
  );

  if (!session || session.experience !== "school") {
    redirect("/login");
  }

  const tenantSlug =
    normalizeHeaderValue(requestHeaders.get("x-tenant-slug")) ?? session.tenantSlug;
  const branding = {
    status: tenantSlug ? "resolved" as const : "default" as const,
    requestedSlug: tenantSlug,
    host: null,
    branding: getSchoolBrandingBySlug(tenantSlug) ?? getDefaultSchoolBranding(),
  };

  return {
    role: session.role,
    tenantSlug,
    branding,
    session,
  };
}

export async function readPortalRequestContext() {
  const requestHeaders = await headers();
  const experience = normalizeHeaderValue(
    requestHeaders.get("x-platform-experience"),
  );

  if (experience !== "portal") {
    redirect("/login");
  }

  const cookieStore = await cookies();
  const session = parseExperienceSession(
    "portal",
    cookieStore.get(PORTAL_SESSION_COOKIE)?.value,
  );

  if (!session || session.experience !== "portal") {
    redirect("/login");
  }

  return {
    viewer: session.viewer,
    session,
  };
}

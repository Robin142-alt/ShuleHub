import type {
  PortalViewer,
  SchoolExperienceRole,
} from "@/lib/experiences/types";
import {
  isPortalSection,
  isSchoolSection,
  isSuperadminSection,
  toPortalPath,
  toSchoolPath,
  toSchoolStudentPath,
  toSuperadminPath,
} from "@/lib/routing/experience-routes";

export type PlatformExperience = "superadmin" | "school" | "portal" | "public";

export type ExperienceSession =
  | {
      experience: "superadmin";
      homePath: string;
      userLabel: string;
    }
  | {
      experience: "school";
      homePath: string;
      role: SchoolExperienceRole;
      tenantSlug: string;
      userLabel: string;
    }
  | {
      experience: "portal";
      homePath: string;
      viewer: PortalViewer;
      userLabel: string;
    };

export const SUPERADMIN_SESSION_COOKIE = "shulehub.superadmin.session";
export const SCHOOL_SESSION_COOKIE = "shulehub.school.session";
export const PORTAL_SESSION_COOKIE = "shulehub.portal.session";

const reservedSubdomains = new Set(["www", "app", "localhost"]);
const sharedPublicPaths = new Set(["/login", "/forgot-password", "/reset-password"]);
const hostedPublicSuffixes = [".vercel.app", ".vercel.sh"] as const;

type ExperienceHeaders = Record<string, string>;

export type HostResolution = {
  experience: PlatformExperience;
  host: string | null;
  tenantSlug: string | null;
};

export type ExperienceRoutingDecision =
  | {
      action: "next";
      headers: ExperienceHeaders;
      rewrittenPath?: string;
    }
  | {
      action: "redirect";
      location: string;
      headers: ExperienceHeaders;
    };

function normalizeHost(host: string | null | undefined): string | null {
  if (!host) {
    return null;
  }

  const trimmed = host.trim().toLowerCase();

  if (trimmed.startsWith("[")) {
    const bracketEnd = trimmed.indexOf("]");

    if (bracketEnd !== -1) {
      return trimmed.slice(1, bracketEnd);
    }
  }

  const portSeparatorIndex = trimmed.lastIndexOf(":");

  if (portSeparatorIndex > -1 && trimmed.indexOf(":") === portSeparatorIndex) {
    return trimmed.slice(0, portSeparatorIndex);
  }

  return trimmed;
}

function extractSubdomain(host: string): string | null {
  const parts = host.split(".");

  if (parts.length <= 1) {
    return null;
  }

  return parts[0] ?? null;
}

function buildHeaders(resolution: HostResolution): ExperienceHeaders {
  const headers: ExperienceHeaders = {
    "x-platform-experience": resolution.experience,
  };

  if (resolution.tenantSlug) {
    headers["x-tenant-slug"] = resolution.tenantSlug;
  }

  return headers;
}

function isIpAddressHost(host: string) {
  const ipv4Pattern =
    /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
  const ipv6Pattern = /^[0-9a-f:]+$/i;

  return ipv4Pattern.test(host) || (host.includes(":") && ipv6Pattern.test(host));
}

function isHostedPublicDomain(host: string) {
  return hostedPublicSuffixes.some((suffix) => host.endsWith(suffix));
}

function getSessionCookieName(experience: Exclude<PlatformExperience, "public">) {
  switch (experience) {
    case "superadmin":
      return SUPERADMIN_SESSION_COOKIE;
    case "school":
      return SCHOOL_SESSION_COOKIE;
    case "portal":
      return PORTAL_SESSION_COOKIE;
  }
}

function getLoginPath() {
  return "/login";
}

function getHomePath(
  session: ExperienceSession | null,
) {
  return session?.homePath ?? getLoginPath();
}

function isStorekeeperInventoryPath(pathname: string) {
  return pathname === "/inventory" || pathname.startsWith("/inventory/");
}

function isLibrarianLibraryPath(pathname: string) {
  return pathname === "/library" || pathname.startsWith("/library/");
}

function getInternalPrefix(experience: Exclude<PlatformExperience, "public">) {
  switch (experience) {
    case "superadmin":
      return "/internal/superadmin";
    case "school":
      return "/internal/school";
    case "portal":
      return "/internal/portal";
  }
}

function isExpectedInternalPath(
  experience: Exclude<PlatformExperience, "public">,
  pathname: string,
) {
  const prefix = getInternalPrefix(experience);
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function mapPublicPathToInternal(
  experience: Exclude<PlatformExperience, "public">,
  pathname: string,
) {
  const prefix = getInternalPrefix(experience);
  return `${prefix}${pathname === "/" ? "/login" : pathname}`;
}

function mapProtectedPathToInternal(
  experience: Exclude<PlatformExperience, "public">,
  pathname: string,
) {
  const prefix = getInternalPrefix(experience);

  if (experience === "superadmin") {
    if (pathname === "/dashboard") {
      return `${prefix}/dashboard`;
    }

    if (pathname === "/schools") {
      return `${prefix}/schools`;
    }

    if (
      pathname === "/users" ||
      (pathname.startsWith("/") && isSuperadminSection(pathname.slice(1)))
    ) {
      return `${prefix}${pathname}`;
    }

    return null;
  }

  if (experience === "school") {
    if (pathname === "/dashboard") {
      return `${prefix}/dashboard`;
    }

    const roleDashboardSection = pathname.match(/^\/(finance|academics)\/dashboard$/)?.[1];
    if (roleDashboardSection && isSchoolSection(roleDashboardSection)) {
      return `${prefix}/${roleDashboardSection}`;
    }

    if (pathname === "/students") {
      return `${prefix}/students`;
    }

    if (pathname.startsWith("/students/")) {
      return `${prefix}${pathname}`;
    }

    if (pathname.startsWith("/") && isSchoolSection(pathname.slice(1))) {
      return `${prefix}${pathname}`;
    }

    return null;
  }

  if (pathname === "/dashboard") {
    return `${prefix}/dashboard`;
  }

  if (pathname.startsWith("/") && isPortalSection(pathname.slice(1))) {
    return `${prefix}${pathname}`;
  }

  return null;
}

function resolveLegacyCompatibilityPath(
  experience: Exclude<PlatformExperience, "public">,
  pathname: string,
) {
  if (experience === "superadmin") {
    if (pathname === "/superadmin") {
      return toSuperadminPath("dashboard");
    }

    if (pathname.startsWith("/superadmin/")) {
      const section = pathname.slice("/superadmin/".length);

    if (section === "login" || section === "forgot-password" || section === "reset-password") {
        return `/${section}`;
      }

      if (section === "dashboard") {
        return toSuperadminPath("dashboard");
      }

      if (section === "tenants") {
        return toSuperadminPath("schools");
      }

      if (section === "users" || isSuperadminSection(section)) {
        return `/${section}`;
      }
    }

    return null;
  }

  if (experience === "school") {
    if (pathname === "/school/login" || pathname === "/school/forgot-password" || pathname === "/school/reset-password") {
      return pathname.replace("/school", "");
    }

    const schoolStudentMatch = pathname.match(/^\/school\/[^/]+\/students\/([^/]+)$/);
    if (schoolStudentMatch) {
      return toSchoolStudentPath(schoolStudentMatch[1]!);
    }

    const schoolSectionMatch = pathname.match(/^\/school\/[^/]+(?:\/([^/]+))?$/);
    if (schoolSectionMatch) {
      const section = schoolSectionMatch[1];
      return section && isSchoolSection(section) ? `/${section}` : toSchoolPath("dashboard");
    }

    const legacyDashboardStudentMatch =
      pathname.match(/^\/dashboard\/[^/]+\/students\/([^/]+)$/);
    if (legacyDashboardStudentMatch) {
      return toSchoolStudentPath(legacyDashboardStudentMatch[1]!);
    }

    const legacyDashboardSectionMatch =
      pathname.match(/^\/dashboard\/[^/]+(?:\/([^/]+))?$/);
    if (legacyDashboardSectionMatch) {
      const section = legacyDashboardSectionMatch[1];
      return section && isSchoolSection(section) ? `/${section}` : toSchoolPath("dashboard");
    }

    return null;
  }

  if (pathname === "/portal/login" || pathname === "/portal/forgot-password" || pathname === "/portal/reset-password") {
    return pathname.replace("/portal", "");
  }

  const portalSectionMatch = pathname.match(/^\/portal\/[^/]+(?:\/([^/]+))?$/);
  if (portalSectionMatch) {
    const section = portalSectionMatch[1];
    return section && isPortalSection(section) ? `/${section}` : toPortalPath("dashboard");
  }

  return null;
}

export function serializeExperienceSession(session: ExperienceSession) {
  return encodeURIComponent(JSON.stringify(session));
}

export function parseExperienceSession(
  experience: Exclude<PlatformExperience, "public">,
  cookieValue: string | null | undefined,
): ExperienceSession | null {
  if (!cookieValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      decodeURIComponent(cookieValue),
    ) as ExperienceSession;

    if (parsed.experience !== experience) {
      return null;
    }

    if (parsed.experience === "school" && !parsed.tenantSlug) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function writeExperienceSession(session: ExperienceSession) {
  if (typeof document === "undefined") {
    return;
  }

  const cookieName = getSessionCookieName(session.experience);
  const maxAge = 60 * 60 * 12;
  document.cookie =
    `${cookieName}=${serializeExperienceSession(session)}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
}

export function clearExperienceSession(
  experience: Exclude<PlatformExperience, "public">,
) {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie =
    `${getSessionCookieName(experience)}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export function resolveExperienceHost(
  hostHeader: string | null | undefined,
): HostResolution {
  const host = normalizeHost(hostHeader);

  if (!host) {
    return {
      experience: "public",
      host: null,
      tenantSlug: null,
    };
  }

  if (host === "localhost" || isIpAddressHost(host)) {
    return {
      experience: "public",
      host,
      tenantSlug: null,
    };
  }

  if (isHostedPublicDomain(host)) {
    return {
      experience: "public",
      host,
      tenantSlug: null,
    };
  }

  const subdomain = extractSubdomain(host);

  if (!subdomain) {
    return {
      experience: "public",
      host,
      tenantSlug: null,
    };
  }

  if (subdomain === "superadmin") {
    return {
      experience: "superadmin",
      host,
      tenantSlug: null,
    };
  }

  if (subdomain === "portal") {
    return {
      experience: "portal",
      host,
      tenantSlug: null,
    };
  }

  if (reservedSubdomains.has(subdomain)) {
    return {
      experience: "public",
      host,
      tenantSlug: null,
    };
  }

  return {
    experience: "school",
    host,
    tenantSlug: subdomain,
  };
}

export function evaluateExperienceRouting(input: {
  host: string | null | undefined;
  pathname: string;
  cookies: Record<string, string | undefined>;
}): ExperienceRoutingDecision {
  const resolution = resolveExperienceHost(input.host);
  const headers = buildHeaders(resolution);

  if (resolution.experience === "public") {
    return {
      action: "next",
      headers,
    };
  }

  const experience = resolution.experience;
  const cookieName = getSessionCookieName(experience);
  const session = parseExperienceSession(experience, input.cookies[cookieName] ?? null);

  if (
    experience === "school" &&
    session?.experience === "school" &&
    session.tenantSlug &&
    resolution.tenantSlug !== session.tenantSlug
  ) {
    return {
      action: "redirect",
      location: getLoginPath(),
      headers,
    };
  }

  if (input.pathname === "/") {
    return {
      action: "redirect",
      location: getHomePath(session),
      headers,
    };
  }

  if (experience === "school" && isStorekeeperInventoryPath(input.pathname)) {
    if (!session) {
      return {
        action: "redirect",
        location: getLoginPath(),
        headers,
      };
    }

    if (session.experience !== "school" || session.role !== "storekeeper") {
      return {
        action: "redirect",
        location: "/forbidden",
        headers,
      };
    }

    return {
      action: "next",
      headers,
    };
  }

  if (experience === "school" && isLibrarianLibraryPath(input.pathname)) {
    if (!session) {
      return {
        action: "redirect",
        location: getLoginPath(),
        headers,
      };
    }

    if (session.experience !== "school" || session.role !== "librarian") {
      return {
        action: "redirect",
        location: "/forbidden",
        headers,
      };
    }

    return {
      action: "next",
      headers,
    };
  }

  const compatibilityPath = resolveLegacyCompatibilityPath(experience, input.pathname);
  if (compatibilityPath) {
    if (session && sharedPublicPaths.has(compatibilityPath)) {
      return {
        action: "redirect",
        location: session.homePath,
        headers,
      };
    }

    return {
      action: "redirect",
      location: compatibilityPath,
      headers,
    };
  }

  if (isExpectedInternalPath(experience, input.pathname)) {
    return {
      action: "next",
      headers,
    };
  }

  if (sharedPublicPaths.has(input.pathname)) {
    if (session) {
      return {
        action: "redirect",
        location: session.homePath,
        headers,
      };
    }

    return {
      action: "next",
      headers,
      rewrittenPath: mapPublicPathToInternal(experience, input.pathname),
    };
  }

  const protectedRewrite = mapProtectedPathToInternal(experience, input.pathname);

  if (!protectedRewrite) {
    return {
      action: "redirect",
      location: getHomePath(session),
      headers,
    };
  }

  if (!session) {
    return {
      action: "redirect",
      location: getLoginPath(),
      headers,
    };
  }

  return {
    action: "next",
    headers,
    rewrittenPath: protectedRewrite,
  };
}

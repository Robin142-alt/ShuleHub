import { resolveExperienceHost } from "./experience-routing";

export interface SchoolBranding {
  slug: string;
  name: string;
  shortName: string;
  county: string;
  supportEmail: string;
  supportPhone: string;
  heroMessage: string;
  logoMark: string;
}

export interface SchoolBrandingResolution {
  status: "resolved" | "default" | "unknown";
  requestedSlug: string | null;
  host: string | null;
  branding: SchoolBranding;
}

const defaultBranding: SchoolBranding = {
  slug: "school-workspace",
  name: "School workspace",
  shortName: "Workspace",
  county: "Secure tenant access",
  supportEmail: "support@shulehub.co.ke",
  supportPhone: "Use your invitation channel",
  heroMessage: "Use the secure workspace code from your ShuleHub invitation to access your school operations.",
  logoMark: "SH",
};

const schoolBrandingMap: Record<string, SchoolBranding> = {};

export function getDefaultSchoolBranding() {
  return defaultBranding;
}

export function getSchoolBrandingBySlug(slug: string | null | undefined) {
  if (!slug) {
    return defaultBranding;
  }

  const normalizedSlug = slug.trim().toLowerCase();
  return schoolBrandingMap[normalizedSlug] ?? {
    ...defaultBranding,
    slug: normalizedSlug,
    name: "School workspace",
    shortName: "Workspace",
    logoMark: normalizedSlug.slice(0, 2).toUpperCase(),
  };
}

function normalizeSchoolIdentifier(identifier: string | null | undefined) {
  if (!identifier) {
    return null;
  }

  const trimmed = identifier.trim().toLowerCase();
  const withoutProtocol = trimmed.replace(/^https?:\/\//, "");
  const firstSegment = withoutProtocol.split("/")[0] ?? withoutProtocol;
  const hostLike = firstSegment.split(":")[0] ?? firstSegment;
  const hostParts = hostLike.split(".");

  if (hostParts.length > 1) {
    return hostParts[0] ?? null;
  }

  return hostLike.replace(/[^a-z0-9-]/g, "");
}

export function resolveSchoolBrandingIdentifier(
  identifier: string | null | undefined,
) {
  const normalizedIdentifier = normalizeSchoolIdentifier(identifier);

  if (!normalizedIdentifier) {
    return null;
  }

  return getSchoolBrandingBySlug(normalizedIdentifier);
}

function normalizeHost(host: string | null | undefined) {
  if (!host) {
    return null;
  }

  return host.split(":")[0].trim().toLowerCase();
}

export function resolveSchoolBranding(host: string | null | undefined) {
  const normalizedHost = normalizeHost(host);
  const resolution = resolveExperienceHost(normalizedHost);
  const requestedSlug =
    resolution.experience === "school" ? resolution.tenantSlug : null;

  if (!requestedSlug) {
    return {
      status: "default" as const,
      requestedSlug: null,
      host: normalizedHost,
      branding: defaultBranding,
    } satisfies SchoolBrandingResolution;
  }

  const resolvedBranding = getSchoolBrandingBySlug(requestedSlug);

  return {
    status: "resolved" as const,
    requestedSlug,
    host: normalizedHost,
    branding: resolvedBranding,
  } satisfies SchoolBrandingResolution;
}

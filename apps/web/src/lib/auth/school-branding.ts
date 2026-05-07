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
  slug: "amani-prep",
  name: "Amani Preparatory",
  shortName: "Amani Prep",
  county: "Nairobi County",
  supportEmail: "support@amaniprep.ac.ke",
  supportPhone: "+254 712 345 801",
  heroMessage: "Keep admissions, collections, academics, and attendance moving with one trusted school workspace.",
  logoMark: "AP",
};

const schoolBrandingMap: Record<string, SchoolBranding> = {
  "amani-prep": defaultBranding,
  amanischool: defaultBranding,
  "baraka-academy": {
    slug: "baraka-academy",
    name: "Baraka Academy",
    shortName: "Baraka",
    county: "Kiambu County",
    supportEmail: "help@barakaacademy.sch.ke",
    supportPhone: "+254 723 456 811",
    heroMessage: "A familiar, secure workspace for bursars, principals, teachers, and school office teams.",
    logoMark: "BA",
  },
  barakaacademy: {
    slug: "baraka-academy",
    name: "Baraka Academy",
    shortName: "Baraka",
    county: "Kiambu County",
    supportEmail: "help@barakaacademy.sch.ke",
    supportPhone: "+254 723 456 811",
    heroMessage: "A familiar, secure workspace for bursars, principals, teachers, and school office teams.",
    logoMark: "BA",
  },
  "mwangaza-junior": {
    slug: "mwangaza-junior",
    name: "Mwangaza Junior School",
    shortName: "Mwangaza",
    county: "Kisumu County",
    supportEmail: "support@mwangazajunior.sch.ke",
    supportPhone: "+254 734 567 822",
    heroMessage: "School operations feel simple when collections, roll call, and reports all live in one calm workflow.",
    logoMark: "MJ",
  },
  mwangaza: {
    slug: "mwangaza-junior",
    name: "Mwangaza Junior School",
    shortName: "Mwangaza",
    county: "Kisumu County",
    supportEmail: "support@mwangazajunior.sch.ke",
    supportPhone: "+254 734 567 822",
    heroMessage: "School operations feel simple when collections, roll call, and reports all live in one calm workflow.",
    logoMark: "MJ",
  },
};

export function getDefaultSchoolBranding() {
  return defaultBranding;
}

export function getSchoolBrandingBySlug(slug: string | null | undefined) {
  if (!slug) {
    return defaultBranding;
  }

  return schoolBrandingMap[slug.trim().toLowerCase()] ?? null;
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

  if (!resolvedBranding) {
    return {
      status: "unknown" as const,
      requestedSlug,
      host: normalizedHost,
      branding: {
        ...defaultBranding,
        name: "School workspace not found",
        shortName: "Unknown school",
        heroMessage: "We could not match this school link to an active tenant. Confirm the school address or contact support.",
        logoMark: requestedSlug.slice(0, 2).toUpperCase(),
      },
    } satisfies SchoolBrandingResolution;
  }

  return {
    status: "resolved" as const,
    requestedSlug,
    host: normalizedHost,
    branding: resolvedBranding,
  } satisfies SchoolBrandingResolution;
}

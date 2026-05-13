import type { SchoolExperienceRole } from "@/lib/experiences/types";

type SchoolDemoCredential = {
  identifier: string;
  password: string;
  destination: string;
  role: SchoolExperienceRole;
  displayName?: string;
  tenantSlug?: string;
};

export const superadminDemoCredentials = {
  email: "owner@shulehub.com",
  password: "Platform#2026",
  verificationCode: "246810",
} as const;

export const schoolDemoCredentials = {
  principal: {
    identifier: "principal@amaniprep.ac.ke",
    password: "School#2026",
    destination: "/dashboard",
    role: "principal",
  },
  bursar: {
    identifier: "bursar@barakaacademy.sch.ke",
    password: "School#2026",
    destination: "/dashboard",
    role: "bursar",
  },
  teacher: {
    identifier: "teacher@mwangazajunior.sch.ke",
    password: "School#2026",
    destination: "/dashboard",
    role: "teacher",
  },
  storekeeper: {
    identifier: "storekeeper@amaniprep.ac.ke",
    password: "School#2026",
    destination: "/inventory/dashboard",
    role: "storekeeper",
  },
  librarian: {
    identifier: "librarian@amaniprep.ac.ke",
    password: "School#2026",
    destination: "/library/dashboard",
    role: "librarian",
  },
  admissions: {
    identifier: "admissions@barakaacademy.sch.ke",
    password: "School#2026",
    destination: "/dashboard",
    role: "admissions",
  },
  admin: {
    identifier: "+254712345678",
    password: "School#2026",
    destination: "/dashboard",
    role: "admin",
  },
} as const satisfies Record<string, SchoolDemoCredential>;

export const seededSchoolDemoPassword = "Demo@12345";

export const portalDemoCredentials = {
  parent: {
    identifier: "0712345678",
    password: "Portal#2026",
    destination: "/dashboard",
    viewer: "parent",
  },
  student: {
    identifier: "SH-24011",
    password: "Portal#2026",
    destination: "/dashboard",
    viewer: "student",
  },
} as const;

export function normalizeCredentialIdentifier(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function titleCase(value: string) {
  return value
    .split(/[-_.\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function parseSeededSchoolEmail(identifier: string) {
  const email = identifier.trim().toLowerCase();
  const match = email.match(/^([^@\s]+)@([a-z0-9-]+)\.demo\.shulehub\.ke$/);

  if (!match) {
    return null;
  }

  const localPart = match[1]!;
  const tenantSlug = match[2]!;
  const tenantLabel = titleCase(tenantSlug);
  const seededRoleMap: Record<string, { role: SchoolExperienceRole; label: string }> = {
    owner: { role: "principal", label: "Owner" },
    admin: { role: "admin", label: "Operations Admin" },
    bursar: { role: "bursar", label: "Bursar" },
    storekeeper: { role: "storekeeper", label: "Storekeeper" },
    librarian: { role: "librarian", label: "Librarian" },
    admissions: { role: "admissions", label: "Admissions Officer" },
  };
  const directRole = seededRoleMap[localPart];

  if (directRole) {
    return {
      email,
      role: directRole.role,
      tenantSlug,
      displayName: `${directRole.label} ${tenantLabel}`,
    };
  }

  const teacherMatch = localPart.match(/^(.+)\.teacher\.\d+$/);

  if (!teacherMatch) {
    return null;
  }

  return {
    email,
    role: "teacher" as const,
    tenantSlug,
    displayName: titleCase(teacherMatch[1]!),
  };
}

export function resolveSchoolDemoCredential(
  identifier: string,
  password: string,
): SchoolDemoCredential | undefined {
  const normalizedIdentifier = normalizeCredentialIdentifier(identifier);
  const normalizedPassword = password.trim();

  return Object.values(schoolDemoCredentials).find(
    (credential) =>
      normalizeCredentialIdentifier(credential.identifier) === normalizedIdentifier &&
      credential.password === normalizedPassword,
  );
}

export function resolveSeededSchoolDemoCredential(
  identifier: string,
  password: string,
  tenantSlug?: string | null,
): SchoolDemoCredential | undefined {
  if (password.trim() !== seededSchoolDemoPassword) {
    return undefined;
  }

  const seededAccount = parseSeededSchoolEmail(identifier);

  if (!seededAccount) {
    return undefined;
  }

  const requestedTenantSlug = tenantSlug?.trim().toLowerCase() || null;

  if (requestedTenantSlug && requestedTenantSlug !== seededAccount.tenantSlug) {
    return undefined;
  }

  return {
    identifier: seededAccount.email,
    password: seededSchoolDemoPassword,
    destination: "/dashboard",
    role: seededAccount.role,
    displayName: seededAccount.displayName,
    tenantSlug: seededAccount.tenantSlug,
  };
}

export function resolvePortalDemoCredential(identifier: string, password: string) {
  const normalizedIdentifier = normalizeCredentialIdentifier(identifier);
  const normalizedPassword = password.trim();

  return Object.values(portalDemoCredentials).find(
    (credential) =>
      normalizeCredentialIdentifier(credential.identifier) === normalizedIdentifier &&
      credential.password === normalizedPassword,
  );
}

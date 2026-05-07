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
  admin: {
    identifier: "+254712345678",
    password: "School#2026",
    destination: "/dashboard",
    role: "admin",
  },
} as const;

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

export function resolveSchoolDemoCredential(identifier: string, password: string) {
  const normalizedIdentifier = normalizeCredentialIdentifier(identifier);
  const normalizedPassword = password.trim();

  return Object.values(schoolDemoCredentials).find(
    (credential) =>
      normalizeCredentialIdentifier(credential.identifier) === normalizedIdentifier &&
      credential.password === normalizedPassword,
  );
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

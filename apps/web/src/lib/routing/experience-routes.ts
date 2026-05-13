export const SUPERADMIN_SECTIONS = [
  "dashboard",
  "schools",
  "revenue",
  "subscriptions",
  "mpesa-monitoring",
  "support",
  "support-open",
  "support-in-progress",
  "support-escalated",
  "support-resolved",
  "support-sla",
  "support-analytics",
  "audit-logs",
  "infrastructure",
  "notifications",
  "settings",
  "users",
] as const;

export const SCHOOL_SECTIONS = [
  "dashboard",
  "students",
  "admissions",
  "finance",
  "mpesa",
  "attendance",
  "academics",
  "exams",
  "inventory",
  "staff",
  "reports",
  "communication",
  "settings",
  "timetable",
  "support-new-ticket",
  "support-my-tickets",
  "support-knowledge-base",
  "support-system-status",
] as const;

export const PORTAL_SECTIONS = [
  "dashboard",
  "fees",
  "academics",
  "attendance",
  "messages",
  "downloads",
  "notifications",
] as const;

export type SuperadminSection = (typeof SUPERADMIN_SECTIONS)[number];
export type SchoolSection = (typeof SCHOOL_SECTIONS)[number];
export type PortalSection = (typeof PORTAL_SECTIONS)[number];

export function isSuperadminSection(
  value: string,
): value is Exclude<SuperadminSection, "dashboard"> {
  return SUPERADMIN_SECTIONS.includes(value as SuperadminSection) && value !== "dashboard";
}

export function isSchoolSection(value: string): value is SchoolSection {
  return SCHOOL_SECTIONS.includes(value as SchoolSection);
}

export function isPortalSection(value: string): value is PortalSection {
  return PORTAL_SECTIONS.includes(value as PortalSection);
}

export function toSuperadminPath(section: SuperadminSection = "dashboard") {
  return section === "dashboard" ? "/dashboard" : `/${section}`;
}

export function toSchoolPath(section: SchoolSection = "dashboard") {
  return section === "dashboard" ? "/dashboard" : `/${section}`;
}

export function toSchoolStudentPath(studentId: string) {
  return `/students/${studentId}`;
}

export function toPortalPath(section: PortalSection = "dashboard") {
  return section === "dashboard" ? "/dashboard" : `/${section}`;
}

import {
  BookOpenCheck,
  Boxes,
  CalendarDays,
  ClipboardList,
  CircleDollarSign,
  FileSpreadsheet,
  GraduationCap,
  LayoutGrid,
  MessageSquareText,
  Settings,
  SmartphoneCharging,
  Users,
  UserSquare2,
} from "lucide-react";

import { buildSchoolErpModel } from "@/lib/dashboard/erp-model";
import { buildDashboardSnapshot } from "@/lib/dashboard/empty-data";
import type { DashboardRole } from "@/lib/dashboard/types";
import { getDefaultSchoolBranding, getSchoolBrandingBySlug } from "@/lib/auth/school-branding";
import type {
  ExperienceMetric,
  ExperienceNavItem,
  ExperienceProfile,
  SchoolExperienceRole,
} from "@/lib/experiences/types";
import { filterProductionReadyNavItems } from "@/lib/features/module-readiness";
export type { SchoolExperienceRole } from "@/lib/experiences/types";
import { toSchoolPath } from "@/lib/routing/experience-routes";
import { supportSidebarItems } from "@/lib/support/support-data";

export interface SchoolSubscriptionReminder {
  id: string;
  channel: "admin" | "sms" | "email";
  title: string;
  detail: string;
  status: string;
  tone: "ok" | "warning" | "critical";
}

export interface SchoolSubscriptionStage {
  id: string;
  label: "ACTIVE" | "TRIAL" | "EXPIRING" | "GRACE_PERIOD" | "RESTRICTED" | "SUSPENDED";
  description: string;
}

export interface SchoolSubscriptionView {
  state: SchoolSubscriptionStage["label"];
  tone: "ok" | "warning" | "critical";
  accessMode: "full" | "read_only" | "billing_only";
  statusLabel: string;
  headline: string;
  detail: string;
  renewalDueLabel: string;
  exportAllowedLabel: string;
  primaryActionLabel: string;
  primaryActionHref: string;
  reminders: SchoolSubscriptionReminder[];
  stages: SchoolSubscriptionStage[];
}

const schoolNavMap: Record<SchoolExperienceRole, ExperienceNavItem[]> = {
  principal: [
    { id: "dashboard", label: "Dashboard", href: toSchoolPath("dashboard"), icon: LayoutGrid, group: "Overview" },
    { id: "students", label: "Students", href: toSchoolPath("students"), icon: Users, group: "Students" },
    { id: "academics", label: "Academics", href: toSchoolPath("academics"), icon: GraduationCap, group: "Academics" },
    { id: "exams", label: "Exams", href: toSchoolPath("exams"), icon: BookOpenCheck, group: "Academics" },
    { id: "timetable", label: "Timetable", href: toSchoolPath("timetable"), icon: CalendarDays, group: "Academics" },
    { id: "finance", label: "Fees / Payments", href: toSchoolPath("finance"), icon: CircleDollarSign, group: "Finance" },
    { id: "mpesa", label: "MPESA Transactions", href: toSchoolPath("mpesa"), icon: SmartphoneCharging, group: "Finance" },
    { id: "reports", label: "Reports", href: toSchoolPath("reports"), icon: FileSpreadsheet, group: "Operations" },
    { id: "communication", label: "Communication (SMS)", href: toSchoolPath("communication"), icon: MessageSquareText, group: "Operations" },
    ...supportSidebarItems,
    { id: "staff", label: "Staff", href: toSchoolPath("staff"), icon: UserSquare2, group: "Administration" },
    { id: "inventory", label: "Inventory", href: toSchoolPath("inventory"), icon: Boxes, group: "Administration" },
    { id: "settings", label: "Settings", href: toSchoolPath("settings"), icon: Settings, group: "Administration" },
  ],
  bursar: [
    { id: "dashboard", label: "Dashboard", href: toSchoolPath("dashboard"), icon: LayoutGrid, group: "Overview" },
    { id: "students", label: "Students", href: toSchoolPath("students"), icon: Users, group: "Students" },
    { id: "finance", label: "Fees / Payments", href: toSchoolPath("finance"), icon: CircleDollarSign, group: "Finance" },
    { id: "mpesa", label: "MPESA Transactions", href: toSchoolPath("mpesa"), icon: SmartphoneCharging, group: "Finance" },
    { id: "reports", label: "Reports", href: toSchoolPath("reports"), icon: FileSpreadsheet, group: "Operations" },
    { id: "communication", label: "Communication (SMS)", href: toSchoolPath("communication"), icon: MessageSquareText, group: "Operations" },
    ...supportSidebarItems,
    { id: "settings", label: "Settings", href: toSchoolPath("settings"), icon: Settings, group: "Administration" },
  ],
  teacher: [
    { id: "dashboard", label: "Dashboard", href: toSchoolPath("dashboard"), icon: LayoutGrid, group: "Overview" },
    { id: "students", label: "Students", href: toSchoolPath("students"), icon: Users, group: "Students" },
    { id: "academics", label: "Academics", href: toSchoolPath("academics"), icon: GraduationCap, group: "Academics" },
    { id: "exams", label: "Exams", href: toSchoolPath("exams"), icon: BookOpenCheck, group: "Academics" },
    { id: "reports", label: "Reports", href: toSchoolPath("reports"), icon: FileSpreadsheet, group: "Academics" },
    { id: "communication", label: "Communication (SMS)", href: toSchoolPath("communication"), icon: MessageSquareText, group: "Operations" },
    { id: "timetable", label: "Timetable", href: toSchoolPath("timetable"), icon: CalendarDays, group: "Operations" },
    ...supportSidebarItems,
  ],
  admin: [
    { id: "dashboard", label: "Dashboard", href: toSchoolPath("dashboard"), icon: LayoutGrid, group: "Overview" },
    { id: "students", label: "Students", href: toSchoolPath("students"), icon: Users, group: "Students" },
    { id: "finance", label: "Fees / Payments", href: toSchoolPath("finance"), icon: CircleDollarSign, group: "Finance" },
    { id: "mpesa", label: "MPESA Transactions", href: toSchoolPath("mpesa"), icon: SmartphoneCharging, group: "Finance" },
    { id: "reports", label: "Reports", href: toSchoolPath("reports"), icon: FileSpreadsheet, group: "Operations" },
    { id: "communication", label: "Communication (SMS)", href: toSchoolPath("communication"), icon: MessageSquareText, group: "Operations" },
    ...supportSidebarItems,
    { id: "staff", label: "Staff", href: toSchoolPath("staff"), icon: UserSquare2, group: "Administration" },
    { id: "inventory", label: "Inventory", href: toSchoolPath("inventory"), icon: Boxes, group: "Administration" },
    { id: "settings", label: "Settings", href: toSchoolPath("settings"), icon: Settings, group: "Administration" },
  ],
  storekeeper: [
    { id: "dashboard", label: "Dashboard", href: toSchoolPath("dashboard"), icon: LayoutGrid, group: "Overview" },
    { id: "inventory", label: "Inventory", href: toSchoolPath("inventory"), icon: Boxes, group: "Store operations" },
    { id: "reports", label: "Reports", href: toSchoolPath("reports"), icon: FileSpreadsheet, group: "Store operations" },
    { id: "communication", label: "Communication", href: toSchoolPath("communication"), icon: MessageSquareText, group: "Operations" },
    ...supportSidebarItems,
  ],
  admissions: [
    { id: "dashboard", label: "Dashboard", href: toSchoolPath("dashboard"), icon: LayoutGrid, group: "Overview" },
    { id: "admissions", label: "Admissions", href: toSchoolPath("admissions"), icon: ClipboardList, group: "Admissions" },
    { id: "students", label: "Students", href: toSchoolPath("students"), icon: Users, group: "Admissions" },
    { id: "reports", label: "Reports", href: toSchoolPath("reports"), icon: FileSpreadsheet, group: "Admissions" },
    { id: "communication", label: "Communication", href: toSchoolPath("communication"), icon: MessageSquareText, group: "Operations" },
    ...supportSidebarItems,
  ],
  librarian: [
    { id: "library", label: "Library", href: "/library", icon: BookOpenCheck, group: "Library" },
  ],
};

const roleToDashboardRole: Record<SchoolExperienceRole, DashboardRole> = {
  principal: "admin",
  bursar: "bursar",
  teacher: "teacher",
  admin: "admin",
  storekeeper: "storekeeper",
  librarian: "librarian",
  admissions: "admissions",
};

export const schoolSectionLabels: Record<string, string> = {
  dashboard: "Dashboard",
  students: "Students",
  finance: "Fees / Payments",
  mpesa: "MPESA Transactions",
  academics: "Academics",
  exams: "Exams",
  reports: "Reports",
  communication: "Communication",
  timetable: "Timetable",
  staff: "Staff",
  inventory: "Inventory",
  library: "Library",
  "support-new-ticket": "New Ticket",
  "support-my-tickets": "My Tickets",
  "support-knowledge-base": "Knowledge Base",
  "support-system-status": "System Status",
  settings: "Settings",
};

function buildSchoolProfile(role: SchoolExperienceRole, schoolName: string): ExperienceProfile {
  const profileMap: Record<SchoolExperienceRole, ExperienceProfile> = {
    principal: {
      name: "Principal workspace",
      roleLabel: "Principal",
      contextLabel: schoolName,
    },
    bursar: {
      name: "Bursar workspace",
      roleLabel: "Bursar",
      contextLabel: schoolName,
    },
    teacher: {
      name: "Teacher workspace",
      roleLabel: "Class teacher",
      contextLabel: schoolName,
    },
    admin: {
      name: "School admin workspace",
      roleLabel: "School admin",
      contextLabel: schoolName,
    },
    storekeeper: {
      name: "Storekeeper workspace",
      roleLabel: "Storekeeper",
      contextLabel: schoolName,
    },
    librarian: {
      name: "Library workspace",
      roleLabel: "Librarian",
      contextLabel: schoolName,
    },
    admissions: {
      name: "Admissions workspace",
      roleLabel: "Admissions officer",
      contextLabel: schoolName,
    },
  };

  return profileMap[role];
}

export function getSchoolWorkspace(role: SchoolExperienceRole, tenantSlug?: string | null) {
  const branding = getSchoolBrandingBySlug(tenantSlug) ?? getDefaultSchoolBranding();
  const dashboardRole = roleToDashboardRole[role];
  const snapshot = buildDashboardSnapshot(dashboardRole, branding.slug, true);
  const model = buildSchoolErpModel({
    role: dashboardRole,
    tenant: snapshot.tenant,
    online: true,
  });

  return {
    role,
    branding,
    dashboardRole,
    snapshot,
    model,
    subscription: buildSchoolSubscription(role),
    navItems: filterProductionReadyNavItems(schoolNavMap[role]),
    profile: buildSchoolProfile(role, branding.name),
  };
}

export function getSchoolKpiSummary(role: SchoolExperienceRole, tenantSlug?: string | null): ExperienceMetric[] {
  const { snapshot } = getSchoolWorkspace(role, tenantSlug);

  return snapshot.kpis.slice(0, 4).map((item) => ({
    id: item.id,
    label: item.label,
    value: item.value,
    helper: item.helper,
    trend: item.trendValue,
  }));
}

function buildSchoolSubscription(role: SchoolExperienceRole): SchoolSubscriptionView {
  const stages: SchoolSubscriptionStage[] = [
    {
      id: "active",
      label: "ACTIVE",
      description: "All school workflows remain fully available.",
    },
    {
      id: "trial",
      label: "TRIAL",
      description: "Trial schools get the full product until the trial end date.",
    },
    {
      id: "expiring",
      label: "EXPIRING",
      description: "Warning window before a renewal becomes urgent.",
    },
    {
      id: "grace",
      label: "GRACE_PERIOD",
      description: "Full access remains available while the school completes renewal.",
    },
    {
      id: "restricted",
      label: "RESTRICTED",
      description: "School records stay readable, but new writes are paused except billing and export.",
    },
    {
      id: "suspended",
      label: "SUSPENDED",
      description: "Billing, support, and export remain available so the school can recover safely.",
    },
  ];

  return {
    state: "ACTIVE",
    tone: "ok",
    accessMode: "full",
    statusLabel: "Subscription setup pending",
    headline: "Subscription details appear after onboarding",
    detail: "Billing status, renewal dates, and payment instructions are loaded from the live tenant subscription record.",
    renewalDueLabel: "Not configured",
    exportAllowedLabel: "Data export always remains available",
    primaryActionLabel: role === "teacher" ? "Open support" : role === "librarian" ? "Open catalog" : "Open finance",
    primaryActionHref: role === "teacher" ? toSchoolPath("support-my-tickets") : role === "librarian" ? "/library" : toSchoolPath("finance"),
    reminders: [],
    stages,
  };
}

import {
  BookOpenCheck,
  Boxes,
  CalendarDays,
  ClipboardCheck,
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
import { buildDashboardSnapshot } from "@/lib/dashboard/mock-data";
import type { DashboardRole } from "@/lib/dashboard/types";
import { getDefaultSchoolBranding, getSchoolBrandingBySlug } from "@/lib/auth/school-branding";
import type {
  ExperienceMetric,
  ExperienceNavItem,
  ExperienceProfile,
  SchoolExperienceRole,
} from "@/lib/experiences/types";
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
    { id: "attendance", label: "Attendance", href: toSchoolPath("attendance"), icon: ClipboardCheck, group: "Students" },
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
    { id: "attendance", label: "Attendance", href: toSchoolPath("attendance"), icon: ClipboardCheck, group: "Students" },
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
    { id: "attendance", label: "Attendance", href: toSchoolPath("attendance"), icon: ClipboardCheck, group: "Students" },
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
  librarian: [
    { id: "dashboard", label: "Dashboard", href: toSchoolPath("dashboard"), icon: LayoutGrid, group: "Overview" },
    { id: "library", label: "Library", href: "/library", icon: BookOpenCheck, group: "Library" },
    { id: "reports", label: "Reports", href: toSchoolPath("reports"), icon: FileSpreadsheet, group: "Library" },
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
};

const roleToDashboardRole: Record<SchoolExperienceRole, DashboardRole> = {
  principal: "admin",
  bursar: "bursar",
  teacher: "teacher",
  admin: "admin",
  storekeeper: "storekeeper",
  librarian: "storekeeper",
  admissions: "admissions",
};

export const schoolSectionLabels: Record<string, string> = {
  dashboard: "Dashboard",
  students: "Students",
  finance: "Fees / Payments",
  mpesa: "MPESA Transactions",
  attendance: "Attendance",
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
      name: "Grace Njeri",
      roleLabel: "Principal",
      contextLabel: schoolName,
    },
    bursar: {
      name: "Joseph Kamau",
      roleLabel: "Bursar",
      contextLabel: schoolName,
    },
    teacher: {
      name: "Beatrice Wanjiku",
      roleLabel: "Class teacher",
      contextLabel: schoolName,
    },
    admin: {
      name: "Daniel Ouma",
      roleLabel: "School admin",
      contextLabel: schoolName,
    },
    storekeeper: {
      name: "Mercy Wambui",
      roleLabel: "Storekeeper",
      contextLabel: schoolName,
    },
    librarian: {
      name: "Janet Auma",
      roleLabel: "Librarian",
      contextLabel: schoolName,
    },
    admissions: {
      name: "Naomi Achieng",
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
    navItems: schoolNavMap[role],
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

  const renewalAction =
    role === "teacher" || role === "storekeeper" || role === "librarian" || role === "admissions"
      ? {
          label: "Contact school admin",
          href: toSchoolPath("reports"),
        }
      : {
          label: "Renew with MPESA",
          href: toSchoolPath("finance"),
        };

  return {
    state: "EXPIRING",
    tone: "warning",
    accessMode: "full",
    statusLabel: "Renewal due in 5 days",
    headline: "Your school subscription is approaching renewal",
    detail:
      role === "teacher" || role === "storekeeper" || role === "librarian" || role === "admissions"
        ? "Your operational workspace stays available, but a school administrator should renew the workspace soon to avoid restricted mode."
        : "Billing reminders are active. Renew now to avoid entering grace period and later read-only restriction.",
    renewalDueLabel: "Renews on 09 May 2026",
    exportAllowedLabel: "Data export always remains available",
    primaryActionLabel: renewalAction.label,
    primaryActionHref: renewalAction.href,
    reminders: [
      {
        id: "sub-admin",
        channel: "admin",
        title: "Admin banner raised",
        detail: "Subscription warning is visible to school admins and bursars.",
        status: "Sent",
        tone: "ok",
      },
      {
        id: "sub-sms",
        channel: "sms",
        title: "SMS reminder queued",
        detail: "Billing phone will receive an MPESA renewal reminder this afternoon.",
        status: "Queued",
        tone: "warning",
      },
      {
        id: "sub-email",
        channel: "email",
        title: "Email reminder queued",
        detail: "Finance contacts will receive the renewal link and invoice summary.",
        status: "Queued",
        tone: "warning",
      },
    ],
    stages,
  };
}

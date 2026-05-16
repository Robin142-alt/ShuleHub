import {
  Activity,
  BellRing,
  Building2,
  CircleDollarSign,
  CreditCard,
  LifeBuoy,
  ServerCog,
  ShieldCheck,
  MessageSquareText,
  SmartphoneCharging,
  Users,
  Waypoints,
} from "lucide-react";

import { formatCurrency } from "@/lib/dashboard/format";
import type { StatusTone } from "@/lib/dashboard/types";
import type {
  ExperienceActivityItem,
  ExperienceChartPoint,
  ExperienceListItem,
  ExperienceMetric,
  ExperienceNavItem,
  ExperienceProfile,
} from "@/lib/experiences/types";
import { toSuperadminPath } from "@/lib/routing/experience-routes";
import { adminSupportSidebarItems } from "@/lib/support/support-data";

export type TenantControlRow = {
  id: string;
  schoolName: string;
  status: "Active" | "Suspended";
  statusTone: StatusTone;
  subscription: string;
  studentCount: string;
  lastActive: string;
  revenue: string;
};

export type SubscriptionRow = {
  id: string;
  tenant: string;
  plan: string;
  renewal: string;
  amount: string;
  status: string;
  statusTone: StatusTone;
};

export type MpesaMonitoringRow = {
  id: string;
  school: string;
  checkoutRequestId: string;
  callbackStatus: string;
  retries: string;
  duplicate: string;
  reconciliation: string;
  statusTone: StatusTone;
};

export type PlatformUserRow = {
  id: string;
  name: string;
  role: string;
  scope: string;
  tickets: string;
  lastActive: string;
};

export type AuditRow = {
  id: string;
  actor: string;
  action: string;
  target: string;
  time: string;
};

export const superadminNav: ExperienceNavItem[] = [
  { id: "overview", label: "Overview", href: toSuperadminPath("dashboard"), icon: Activity, group: "Control tower" },
  { id: "tenants", label: "Schools / Tenants", href: toSuperadminPath("schools"), icon: Building2, group: "Commercial" },
  { id: "revenue", label: "Revenue", href: toSuperadminPath("revenue"), icon: CircleDollarSign, group: "Commercial" },
  { id: "subscriptions", label: "Subscriptions", href: toSuperadminPath("subscriptions"), icon: CreditCard, group: "Commercial" },
  { id: "mpesa-monitoring", label: "MPESA Monitoring", href: toSuperadminPath("mpesa-monitoring"), icon: SmartphoneCharging, group: "Operations" },
  { id: "sms-settings", label: "SMS Settings", href: toSuperadminPath("sms-settings"), icon: MessageSquareText, group: "Operations" },
  { id: "users", label: "Users", href: toSuperadminPath("users"), icon: Users, group: "Operations" },
  ...adminSupportSidebarItems,
  { id: "audit-logs", label: "Audit Logs", href: toSuperadminPath("audit-logs"), icon: ShieldCheck, group: "Trust & security" },
  { id: "infrastructure", label: "Infrastructure", href: toSuperadminPath("infrastructure"), icon: ServerCog, group: "Trust & security" },
  { id: "notifications", label: "Notifications", href: toSuperadminPath("notifications"), icon: BellRing, group: "Trust & security" },
  { id: "settings", label: "Settings", href: toSuperadminPath("settings"), icon: Waypoints, group: "Platform" },
];

export const superadminProfile: ExperienceProfile = {
  name: "System Owner",
  roleLabel: "Platform owner",
  contextLabel: "ShuleHub SaaS",
};

export const superadminKpis: ExperienceMetric[] = [
  {
    id: "schools",
    label: "Total schools",
    value: "0",
    helper: "No schools have been onboarded after production cleanup",
    trend: "0",
  },
  {
    id: "active-schools",
    label: "Active schools",
    value: "0",
    helper: "The system owner creates real schools from this clean state",
    trend: "0",
  },
  {
    id: "mrr",
    label: "Monthly revenue",
    value: formatCurrency(0),
    helper: "Revenue appears only after real subscriptions are created",
    trend: "0%",
  },
  {
    id: "students",
    label: "Total students",
    value: "0",
    helper: "Student records are created by onboarded schools",
    trend: "0",
  },
];

export const revenuePoints: ExperienceChartPoint[] = [];
export const tenantGrowthPoints: ExperienceChartPoint[] = [];
export const systemAlerts: ExperienceListItem[] = [];
export const callbackFailures: ExperienceListItem[] = [];
export const supportActivity: ExperienceActivityItem[] = [];

export const superadminQuickActions = [
  {
    id: "create-school",
    label: "Create school",
    description: "Register a real tenant and invite the first school administrator.",
    href: toSuperadminPath("schools"),
    icon: Building2,
  },
  {
    id: "support-queue",
    label: "Open support",
    description: "Review live tickets after schools begin using support.",
    href: toSuperadminPath("support"),
    icon: LifeBuoy,
  },
  {
    id: "security-audit",
    label: "Review audit logs",
    description: "Monitor real authentication, invitation, and tenant actions.",
    href: toSuperadminPath("audit-logs"),
    icon: ShieldCheck,
  },
];

export const tenantRows: TenantControlRow[] = [];
export const subscriptionRows: SubscriptionRow[] = [];
export const mpesaMonitoringRows: MpesaMonitoringRow[] = [];
export const platformUsersRows: PlatformUserRow[] = [];
export const supportRows: never[] = [];
export const auditRows: AuditRow[] = [];

export const infrastructureMetrics: ExperienceMetric[] = [
  {
    id: "api-latency",
    label: "API latency",
    value: "N/A",
    helper: "Live telemetry appears after observability is connected",
    trend: "N/A",
  },
  {
    id: "queue-depth",
    label: "Queue depth",
    value: "N/A",
    helper: "Queue telemetry appears after workers report health",
    trend: "N/A",
  },
  {
    id: "redis-health",
    label: "Redis health",
    value: "N/A",
    helper: "Redis health is read from live infrastructure checks",
    trend: "N/A",
  },
  {
    id: "postgres-health",
    label: "PostgreSQL health",
    value: "N/A",
    helper: "Database health is read from live infrastructure checks",
    trend: "N/A",
  },
];

export const infrastructureEvents: ExperienceActivityItem[] = [];

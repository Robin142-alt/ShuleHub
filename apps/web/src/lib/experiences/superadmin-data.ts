import {
  Activity,
  BellRing,
  Building2,
  CircleDollarSign,
  CreditCard,
  LifeBuoy,
  ServerCog,
  ShieldCheck,
  SmartphoneCharging,
  Users,
  Waypoints,
} from "lucide-react";

import { formatCurrency, formatPercent } from "@/lib/dashboard/format";
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

export const superadminNav: ExperienceNavItem[] = [
  { id: "overview", label: "Overview", href: toSuperadminPath("dashboard"), icon: Activity, group: "Control tower" },
  { id: "tenants", label: "Schools / Tenants", href: toSuperadminPath("schools"), icon: Building2, group: "Commercial" },
  { id: "revenue", label: "Revenue", href: toSuperadminPath("revenue"), icon: CircleDollarSign, group: "Commercial" },
  { id: "subscriptions", label: "Subscriptions", href: toSuperadminPath("subscriptions"), icon: CreditCard, group: "Commercial" },
  { id: "mpesa-monitoring", label: "MPESA Monitoring", href: toSuperadminPath("mpesa-monitoring"), icon: SmartphoneCharging, badge: "3", group: "Operations" },
  { id: "users", label: "Users", href: toSuperadminPath("users"), icon: Users, group: "Operations" },
  ...adminSupportSidebarItems,
  { id: "audit-logs", label: "Audit Logs", href: toSuperadminPath("audit-logs"), icon: ShieldCheck, group: "Trust & security" },
  { id: "infrastructure", label: "Infrastructure", href: toSuperadminPath("infrastructure"), icon: ServerCog, group: "Trust & security" },
  { id: "notifications", label: "Notifications", href: toSuperadminPath("notifications"), icon: BellRing, badge: "6", group: "Trust & security" },
  { id: "settings", label: "Settings", href: toSuperadminPath("settings"), icon: Waypoints, group: "Platform" },
];

export const superadminProfile: ExperienceProfile = {
  name: "Robin Mwangi",
  roleLabel: "Platform owner",
  contextLabel: "ShuleHub SaaS",
};

export const superadminKpis: ExperienceMetric[] = [
  {
    id: "schools",
    label: "Total schools",
    value: "1,284",
    helper: "Across active, trial, and suspended tenants",
    trend: "+8.7%",
  },
  {
    id: "active-schools",
    label: "Active schools",
    value: "1,191",
    helper: "Schools with live users in the last 7 days",
    trend: "+5.4%",
  },
  {
    id: "mrr",
    label: "Monthly revenue",
    value: formatCurrency(18_420_000),
    helper: "Subscriptions, SMS bundles, and add-ons",
    trend: "+11.2%",
  },
  {
    id: "failed-payments",
    label: "Failed payments",
    value: "23",
    helper: "Needs review before the next billing cycle",
    trend: "-2.1%",
  },
  {
    id: "students",
    label: "Total students",
    value: "612,480",
    helper: "Learners across all active tenants",
    trend: "+6.3%",
  },
  {
    id: "sms",
    label: "SMS usage",
    value: "2.84M",
    helper: "Messages sent this billing month",
    trend: "+14.8%",
  },
];

export const revenuePoints: ExperienceChartPoint[] = [
  { label: "Jan", value: 12 },
  { label: "Feb", value: 13 },
  { label: "Mar", value: 14 },
  { label: "Apr", value: 16 },
  { label: "May", value: 17 },
  { label: "Jun", value: 18 },
];

export const tenantGrowthPoints: ExperienceChartPoint[] = [
  { label: "Jan", value: 880 },
  { label: "Feb", value: 934 },
  { label: "Mar", value: 1012 },
  { label: "Apr", value: 1104 },
  { label: "May", value: 1180 },
  { label: "Jun", value: 1284 },
];

export const systemAlerts: ExperienceListItem[] = [
  {
    id: "latency",
    title: "Queue lag above SLO",
    subtitle: "MPESA queue has 18 delayed jobs in the last 10 minutes.",
    value: "warning",
    tone: "warning",
  },
  {
    id: "callbacks",
    title: "Failed callback spike",
    subtitle: "Three schools saw callback retries after 08:14 EAT.",
    value: "critical",
    tone: "critical",
  },
  {
    id: "billing",
    title: "Grace period batch due",
    subtitle: "14 tenants will lock feature access at midnight.",
    value: "ok",
    tone: "ok",
  },
];

export const callbackFailures: ExperienceListItem[] = [
  {
    id: "cb-1",
    title: "st-marys-academy",
    subtitle: "CHK6XKP1F9 failed signature verification",
    value: "2 retries",
    tone: "warning",
  },
  {
    id: "cb-2",
    title: "kisumu-junior",
    subtitle: "Late callback reached worker after stale sweep window",
    value: "manual review",
    tone: "critical",
  },
  {
    id: "cb-3",
    title: "nairobi-prep",
    subtitle: "Duplicate callback reconciled safely",
    value: "resolved",
    tone: "ok",
  },
];

export const supportActivity: ExperienceActivityItem[] = [
  {
    id: "support-1",
    title: "Billing escalation from Amani Prep",
    detail: "Support reopened an invoice-matching case after a duplicate MPESA receipt alert.",
    timeLabel: "8 min",
    tone: "warning",
  },
  {
    id: "support-2",
    title: "Onboarding handoff completed",
    detail: "Operations activated three new schools and issued principal credentials.",
    timeLabel: "22 min",
    tone: "ok",
  },
  {
    id: "support-3",
    title: "Security alert acknowledged",
    detail: "Support confirmed a failed admin login storm was rate-limited automatically.",
    timeLabel: "41 min",
    tone: "critical",
  },
];

export const superadminQuickActions = [
  {
    id: "new-tenant",
    label: "Create tenant",
    description: "Set up a new school workspace",
    href: toSuperadminPath("schools"),
    icon: Building2,
  },
  {
    id: "review-mpesa",
    label: "Review callbacks",
    description: "Open unresolved payment events",
    href: toSuperadminPath("mpesa-monitoring"),
    icon: SmartphoneCharging,
  },
  {
    id: "open-support",
    label: "Support queue",
    description: "Triage tickets needing action",
    href: toSuperadminPath("support"),
    icon: LifeBuoy,
  },
  {
    id: "infra-health",
    label: "Infrastructure",
    description: "Check platform health and lag",
    href: toSuperadminPath("infrastructure"),
    icon: ServerCog,
  },
];

export const tenantRows = [
  {
    id: "tenant-1",
    schoolName: "Amani Prep School",
    status: "Active",
    statusTone: "ok" as const,
    subscription: "Growth Annual",
    studentCount: "1,284",
    lastActive: "2 min ago",
    revenue: formatCurrency(482_000),
  },
  {
    id: "tenant-2",
    schoolName: "Nairobi Junior Academy",
    status: "Grace",
    statusTone: "warning" as const,
    subscription: "Starter Monthly",
    studentCount: "642",
    lastActive: "11 min ago",
    revenue: formatCurrency(174_000),
  },
  {
    id: "tenant-3",
    schoolName: "Kisumu Hill Primary",
    status: "Suspended",
    statusTone: "critical" as const,
    subscription: "Growth Monthly",
    studentCount: "518",
    lastActive: "2 days ago",
    revenue: formatCurrency(0),
  },
  {
    id: "tenant-4",
    schoolName: "Mombasa CBC Centre",
    status: "Active",
    statusTone: "ok" as const,
    subscription: "Scale Annual",
    studentCount: "2,104",
    lastActive: "1 min ago",
    revenue: formatCurrency(830_000),
  },
];

export const subscriptionRows = [
  {
    id: "sub-1",
    tenant: "Amani Prep School",
    plan: "Growth Annual",
    renewal: "2026-06-30",
    amount: formatCurrency(482_000),
    status: "paid",
    statusTone: "ok" as const,
  },
  {
    id: "sub-2",
    tenant: "Nairobi Junior Academy",
    plan: "Starter Monthly",
    renewal: "2026-05-03",
    amount: formatCurrency(174_000),
    status: "grace",
    statusTone: "warning" as const,
  },
  {
    id: "sub-3",
    tenant: "Kisumu Hill Primary",
    plan: "Growth Monthly",
    renewal: "2026-04-25",
    amount: formatCurrency(211_000),
    status: "failed",
    statusTone: "critical" as const,
  },
];

export const mpesaMonitoringRows = [
  {
    id: "mpesa-1",
    school: "Amani Prep School",
    checkoutRequestId: "ws_CO_29042026_001",
    callbackStatus: "received",
    retries: "0",
    duplicate: "none",
    reconciliation: "matched",
    statusTone: "ok" as const,
  },
  {
    id: "mpesa-2",
    school: "Nairobi Junior Academy",
    checkoutRequestId: "ws_CO_29042026_014",
    callbackStatus: "retrying",
    retries: "3",
    duplicate: "possible",
    reconciliation: "pending",
    statusTone: "warning" as const,
  },
  {
    id: "mpesa-3",
    school: "Kisumu Hill Primary",
    checkoutRequestId: "ws_CO_29042026_031",
    callbackStatus: "failed",
    retries: "5",
    duplicate: "confirmed",
    reconciliation: "failed",
    statusTone: "critical" as const,
  },
];

export const platformUsersRows = [
  {
    id: "user-1",
    name: "Mercy Otieno",
    role: "Support lead",
    lastActive: "5 min ago",
    tickets: "8 open",
    scope: "Support",
  },
  {
    id: "user-2",
    name: "Kelvin Maina",
    role: "Operations admin",
    lastActive: "18 min ago",
    tickets: "3 escalations",
    scope: "Onboarding",
  },
  {
    id: "user-3",
    name: "Robin Mwangi",
    role: "Platform owner",
    lastActive: "now",
    tickets: "2 approvals",
    scope: "Global",
  },
];

export const supportRows = [
  {
    id: "ticket-1",
    tenant: "Nairobi Junior Academy",
    issue: "Billing mismatch after duplicate callback",
    priority: "critical" as const,
    owner: "Mercy Otieno",
    updatedAt: "8 min ago",
  },
  {
    id: "ticket-2",
    tenant: "Amani Prep School",
    issue: "Need principal access reset",
    priority: "warning" as const,
    owner: "Kelvin Maina",
    updatedAt: "21 min ago",
  },
  {
    id: "ticket-3",
    tenant: "Mombasa CBC Centre",
    issue: "Requesting timetable import help",
    priority: "ok" as const,
    owner: "Mercy Otieno",
    updatedAt: "53 min ago",
  },
];

export const auditRows = [
  {
    id: "audit-1",
    actor: "system",
    action: "Recovered stale MPESA intent safely",
    target: "tenant:nairobi-junior",
    time: "09:08 EAT",
  },
  {
    id: "audit-2",
    actor: "robin.mwangi",
    action: "Suspended tenant billing access",
    target: "tenant:kisumu-hill",
    time: "08:44 EAT",
  },
  {
    id: "audit-3",
    actor: "support.mercy",
    action: "Reset principal password",
    target: "tenant:amani-prep",
    time: "08:22 EAT",
  },
];

export const infrastructureMetrics: ExperienceMetric[] = [
  {
    id: "api-latency",
    label: "API latency",
    value: "182ms",
    helper: "p95 across authenticated dashboard traffic",
    trend: "-12ms",
  },
  {
    id: "queue-depth",
    label: "Queue depth",
    value: "143",
    helper: "BullMQ jobs across events and payments",
    trend: "+18",
  },
  {
    id: "redis-health",
    label: "Redis health",
    value: "99.98%",
    helper: "Availability across the last 30 days",
    trend: formatPercent(99.98),
  },
  {
    id: "postgres-health",
    label: "PostgreSQL health",
    value: "healthy",
    helper: "No replica lag or restore drift detected",
    trend: "0 incidents",
  },
  {
    id: "error-rate",
    label: "Error rate",
    value: "0.18%",
    helper: "API and worker combined application errors",
    trend: "-0.04%",
  },
  {
    id: "throughput",
    label: "Worker throughput",
    value: "2,940/min",
    helper: "Jobs completed without manual intervention",
    trend: "+6.1%",
  },
];

export const infrastructureEvents: ExperienceActivityItem[] = [
  {
    id: "infra-1",
    title: "Queue worker recovered after retry storm",
    detail: "Automatic retries drained the stuck payments queue with no financial duplication.",
    timeLabel: "12 min",
    tone: "ok",
  },
  {
    id: "infra-2",
    title: "Redis connection spike detected",
    detail: "Connection pool stabilized after burst traffic from term opening messages.",
    timeLabel: "34 min",
    tone: "warning",
  },
  {
    id: "infra-3",
    title: "Readiness check degraded briefly",
    detail: "PostgreSQL connection retries exceeded threshold for 43 seconds.",
    timeLabel: "1 hr",
    tone: "critical",
  },
];

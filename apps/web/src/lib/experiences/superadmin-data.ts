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
  ObservabilityAlert,
  ObservabilityHealthResponse,
  ReadinessResponse,
} from "@/lib/dashboard/api-client";
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
    value: "Awaiting live data",
    helper: "Connect production health telemetry to show current API latency",
    trend: "Not connected",
  },
  {
    id: "queue-depth",
    label: "Queue depth",
    value: "Awaiting live data",
    helper: "Connect worker telemetry to show queue pressure",
    trend: "Not connected",
  },
  {
    id: "redis-health",
    label: "Redis health",
    value: "Awaiting live data",
    helper: "Redis health is read from live infrastructure checks",
    trend: "Not connected",
  },
  {
    id: "postgres-health",
    label: "PostgreSQL health",
    value: "Awaiting live data",
    helper: "Database health is read from live infrastructure checks",
    trend: "Not connected",
  },
];

export const infrastructureEvents: ExperienceActivityItem[] = [];

export function mapReadinessToInfrastructureMetrics(
  readiness: ReadinessResponse,
  observability?: ObservabilityHealthResponse | null,
): ExperienceMetric[] {
  const deploymentVersion =
    process.env.NEXT_PUBLIC_APP_VERSION?.trim()
    || process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7)
    || "Not published";
  const databasePool = readiness.database_pool;
  const supportNotifications = readiness.support_notifications;
  const waitingRequests = databasePool?.waiting_requests ?? 0;

  return [
    {
      id: "api-readiness",
      label: "API readiness",
      value: formatDependencyStatus(readiness.status),
      helper: buildReadinessHelper(readiness.status, "API readiness gate is healthy.", "At least one dependency needs operator attention."),
      trend: toneLabel(toneForStatus(readiness.status)),
    },
    {
      id: "postgres-readiness",
      label: "PostgreSQL",
      value: formatDependencyStatus(readiness.services.postgres),
      helper: databasePool
        ? `${databasePool.active_connections ?? 0} active, ${databasePool.idle_connections ?? 0} idle, ${waitingRequests} waiting.`
        : "Database pool telemetry is not available from readiness.",
      trend: toneLabel(toneForStatus(readiness.services.postgres)),
    },
    {
      id: "redis-readiness",
      label: "Redis",
      value: formatDependencyStatus(readiness.services.redis),
      helper: "Session, queue, and replay-protection readiness from the live API.",
      trend: toneLabel(toneForStatus(readiness.services.redis)),
    },
    {
      id: "email-readiness",
      label: "Email",
      value: formatDependencyStatus(readiness.email?.status ?? readiness.services.transactional_email ?? "unknown"),
      helper: readiness.email?.provider
        ? `${readiness.email.provider} transactional email configuration is reported without exposing secrets.`
        : "Transactional email configuration has not been reported by readiness.",
      trend: toneLabel(toneForStatus(readiness.email?.status ?? readiness.services.transactional_email)),
    },
    {
      id: "sms-readiness",
      label: "SMS support",
      value: formatDependencyStatus(supportNotifications?.sms?.status ?? readiness.services.support_notifications ?? "unknown"),
      helper: supportNotifications
        ? `${supportNotifications.sms?.recipient_count ?? 0} support SMS recipients; dispatch provider ${formatDependencyStatus(supportNotifications.sms?.dispatch_provider_status ?? "unknown").toLowerCase()}.`
        : "Support notification readiness is not available from the live API.",
      trend: toneLabel(toneForStatus(supportNotifications?.sms?.status ?? readiness.services.support_notifications)),
    },
    {
      id: "object-storage-readiness",
      label: "Object storage",
      value: formatDependencyStatus(readiness.object_storage?.status ?? readiness.services.object_storage ?? "unknown"),
      helper: buildMissingHelper(
        readiness.object_storage?.missing,
        readiness.object_storage?.provider
          ? `${readiness.object_storage.provider} upload storage is configured without exposing keys.`
          : "External upload storage status is read from readiness.",
      ),
      trend: toneLabel(toneForStatus(readiness.object_storage?.status ?? readiness.services.object_storage)),
    },
    {
      id: "malware-scanning-readiness",
      label: "Malware scanning",
      value: formatDependencyStatus(readiness.malware_scanning?.status ?? readiness.services.malware_scanning ?? "unknown"),
      helper: buildMissingHelper(
        readiness.malware_scanning?.missing,
        readiness.malware_scanning?.required
          ? "Upload scanning is required for production file workflows."
          : "Upload scanning is optional in the current environment.",
      ),
      trend: toneLabel(toneForStatus(readiness.malware_scanning?.status ?? readiness.services.malware_scanning)),
    },
    {
      id: "observability-readiness",
      label: "Observability",
      value: formatDependencyStatus(observability?.overall_status ?? readiness.slo?.overall_status ?? "unknown"),
      helper: `${observability?.active_alert_count ?? readiness.slo?.active_alert_count ?? 0} active SLO alerts across production subsystems.`,
      trend: toneLabel(toneForStatus(observability?.overall_status ?? readiness.slo?.overall_status)),
    },
    {
      id: "deployment-version",
      label: "Deployment",
      value: deploymentVersion,
      helper: "Current frontend deployment version available to the platform owner.",
      trend: "Live",
    },
  ];
}

export function mapObservabilityAlertsToInfrastructureEvents(
  alerts: ObservabilityAlert[],
  readiness?: ReadinessResponse | null,
): ExperienceActivityItem[] {
  if (alerts.length > 0) {
    return alerts.map((alert) => ({
      id: alert.id,
      title: alert.title,
      detail: `${alert.subsystem.toUpperCase()}: ${alert.message}`,
      timeLabel: formatAlertTime(alert.triggered_at),
      tone: alert.severity === "critical" ? "critical" : "warning",
    }));
  }

  if (readiness?.status === "degraded") {
    return [
      {
        id: "readiness-degraded",
        title: "Readiness degraded without an active SLO alert",
        detail: "Review health dependencies and provider configuration before promoting a release.",
        timeLabel: "Review",
        tone: "warning",
      },
    ];
  }

  return [
    {
      id: "no-active-alerts",
      title: "No active infrastructure alerts",
      detail: "Live observability did not return active production alerts for the platform.",
      timeLabel: "Healthy",
      tone: "ok",
    },
  ];
}

function buildMissingHelper(missing: string[] | undefined, fallback: string) {
  return missing && missing.length > 0
    ? `Configuration required: ${missing.join(", ")}.`
    : fallback;
}

function buildReadinessHelper(status: string, ok: string, degraded: string) {
  return toneForStatus(status) === "ok" ? ok : degraded;
}

function formatDependencyStatus(status: string | null | undefined) {
  const normalized = status?.trim();

  if (!normalized) {
    return "Unknown";
  }

  return normalized
    .split(/[_-]+/)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function toneForStatus(status: string | null | undefined): StatusTone {
  const normalized = status?.toLowerCase() ?? "unknown";

  if (
    normalized === "ok"
    || normalized === "healthy"
    || normalized === "configured"
    || normalized === "up"
    || normalized === "ready"
  ) {
    return "ok";
  }

  if (
    normalized === "critical"
    || normalized === "down"
    || normalized === "invalid"
    || normalized === "failed"
    || normalized === "major_outage"
  ) {
    return "critical";
  }

  return "warning";
}

function toneLabel(tone: StatusTone) {
  if (tone === "ok") return "Healthy";
  if (tone === "critical") return "Action";
  return "Degraded";
}

function formatAlertTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Active";
  }

  return new Intl.DateTimeFormat("en-KE", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Nairobi",
  }).format(date);
}

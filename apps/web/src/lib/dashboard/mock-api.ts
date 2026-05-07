import {
  fetchApiObservabilityAlerts,
  fetchApiObservabilityHealth,
  fetchApiReadiness,
  isDashboardApiConfigured,
} from "./api-client";
import { buildDashboardSnapshot, getTenantOptions } from "./mock-data";
import type {
  AlertItem,
  DashboardRole,
  DashboardSnapshot,
  NotificationItem,
  StatusTone,
} from "./types";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function normalizeSeverity(severity: "warning" | "critical"): StatusTone {
  return severity === "critical" ? "critical" : "warning";
}

function buildLiveAlerts(snapshot: DashboardSnapshot, input: {
  readinessStatus: "ok" | "degraded";
  postgres: string;
  redis: string;
  bullmq: string;
  overallStatus: "healthy" | "degraded" | "critical" | "unknown";
  activeAlertCount: number;
}) {
  const liveAlerts: AlertItem[] = [];

  if (input.readinessStatus !== "ok" || input.overallStatus !== "healthy") {
    liveAlerts.push({
      id: "live-platform-health",
      title:
        input.overallStatus === "critical"
          ? "Platform health is critical"
          : "Platform health needs attention",
      description:
        input.activeAlertCount > 0
          ? `${input.activeAlertCount} observability alerts are open across API, queue, sync, or MPESA subsystems.`
          : "The live platform reports a degraded service state.",
      severity: input.overallStatus === "critical" ? "critical" : "warning",
      href: `/dashboard/${snapshot.role}/reports`,
      actionLabel: "Open health view",
      metricLabel: "Live alerts",
      metricValue: `${input.activeAlertCount}`,
    });
  }

  if (input.postgres !== "up") {
    liveAlerts.push({
      id: "live-postgres-down",
      title: "PostgreSQL is unavailable",
      description: "Database readiness failed. Keep finance and write-heavy operations on hold until recovery completes.",
      severity: "critical",
      href: `/dashboard/${snapshot.role}/settings`,
      actionLabel: "Check database",
      metricLabel: "Postgres",
      metricValue: input.postgres,
    });
  }

  if (input.redis !== "up" || input.bullmq !== "configured") {
    liveAlerts.push({
      id: "live-queue-degraded",
      title: "Redis or queue path is degraded",
      description: "Queue-backed actions such as SMS, event flow, or MPESA retries may be delayed.",
      severity: "warning",
      href: `/dashboard/${snapshot.role}/communication`,
      actionLabel: "Inspect queue",
      metricLabel: "Redis",
      metricValue: input.redis,
    });
  }

  return liveAlerts;
}

function buildLiveNotifications(input: {
  role: DashboardRole;
  postgres: string;
  redis: string;
  overallStatus: "healthy" | "degraded" | "critical" | "unknown";
  alerts: Array<{ title: string; message: string; severity: "warning" | "critical" }>;
}): NotificationItem[] {
  const notifications: NotificationItem[] = [
    {
      id: "live-api-state",
      title:
        input.overallStatus === "healthy"
          ? "Live backend connected and healthy"
          : `Live backend state: ${input.overallStatus}`,
      timeLabel: "now",
      severity:
        input.overallStatus === "healthy"
          ? "ok"
          : input.overallStatus === "critical"
            ? "critical"
            : "warning",
      href: `/dashboard/${input.role}/reports`,
    },
    {
      id: "live-data-plane",
      title: `Postgres ${input.postgres}, Redis ${input.redis}`,
      timeLabel: "now",
      severity:
        input.postgres === "up" && input.redis === "up" ? "ok" : "warning",
      href: `/dashboard/${input.role}/settings`,
    },
  ];

  const alertNotifications = input.alerts.slice(0, 2).map((alert, index) => ({
    id: `live-alert-${index + 1}`,
    title: alert.title,
    timeLabel: "live",
    severity: normalizeSeverity(alert.severity),
    href: `/dashboard/${input.role}/reports`,
  }));

  return [...notifications, ...alertNotifications];
}

function mergeActivityFeed(snapshot: DashboardSnapshot, input: {
  overallStatus: "healthy" | "degraded" | "critical" | "unknown";
  activeAlertCount: number;
}) {
  if (input.overallStatus === "healthy") {
    return snapshot.activityFeed;
  }

  return [
    {
      id: "live-ops-activity",
      title: "Live platform status updated",
      detail:
        input.activeAlertCount > 0
          ? `${input.activeAlertCount} observability alerts are open and visible in the live stack.`
          : "Realtime health reported a degraded state with no open alert objects returned.",
      actor: "Observability",
      href: `/dashboard/${snapshot.role}/reports`,
      timeLabel: "now",
      category: "communication" as const,
    },
    ...snapshot.activityFeed,
  ].slice(0, 6);
}

async function hydrateWithLiveSignals(
  snapshot: DashboardSnapshot,
): Promise<DashboardSnapshot> {
  const [readinessResult, healthResult, alertsResult] = await Promise.allSettled([
    fetchApiReadiness(),
    fetchApiObservabilityHealth(),
    fetchApiObservabilityAlerts(),
  ]);

  if (
    readinessResult.status !== "fulfilled" ||
    healthResult.status !== "fulfilled" ||
    alertsResult.status !== "fulfilled"
  ) {
    return {
      ...snapshot,
      notifications: [
        {
          id: "live-fallback",
          title: "Using review data fallback",
          timeLabel: "now",
          severity: "warning" as const,
          href: `/dashboard/${snapshot.role}/reports`,
        } satisfies NotificationItem,
        ...snapshot.notifications,
      ].slice(0, 5),
    };
  }

  const readiness = readinessResult.value;
  const health = healthResult.value;
  const alerts = alertsResult.value.alerts;

  return {
    ...snapshot,
    pageDescription: `${snapshot.pageDescription} Live API status is connected to readiness and observability checks.`,
    alerts: [
      ...buildLiveAlerts(snapshot, {
        readinessStatus: readiness.status,
        postgres: readiness.services.postgres,
        redis: readiness.services.redis,
        bullmq: readiness.services.bullmq,
        overallStatus: health.overall_status,
        activeAlertCount: health.active_alert_count,
      }),
      ...snapshot.alerts,
    ].slice(0, 4),
    notifications: buildLiveNotifications({
      role: snapshot.role,
      postgres: readiness.services.postgres,
      redis: readiness.services.redis,
      overallStatus: health.overall_status,
      alerts: alerts.map((alert) => ({
        title: alert.title,
        message: alert.message,
        severity: alert.severity,
      })),
    }).slice(0, 5),
    activityFeed: mergeActivityFeed(snapshot, {
      overallStatus: health.overall_status,
      activeAlertCount: health.active_alert_count,
    }),
  };
}

export async function fetchTenantOptions() {
  await delay(120);
  return getTenantOptions();
}

export async function fetchDashboardSnapshot(
  role: DashboardRole,
  tenantId: string,
  online: boolean,
) {
  await delay(260);

  const baseline = buildDashboardSnapshot(role, tenantId, online);

  if (!isDashboardApiConfigured()) {
    return baseline;
  }

  return hydrateWithLiveSignals(baseline);
}

"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, ExternalLink, RotateCcw, ShieldBan, UserRoundCog } from "lucide-react";

import { ActivityListCard, SimpleListCard } from "@/components/experience/activity-list-card";
import { ChartCard } from "@/components/experience/chart-card";
import { MetricGrid } from "@/components/experience/metric-grid";
import { QuickActionBar } from "@/components/experience/quick-action-bar";
import { PlatformShell } from "@/components/platform/platform-shell";
import { PlatformSupportWorkspace } from "@/components/support/platform-support-workspace";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Modal } from "@/components/ui/modal";
import { StatusPill } from "@/components/ui/status-pill";
import type { ExperienceNotificationItem } from "@/lib/experiences/types";
import {
  callbackFailures,
  infrastructureEvents,
  infrastructureMetrics,
  mpesaMonitoringRows,
  platformUsersRows,
  revenuePoints,
  subscriptionRows,
  supportActivity,
  superadminKpis,
  superadminNav,
  superadminProfile,
  superadminQuickActions,
  systemAlerts,
  tenantGrowthPoints,
  tenantRows,
  auditRows,
} from "@/lib/experiences/superadmin-data";
import { toSuperadminPath } from "@/lib/routing/experience-routes";

type SuperadminRouteMode = "hosted" | "public";

function buildSuperadminHref(
  section: Parameters<typeof toSuperadminPath>[0],
  routeMode: SuperadminRouteMode,
) {
  if (routeMode === "public") {
    return section === "dashboard" ? "/superadmin" : `/superadmin/${section}`;
  }

  return toSuperadminPath(section);
}

function mapSuperadminHref(href: string, routeMode: SuperadminRouteMode) {
  if (routeMode === "public") {
    return href === "/dashboard" ? "/superadmin" : `/superadmin${href}`;
  }

  return href;
}

function SuperadminPageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
            Platform owner workspace
          </p>
          <h2 className="mt-2 text-2xl font-bold text-foreground">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </Card>
  );
}

function TenantsTable() {
  const [rows, setRows] = useState(tenantRows);
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const selectedTenant = rows.find((row) => row.id === selectedTenantId) ?? null;

  function updateTenantStatus(tenantId: string, nextStatus: "Active" | "Suspended") {
    setRows((currentRows) =>
      currentRows.map((row) =>
        row.id === tenantId
          ? {
              ...row,
              status: nextStatus,
              statusTone: nextStatus === "Active" ? "ok" : "critical",
              lastActive: nextStatus === "Active" ? "just now" : row.lastActive,
            }
          : row,
      ),
    );
  }

  const columns: DataTableColumn<(typeof tenantRows)[number]>[] = [
    {
      id: "schoolName",
      header: "School Name",
      render: (row) => <span className="font-semibold">{row.schoolName}</span>,
    },
    {
      id: "status",
      header: "Status",
      render: (row) => <StatusPill label={row.status} tone={row.statusTone} />,
    },
    { id: "subscription", header: "Subscription", render: (row) => row.subscription },
    { id: "studentCount", header: "Student Count", render: (row) => row.studentCount, className: "text-right", headerClassName: "text-right" },
    { id: "lastActive", header: "Last Active", render: (row) => row.lastActive },
    { id: "revenue", header: "Revenue", render: (row) => row.revenue, className: "text-right font-semibold", headerClassName: "text-right" },
    {
      id: "actions",
      header: "Actions",
      render: (row) => (
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => {
            setSelectedTenantId(row.id);
            setResetMessage(null);
          }}>
            Open tenant
          </Button>
          {row.status === "Suspended" ? (
            <Button variant="secondary" size="sm" onClick={() => updateTenantStatus(row.id, "Active")}>
              <RotateCcw className="h-4 w-4" />
              Activate
            </Button>
          ) : (
            <Button variant="danger" size="sm" onClick={() => updateTenantStatus(row.id, "Suspended")}>
              <ShieldBan className="h-4 w-4" />
              Suspend
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => {
            setSelectedTenantId(row.id);
            setResetMessage(`A one-time admin reset bundle is ready for ${row.schoolName}.`);
          }}>
            <UserRoundCog className="h-4 w-4" />
            Reset admin
          </Button>
        </div>
      ),
      className: "text-right",
      headerClassName: "text-right",
    },
  ];

  return (
    <>
      <DataTable
        title="Tenant control"
        subtitle="Every tenant is isolated operationally, but platform support can review billing, access, and activity from one control surface."
        columns={columns}
        rows={rows}
        getRowKey={(row) => row.id}
      />
      <Modal
        open={Boolean(selectedTenant)}
        title="Tenant control"
        description="Review the tenant state, confirm support actions, and recover access safely."
        onClose={() => {
          setSelectedTenantId(null);
          setResetMessage(null);
        }}
        footer={
          selectedTenant ? (
            <>
              <Button variant="secondary" onClick={() => setSelectedTenantId(null)}>
                Close
              </Button>
              <Button
                variant="ghost"
                onClick={() =>
                  setResetMessage(
                    `A one-time admin reset bundle is ready for ${selectedTenant.schoolName}.`,
                  )
                }
              >
                Reset admin
              </Button>
              {selectedTenant.status === "Suspended" ? (
                <Button
                  onClick={() => {
                    updateTenantStatus(selectedTenant.id, "Active");
                    setSelectedTenantId(null);
                  }}
                >
                  Activate
                </Button>
              ) : (
                <Button
                  variant="danger"
                  onClick={() => {
                    updateTenantStatus(selectedTenant.id, "Suspended");
                    setSelectedTenantId(null);
                  }}
                >
                  Suspend
                </Button>
              )}
            </>
          ) : null
        }
      >
        {selectedTenant ? (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-border bg-surface-muted px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                  School
                </p>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  {selectedTenant.schoolName}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-surface-muted px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                  Status
                </p>
                <div className="mt-2">
                  <StatusPill label={selectedTenant.status} tone={selectedTenant.statusTone} />
                </div>
              </div>
              <div className="rounded-xl border border-border bg-surface-muted px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                  Subscription
                </p>
                <p className="mt-2 text-sm text-foreground">{selectedTenant.subscription}</p>
              </div>
              <div className="rounded-xl border border-border bg-surface-muted px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                  Revenue
                </p>
                <p className="mt-2 text-sm font-semibold text-foreground">{selectedTenant.revenue}</p>
              </div>
            </div>
            {resetMessage ? (
              <div className="rounded-xl border border-success/20 bg-success/10 px-4 py-3 text-sm text-foreground">
                {resetMessage}
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </>
  );
}

function RevenuePage() {
  return (
    <div className="space-y-6">
      <SuperadminPageHeader
        title="Revenue"
        description="Track subscription performance, collection reliability, and the tenant segments driving growth."
      />
      <MetricGrid items={superadminKpis.slice(2, 6)} />
      <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <ChartCard
          title="Monthly recurring revenue"
          subtitle="Revenue stabilized after term-opening onboarding and annual plan conversions."
          points={revenuePoints}
        />
        <SimpleListCard
          title="Collections quality"
          subtitle="Payments and billing behaviors shaping revenue confidence."
          items={[
            { id: "quality-1", title: "Successful renewals", subtitle: "Annual and monthly renewals closed this month", value: "94.2%" },
            { id: "quality-2", title: "Grace accounts", subtitle: "Tenants currently in feature grace window", value: "14", tone: "warning" },
            { id: "quality-3", title: "Churn risk", subtitle: "Tenants with declining usage and unpaid invoices", value: "8", tone: "critical" },
          ]}
        />
      </div>
    </div>
  );
}

function SubscriptionsPage() {
  const columns: DataTableColumn<(typeof subscriptionRows)[number]>[] = [
    { id: "tenant", header: "Tenant", render: (row) => <span className="font-semibold">{row.tenant}</span> },
    { id: "plan", header: "Plan", render: (row) => row.plan },
    { id: "renewal", header: "Renewal", render: (row) => row.renewal },
    { id: "amount", header: "Amount", render: (row) => row.amount, className: "text-right font-semibold", headerClassName: "text-right" },
    { id: "status", header: "Status", render: (row) => <StatusPill label={row.status} tone={row.statusTone} /> },
  ];

  return (
    <div className="space-y-6">
      <SuperadminPageHeader
        title="Subscriptions"
        description="Manage plan mix, renewal windows, grace enforcement, and the tenant revenue lifecycle."
      />
      <DataTable
        title="Subscription ledger"
        subtitle="Use this to inspect plan health before billing actions or support escalations."
        columns={columns}
        rows={subscriptionRows}
        getRowKey={(row) => row.id}
      />
    </div>
  );
}

function MpesaMonitoringPage() {
  const columns: DataTableColumn<(typeof mpesaMonitoringRows)[number]>[] = [
    { id: "school", header: "School", render: (row) => <span className="font-semibold">{row.school}</span> },
    { id: "checkoutRequestId", header: "Checkout Request", render: (row) => row.checkoutRequestId },
    { id: "callbackStatus", header: "Callback", render: (row) => row.callbackStatus },
    { id: "retries", header: "Retries", render: (row) => row.retries, className: "text-right", headerClassName: "text-right" },
    { id: "duplicate", header: "Duplicate", render: (row) => row.duplicate },
    {
      id: "reconciliation",
      header: "Reconciliation",
      render: (row) => <StatusPill label={row.reconciliation} tone={row.statusTone} />,
    },
  ];

  return (
    <div className="space-y-6">
      <SuperadminPageHeader
        title="MPESA monitoring"
        description="Observe callbacks, retries, duplicate transaction handling, and reconciliation health without opening tenant dashboards."
      />
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <DataTable
          title="Global callback monitor"
          subtitle="Platform-wide payment pipeline visibility."
          columns={columns}
          rows={mpesaMonitoringRows}
          getRowKey={(row) => row.id}
        />
        <SimpleListCard
          title="Escalation queue"
          subtitle="Cases worth human attention before the next automated sweep."
          items={callbackFailures}
        />
      </div>
    </div>
  );
}

function UsersPage() {
  const columns: DataTableColumn<(typeof platformUsersRows)[number]>[] = [
    { id: "name", header: "User", render: (row) => <span className="font-semibold">{row.name}</span> },
    { id: "role", header: "Role", render: (row) => row.role },
    { id: "scope", header: "Scope", render: (row) => row.scope },
    { id: "tickets", header: "Current load", render: (row) => row.tickets },
    { id: "lastActive", header: "Last active", render: (row) => row.lastActive },
  ];

  return (
    <div className="space-y-6">
      <SuperadminPageHeader
        title="Users"
        description="Platform team members, operational scope, and who is actively handling support and tenant workflows."
      />
      <DataTable
        title="Platform operators"
        subtitle="Separate support, operations, and ownership responsibilities clearly."
        columns={columns}
        rows={platformUsersRows}
        getRowKey={(row) => row.id}
      />
    </div>
  );
}

function SupportPage() {
  return <PlatformSupportWorkspace defaultView="support" />;
}

function AuditLogsPage() {
  const columns: DataTableColumn<(typeof auditRows)[number]>[] = [
    { id: "actor", header: "Actor", render: (row) => row.actor },
    { id: "action", header: "Action", render: (row) => row.action },
    { id: "target", header: "Target", render: (row) => row.target },
    { id: "time", header: "Time", render: (row) => row.time },
  ];

  return (
    <div className="space-y-6">
      <SuperadminPageHeader
        title="Audit logs"
        description="Critical platform actions across tenant access, financial workflows, and background operations."
      />
      <DataTable
        title="Recent platform audit trail"
        subtitle="Designed for trust, support reviews, and operational accountability."
        columns={columns}
        rows={auditRows}
        getRowKey={(row) => row.id}
      />
    </div>
  );
}

function InfrastructurePage() {
  return (
    <div className="space-y-6">
      <SuperadminPageHeader
        title="Infrastructure"
        description="API latency, queue depth, Redis health, PostgreSQL health, and platform error rates in one surface."
      />
      <MetricGrid items={infrastructureMetrics} />
      <ActivityListCard
        title="Operational events"
        subtitle="Recent system behavior that impacts SLOs, worker recovery, or tenant trust."
        items={infrastructureEvents}
      />
    </div>
  );
}

function NotificationsPage() {
  return (
    <div className="space-y-6">
      <SuperadminPageHeader
        title="Notifications"
        description="Everything that needs human awareness now, from billing signals to platform incidents."
      />
      <ActivityListCard
        title="Notification stream"
        subtitle="Prioritized and phrased for support, operations, and owners."
        items={supportActivity}
      />
    </div>
  );
}

function SettingsPage() {
  return (
    <div className="space-y-6">
      <SuperadminPageHeader
        title="Settings"
        description="Platform-wide controls, webhook posture, notification defaults, and support-response policies."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <p className="text-lg font-semibold text-foreground">Operational defaults</p>
          <div className="mt-4 space-y-3">
            {[
              "Tenant grace period: 7 days",
              "Callback replay tolerance: 300 seconds",
              "Ledger reconciliation sweep: daily at 23:10 EAT",
              "Support escalation SLA: 30 minutes",
            ].map((item) => (
              <div key={item} className="rounded-xl border border-border bg-surface-muted px-4 py-3 text-sm text-foreground">
                {item}
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-5">
          <p className="text-lg font-semibold text-foreground">Security posture</p>
          <div className="mt-4 space-y-3">
            {[
              "Runtime role uses NOBYPASSRLS",
              "Payments queue uses idempotent job IDs",
              "Finance postings require balanced ledger entries",
              "Rate limiting enabled for auth and MPESA callbacks",
            ].map((item) => (
              <div key={item} className="rounded-xl border border-border bg-surface-muted px-4 py-3 text-sm text-foreground">
                {item}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function SuperadminOverview({ routeMode }: { routeMode: SuperadminRouteMode }) {
  return (
    <div className="space-y-6">
      <MetricGrid items={superadminKpis} columns="three" />
      <QuickActionBar actions={superadminQuickActions} />
      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <ChartCard
            title="Revenue trend"
            subtitle="Monthly revenue after subscription renewals, SMS bundles, and annual conversions."
            points={revenuePoints}
          />
          <ChartCard
            title="Tenant growth"
            subtitle="New schools activated across onboarding and assisted migration programs."
            points={tenantGrowthPoints}
          />
        </div>
        <div className="space-y-6">
          <SimpleListCard
            title="System alerts"
            subtitle="Signals the platform team should notice immediately."
            items={systemAlerts}
          />
          <SimpleListCard
            title="Failed callbacks"
            subtitle="Payment anomalies currently under watch."
            items={callbackFailures}
          />
          <ActivityListCard
            title="Support activity"
            subtitle="What the platform team is resolving right now."
            items={supportActivity}
          />
        </div>
      </div>
      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-lg font-semibold text-foreground">Tenant watchlist</p>
            <p className="mt-1 text-sm text-muted">
              Schools that usually need proactive commercial or operational support.
            </p>
          </div>
          <Link
            href={buildSuperadminHref("schools", routeMode)}
            className="inline-flex items-center gap-2 text-sm font-semibold text-foreground"
          >
            Open tenant control
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <TenantsTable />
      </Card>
    </div>
  );
}

export function SuperadminPages({
  section = "overview",
  routeMode = "hosted",
}: {
  section?: string;
  routeMode?: SuperadminRouteMode;
}) {
  const normalizedSection =
    section === "overview" || section === "schools" ? section : section;
  const activeHref =
    normalizedSection === "overview"
      ? buildSuperadminHref("dashboard", routeMode)
      : buildSuperadminHref(
          normalizedSection === "tenants"
            ? "schools"
            : (normalizedSection as Parameters<typeof toSuperadminPath>[0]),
          routeMode,
        );
  const navItems = superadminNav.map((item) => ({
    ...item,
    href: mapSuperadminHref(item.href, routeMode),
  }));
  const notifications: ExperienceNotificationItem[] = [
    ...systemAlerts.map(
      (item): ExperienceNotificationItem => ({
        id: item.id,
        title: item.title,
        detail: item.subtitle,
        timeLabel: "live",
        tone: item.tone ?? "ok",
        href: mapSuperadminHref("/notifications", routeMode),
      }),
    ),
    ...supportActivity.map(
      (item): ExperienceNotificationItem => ({
        id: item.id,
        title: item.title,
        detail: item.detail,
        timeLabel: item.timeLabel,
        tone: item.tone,
        href: mapSuperadminHref("/support", routeMode),
      }),
    ),
  ];

  return (
    <PlatformShell
      brand={{ title: "ShuleHub", subtitle: "Platform owner" }}
      navItems={navItems}
      activeHref={activeHref}
      topLabel="Platform owner workspace"
      title="Platform owner dashboard"
      subtitle="Run the business, monitor infrastructure, and intervene safely without leaking across tenant boundaries."
      status={{ label: "Platform healthy", tone: "ok" }}
      profile={superadminProfile}
      notifications={notifications}
      actions={
        <Link href={buildSuperadminHref("infrastructure", routeMode)}>
          <Button variant="secondary">
            <ExternalLink className="h-4 w-4" />
            Open incident feed
          </Button>
        </Link>
      }
    >
      {normalizedSection === "overview" ? <SuperadminOverview routeMode={routeMode} /> : null}
      {normalizedSection === "tenants" || normalizedSection === "schools" ? <TenantsTable /> : null}
      {normalizedSection === "revenue" ? <RevenuePage /> : null}
      {normalizedSection === "subscriptions" ? <SubscriptionsPage /> : null}
      {normalizedSection === "mpesa-monitoring" ? <MpesaMonitoringPage /> : null}
      {normalizedSection === "users" ? <UsersPage /> : null}
      {normalizedSection === "support" ? <SupportPage /> : null}
      {normalizedSection === "support-open" ? <PlatformSupportWorkspace defaultView="support-open" /> : null}
      {normalizedSection === "support-in-progress" ? <PlatformSupportWorkspace defaultView="support-in-progress" /> : null}
      {normalizedSection === "support-escalated" ? <PlatformSupportWorkspace defaultView="support-escalated" /> : null}
      {normalizedSection === "support-resolved" ? <PlatformSupportWorkspace defaultView="support-resolved" /> : null}
      {normalizedSection === "support-sla" ? <PlatformSupportWorkspace defaultView="support-sla" /> : null}
      {normalizedSection === "support-analytics" ? <PlatformSupportWorkspace defaultView="support-analytics" /> : null}
      {normalizedSection === "audit-logs" ? <AuditLogsPage /> : null}
      {normalizedSection === "infrastructure" ? <InfrastructurePage /> : null}
      {normalizedSection === "notifications" ? <NotificationsPage /> : null}
      {normalizedSection === "settings" ? <SettingsPage /> : null}
    </PlatformShell>
  );
}

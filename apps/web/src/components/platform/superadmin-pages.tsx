"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, ExternalLink, MailCheck, Plus, RotateCcw, ShieldBan, UserRoundCog } from "lucide-react";

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
import { getCsrfToken } from "@/lib/auth/csrf-client";
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
import {
  createPlatformSchool,
  fetchPlatformSchools,
  type PlatformSchool,
} from "@/lib/platform/school-onboarding-client";
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

const emptySchoolForm = {
  schoolName: "",
  tenantId: "",
  county: "",
  adminName: "",
  adminEmail: "",
};

type PlatformSmsProviderCode = "textsms_kenya" | "africas_talking" | "twilio";

type PlatformSmsProvider = {
  id: string;
  provider_name: string;
  provider_code: PlatformSmsProviderCode;
  api_key_masked: string;
  username_masked?: string | null;
  sender_id: string;
  base_url?: string | null;
  is_active: boolean;
  is_default: boolean;
  last_test_status?: string | null;
  last_tested_at?: string | null;
  updated_at?: string | null;
};

type PlatformSmsProviderForm = {
  provider_name: string;
  provider_code: PlatformSmsProviderCode;
  api_key: string;
  username: string;
  sender_id: string;
  base_url: string;
  is_active: boolean;
  is_default: boolean;
};

const smsProviderOptions: Array<{
  code: PlatformSmsProviderCode;
  label: string;
}> = [
  { code: "textsms_kenya", label: "TextSMS Kenya" },
  { code: "africas_talking", label: "Africa's Talking" },
  { code: "twilio", label: "Twilio" },
];

const emptySmsProviderForm: PlatformSmsProviderForm = {
  provider_name: "TextSMS Kenya",
  provider_code: "textsms_kenya",
  api_key: "",
  username: "",
  sender_id: "SHULEHUB",
  base_url: "",
  is_active: true,
  is_default: true,
};

type ApiEnvelope<T> = {
  data: T;
  meta?: Record<string, unknown>;
};

function unwrapPlatformPayload<T>(payload: T | ApiEnvelope<T> | null): T | null {
  return payload && typeof payload === "object" && "data" in payload
    ? (payload as ApiEnvelope<T>).data
    : (payload as T | null);
}

function mapPlatformSchoolToTenantRow(row: PlatformSchool): (typeof tenantRows)[number] {
  return {
    id: row.tenant_id,
    schoolName: row.school_name,
    status: row.status === "active" ? "Active" : "Suspended",
    statusTone: row.status === "active" ? "ok" : "critical",
    subscription: "Not configured",
    studentCount: "0",
    lastActive: row.invitation_sent ? "Invitation sent" : "Awaiting admin",
    revenue: "KES 0",
  };
}

function TenantsTable() {
  const [rows, setRows] = useState(tenantRows);
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [schoolForm, setSchoolForm] = useState(emptySchoolForm);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isLoadingSchools, setIsLoadingSchools] = useState(true);
  const selectedTenant = rows.find((row) => row.id === selectedTenantId) ?? null;

  useEffect(() => {
    let cancelled = false;

    async function loadSchools() {
      setIsLoadingSchools(true);

      try {
        const liveRows = await fetchPlatformSchools();

        if (!cancelled) {
          setRows(liveRows.map(mapPlatformSchoolToTenantRow));
        }
      } catch {
        if (!cancelled) {
          setRows(tenantRows);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingSchools(false);
        }
      }
    }

    void loadSchools();

    return () => {
      cancelled = true;
    };
  }, []);

  async function submitSchoolCreate() {
    if (
      schoolForm.schoolName.trim().length < 2 ||
      schoolForm.tenantId.trim().length < 2 ||
      schoolForm.adminName.trim().length < 2 ||
      !schoolForm.adminEmail.includes("@")
    ) {
      setCreateError("Enter the school name, workspace code, admin name, and admin email.");
      return;
    }

    setIsCreating(true);
    setCreateError(null);
    setCreateSuccess(null);

    try {
      const createdSchool = await createPlatformSchool({
        schoolName: schoolForm.schoolName.trim(),
        tenantId: schoolForm.tenantId.trim(),
        county: schoolForm.county.trim() || undefined,
        adminName: schoolForm.adminName.trim(),
        adminEmail: schoolForm.adminEmail.trim(),
      });
      setRows((currentRows) => [
        mapPlatformSchoolToTenantRow(createdSchool),
        ...currentRows.filter((row) => row.id !== createdSchool.tenant_id),
      ]);
      setCreateSuccess(`Invitation sent to ${createdSchool.admin_email}.`);
      setSchoolForm(emptySchoolForm);
    } catch (error) {
      setCreateError(
        error instanceof Error
          ? error.message
          : "Unable to create this school right now.",
      );
    } finally {
      setIsCreating(false);
    }
  }

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
      <div className="mb-4 flex flex-col gap-3 rounded-[var(--radius-sm)] border border-border bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">School onboarding</p>
          <p className="mt-1 text-[13px] text-muted">
            Create a real tenant and email the first school administrator an invite.
          </p>
        </div>
        <Button onClick={() => {
          setIsCreateOpen(true);
          setCreateError(null);
          setCreateSuccess(null);
        }}>
          <Plus className="h-4 w-4" />
          Create school
        </Button>
      </div>
      <DataTable
        title="Tenant control"
        subtitle="Every tenant is isolated operationally, but platform support can review billing, access, and activity from one control surface."
        columns={columns}
        rows={rows}
        getRowKey={(row) => row.id}
        emptyMessage={
          isLoadingSchools
            ? "Loading live school records."
            : "No schools have been onboarded. Create the first school to send a real administrator invitation."
        }
      />
      <Modal
        open={isCreateOpen}
        title="Create school"
        description="This creates a real tenant, prepares RBAC roles, and emails the first school administrator."
        size="lg"
        onClose={() => {
          if (!isCreating) {
            setIsCreateOpen(false);
          }
        }}
        footer={
          <>
            <Button
              variant="secondary"
              disabled={isCreating}
              onClick={() => setIsCreateOpen(false)}
            >
              Close
            </Button>
            <Button disabled={isCreating} onClick={submitSchoolCreate}>
              <MailCheck className="h-4 w-4" />
              {isCreating ? "Sending invite" : "Create and invite"}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          {[
            {
              id: "schoolName",
              label: "School name",
              placeholder: "Official school name",
              value: schoolForm.schoolName,
            },
            {
              id: "tenantId",
              label: "Workspace code",
              placeholder: "Unique workspace code",
              value: schoolForm.tenantId,
            },
            {
              id: "county",
              label: "County",
              placeholder: "County name",
              value: schoolForm.county,
            },
            {
              id: "adminName",
              label: "Administrator name",
              placeholder: "Principal name",
              value: schoolForm.adminName,
            },
            {
              id: "adminEmail",
              label: "Administrator email",
              placeholder: "Administrator email address",
              value: schoolForm.adminEmail,
              type: "email",
              className: "md:col-span-2",
            },
          ].map((field) => (
            <label key={field.id} className={`space-y-1.5 ${field.className ?? ""}`}>
              <span className="text-[13px] font-semibold text-foreground">{field.label}</span>
              <input
                type={field.type ?? "text"}
                value={field.value}
                placeholder={field.placeholder}
                disabled={isCreating}
                onChange={(event) =>
                  setSchoolForm((currentForm) => ({
                    ...currentForm,
                    [field.id]: event.target.value,
                  }))
                }
                className="h-10 w-full rounded-[var(--radius-sm)] border border-border bg-surface px-3 text-sm text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>
          ))}
        </div>
        {createError ? (
          <div className="mt-4 rounded-[var(--radius-sm)] border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
            {createError}
          </div>
        ) : null}
        {createSuccess ? (
          <div className="mt-4 rounded-[var(--radius-sm)] border border-success/20 bg-success/10 px-4 py-3 text-sm text-foreground">
            {createSuccess}
          </div>
        ) : null}
      </Modal>
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
          subtitle="Revenue data appears after real subscriptions and payment activity are created."
          points={revenuePoints}
        />
        <SimpleListCard
          title="Collections quality"
          subtitle="Live billing health appears after schools are onboarded."
          items={[]}
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

function PlatformNotice({ tone, message }: { tone: "success" | "error"; message: string }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-xl border px-4 py-3 text-sm ${
        tone === "success"
          ? "border-success/20 bg-success/10 text-foreground"
          : "border-danger/20 bg-danger/10 text-foreground"
      }`}
    >
      {message}
    </div>
  );
}

async function parsePlatformSmsResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    | { message?: string }
    | ApiEnvelope<T>
    | T
    | null;

  if (!response.ok) {
    throw new Error(
      payload && typeof payload === "object" && "message" in payload && payload.message
        ? payload.message
        : "Unable to complete this SMS settings request.",
    );
  }

  return unwrapPlatformPayload<T>(payload as T | ApiEnvelope<T> | null) as T;
}

function toProviderForm(provider: PlatformSmsProvider): PlatformSmsProviderForm {
  return {
    provider_name: provider.provider_name,
    provider_code: provider.provider_code,
    api_key: "",
    username: "",
    sender_id: provider.sender_id,
    base_url: provider.base_url ?? "",
    is_active: provider.is_active,
    is_default: provider.is_default,
  };
}

function getProviderTone(provider: PlatformSmsProvider): "ok" | "warning" | "critical" {
  if (!provider.is_active) return "warning";
  if (provider.last_test_status === "failed") return "critical";
  if (provider.is_default || provider.last_test_status === "ok") return "ok";
  return "warning";
}

function PlatformSmsSettingsPage() {
  const [providers, setProviders] = useState<PlatformSmsProvider[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [form, setForm] = useState<PlatformSmsProviderForm>(emptySmsProviderForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selectedProvider = providers.find((provider) => provider.id === selectedProviderId) ?? null;

  useEffect(() => {
    let cancelled = false;

    async function loadProviders() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/platform/sms/providers", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        });
        const payload = await parsePlatformSmsResponse<PlatformSmsProvider[]>(response);

        if (!cancelled) {
          setProviders(Array.isArray(payload) ? payload : []);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load SMS providers.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadProviders();

    return () => {
      cancelled = true;
    };
  }, []);

  function updateForm<K extends keyof PlatformSmsProviderForm>(
    key: K,
    value: PlatformSmsProviderForm[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
    setNotice(null);
    setError(null);
  }

  function startCreate() {
    setSelectedProviderId(null);
    setForm(emptySmsProviderForm);
    setNotice(null);
    setError(null);
  }

  function startEdit(provider: PlatformSmsProvider) {
    setSelectedProviderId(provider.id);
    setForm(toProviderForm(provider));
    setNotice(null);
    setError(null);
  }

  async function reloadProviders() {
    const response = await fetch("/api/platform/sms/providers", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    });
    const payload = await parsePlatformSmsResponse<PlatformSmsProvider[]>(response);

    setProviders(Array.isArray(payload) ? payload : []);
  }

  async function saveProvider() {
    setIsSaving(true);
    setNotice(null);
    setError(null);

    try {
      const trimmedApiKey = form.api_key.trim();

      if (!selectedProvider && trimmedApiKey.length < 8) {
        setError("Enter the provider API key before saving a new SMS provider.");
        return;
      }

      const body: Record<string, unknown> = {
        provider_name: form.provider_name.trim(),
        provider_code: form.provider_code,
        username: form.username.trim() || undefined,
        sender_id: form.sender_id.trim(),
        base_url: form.base_url.trim() || undefined,
        is_active: form.is_active,
        is_default: form.is_default,
      };

      if (trimmedApiKey) {
        body.api_key = trimmedApiKey;
      }

      const response = await fetch(
        selectedProvider
          ? `/api/platform/sms/providers/${encodeURIComponent(selectedProvider.id)}`
          : "/api/platform/sms/providers",
        {
          method: selectedProvider ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
            "x-shulehub-csrf": await getCsrfToken(),
          },
          credentials: "same-origin",
          body: JSON.stringify(body),
        },
      );
      const provider = await parsePlatformSmsResponse<PlatformSmsProvider>(response);

      await reloadProviders();
      setSelectedProviderId(provider.id);
      setForm(toProviderForm(provider));
      setNotice("SMS provider saved securely. Secrets are masked and are not shown again.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save SMS provider.");
    } finally {
      setIsSaving(false);
    }
  }

  async function testProvider(provider: PlatformSmsProvider) {
    setNotice(null);
    setError(null);

    try {
      const response = await fetch(
        `/api/platform/sms/providers/${encodeURIComponent(provider.id)}/test`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-shulehub-csrf": await getCsrfToken(),
          },
          credentials: "same-origin",
        },
      );

      await parsePlatformSmsResponse<PlatformSmsProvider>(response);
      await reloadProviders();
      setNotice(`${provider.provider_name} connection test passed.`);
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : "SMS provider test failed.");
    }
  }

  async function setDefaultProvider(provider: PlatformSmsProvider) {
    setNotice(null);
    setError(null);

    try {
      const response = await fetch(
        `/api/platform/sms/providers/${encodeURIComponent(provider.id)}/set-default`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-shulehub-csrf": await getCsrfToken(),
          },
          credentials: "same-origin",
        },
      );

      await parsePlatformSmsResponse<PlatformSmsProvider>(response);
      await reloadProviders();
      setNotice(`${provider.provider_name} is now the default SMS provider.`);
    } catch (defaultError) {
      setError(defaultError instanceof Error ? defaultError.message : "Unable to set default provider.");
    }
  }

  const providerRows = providers.map((provider) => ({
    ...provider,
    providerLabel:
      smsProviderOptions.find((option) => option.code === provider.provider_code)?.label
      ?? provider.provider_name,
  }));

  const providerColumns: DataTableColumn<(typeof providerRows)[number]>[] = [
    { id: "provider", header: "Provider", render: (row) => <span className="font-semibold">{row.provider_name}</span> },
    { id: "type", header: "Type", render: (row) => row.providerLabel },
    { id: "sender", header: "Sender ID", render: (row) => row.sender_id },
    { id: "key", header: "API key", render: (row) => row.api_key_masked },
    {
      id: "status",
      header: "Status",
      render: (row) => (
        <StatusPill
          label={row.is_default ? "Default" : row.is_active ? "Active" : "Disabled"}
          tone={getProviderTone(row)}
        />
      ),
    },
    {
      id: "actions",
      header: "Actions",
      render: (row) => (
        <div className="flex flex-wrap justify-end gap-2">
          <Button size="sm" variant="secondary" onClick={() => startEdit(row)}>
            Edit
          </Button>
          <Button size="sm" variant="secondary" onClick={() => testProvider(row)}>
            Test
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDefaultProvider(row)}>
            Make default
          </Button>
        </div>
      ),
      className: "text-right",
      headerClassName: "text-right",
    },
  ];

  return (
    <div className="space-y-6">
      <SuperadminPageHeader
        title="SMS settings"
        description="Configure platform-owned SMS providers here. Schools consume SMS credits, but they never see API keys or provider credentials."
        actions={
          <Button variant="secondary" onClick={startCreate}>
            <Plus className="h-4 w-4" />
            Add provider
          </Button>
        }
      />

      {notice ? <PlatformNotice tone="success" message={notice} /> : null}
      {error ? <PlatformNotice tone="error" message={error} /> : null}

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <DataTable
          title="Platform SMS providers"
          subtitle={isLoading ? "Loading provider settings..." : "Credentials are encrypted at rest and only returned as masked values."}
          columns={providerColumns}
          rows={providerRows}
          getRowKey={(row) => row.id}
          emptyMessage="No SMS provider has been configured yet."
        />

        <Card className="space-y-4 p-5">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-muted">
              {selectedProvider ? "Edit provider" : "New provider"}
            </p>
            <h3 className="mt-1 text-lg font-semibold text-foreground">
              Provider credentials
            </h3>
            <p className="mt-1 text-sm leading-6 text-muted">
              Add TextSMS Kenya, Africa&apos;s Talking, or Twilio credentials. Secret fields are write-only after saving.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-2 text-sm text-foreground">
              <span className="font-medium">Provider name</span>
              <input
                className="input-base"
                value={form.provider_name}
                onChange={(event) => updateForm("provider_name", event.target.value)}
              />
            </label>
            <label className="space-y-2 text-sm text-foreground">
              <span className="font-medium">Provider</span>
              <select
                className="input-base"
                value={form.provider_code}
                disabled={Boolean(selectedProvider)}
                onChange={(event) =>
                  updateForm("provider_code", event.target.value as PlatformSmsProviderCode)
                }
              >
                {smsProviderOptions.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2 text-sm text-foreground">
              <span className="font-medium">API key</span>
              <input
                className="input-base"
                type="password"
                value={form.api_key}
                placeholder={selectedProvider?.api_key_masked ?? "Paste provider API key"}
                onChange={(event) => updateForm("api_key", event.target.value)}
              />
            </label>
            <label className="space-y-2 text-sm text-foreground">
              <span className="font-medium">Username</span>
              <input
                className="input-base"
                value={form.username}
                placeholder={selectedProvider?.username_masked ?? "Optional username"}
                onChange={(event) => updateForm("username", event.target.value)}
              />
            </label>
            <label className="space-y-2 text-sm text-foreground">
              <span className="font-medium">Sender ID</span>
              <input
                className="input-base"
                value={form.sender_id}
                onChange={(event) => updateForm("sender_id", event.target.value)}
              />
            </label>
            <label className="space-y-2 text-sm text-foreground">
              <span className="font-medium">Base URL</span>
              <input
                className="input-base"
                value={form.base_url}
                placeholder="Optional provider endpoint"
                onChange={(event) => updateForm("base_url", event.target.value)}
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-start gap-3 rounded-xl border border-border bg-surface-muted p-3 text-sm">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(event) => updateForm("is_active", event.target.checked)}
                className="mt-1 h-4 w-4 rounded border-border"
              />
              <span>
                <span className="block font-semibold text-foreground">Enable provider</span>
                <span className="mt-1 block text-muted">Allow schools to send through this provider.</span>
              </span>
            </label>
            <label className="flex items-start gap-3 rounded-xl border border-border bg-surface-muted p-3 text-sm">
              <input
                type="checkbox"
                checked={form.is_default}
                onChange={(event) => updateForm("is_default", event.target.checked)}
                className="mt-1 h-4 w-4 rounded border-border"
              />
              <span>
                <span className="block font-semibold text-foreground">Make default</span>
                <span className="mt-1 block text-muted">Use this provider for new SMS dispatches.</span>
              </span>
            </label>
          </div>

          <div className="rounded-xl border border-border bg-surface-muted px-4 py-3 text-sm leading-6 text-muted">
            Provider secrets are never exposed after save. Schools only see SMS balance, usage, logs, and purchase requests.
          </div>

          <div className="flex flex-wrap gap-2">
            <Button disabled={isSaving} onClick={saveProvider}>
              {isSaving ? "Saving..." : selectedProvider ? "Save changes" : "Save provider"}
            </Button>
            {selectedProvider ? (
              <Button variant="secondary" onClick={() => testProvider(selectedProvider)}>
                Test connection
              </Button>
            ) : null}
          </div>
        </Card>
      </div>
    </div>
  );
}

function SettingsPage({ routeMode }: { routeMode: SuperadminRouteMode }) {
  return (
    <div className="space-y-6">
      <SuperadminPageHeader
        title="Settings"
        description="Platform-wide controls, webhook posture, notification defaults, and support-response policies."
        actions={
          <Link href={buildSuperadminHref("sms-settings", routeMode)}>
            <Button variant="secondary">Open SMS settings</Button>
          </Link>
        }
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
            subtitle="Monthly revenue appears after live subscriptions, invoices, and payment settlements."
            points={revenuePoints}
          />
          <ChartCard
            title="Tenant growth"
            subtitle="New schools appear here after the platform owner completes real onboarding."
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
      {normalizedSection === "sms-settings" ? <PlatformSmsSettingsPage /> : null}
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
      {normalizedSection === "settings" ? <SettingsPage routeMode={routeMode} /> : null}
    </PlatformShell>
  );
}

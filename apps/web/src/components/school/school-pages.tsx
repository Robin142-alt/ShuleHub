"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, FileSpreadsheet, Printer, Send, UserPlus } from "lucide-react";

import { ActivityListCard, SimpleListCard } from "@/components/experience/activity-list-card";
import { MetricGrid } from "@/components/experience/metric-grid";
import { QuickActionBar } from "@/components/experience/quick-action-bar";
import { ErpShell } from "@/components/school/erp-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Modal } from "@/components/ui/modal";
import { StatusPill } from "@/components/ui/status-pill";
import { Tabs } from "@/components/ui/tabs";
import {
  downloadCsvFile,
  downloadTextFile,
  openPrintDocument,
} from "@/lib/dashboard/export";
import type { ExperienceNotificationItem } from "@/lib/experiences/types";
import { getSchoolKpiSummary, getSchoolWorkspace, schoolSectionLabels, type SchoolExperienceRole, type SchoolSubscriptionView } from "@/lib/experiences/school-data";
import { toSchoolPath, toSchoolStudentPath } from "@/lib/routing/experience-routes";

type SchoolRouteMode = "hosted" | "public";

function buildSchoolSectionHref(
  role: SchoolExperienceRole,
  section: Parameters<typeof toSchoolPath>[0],
  routeMode: SchoolRouteMode,
) {
  if (routeMode === "public") {
    return section === "dashboard" ? `/school/${role}` : `/school/${role}/${section}`;
  }

  return toSchoolPath(section);
}

function buildSchoolStudentHref(
  role: SchoolExperienceRole,
  studentId: string,
  routeMode: SchoolRouteMode,
) {
  if (routeMode === "public") {
    return `/school/${role}/students/${studentId}`;
  }

  return toSchoolStudentPath(studentId);
}

function mapSchoolHref(
  role: SchoolExperienceRole,
  href: string,
  routeMode: SchoolRouteMode,
) {
  const normalized = href.replace(/^\/+/, "");
  const section = normalized.length === 0 ? "dashboard" : normalized;

  return buildSchoolSectionHref(
    role,
    section as Parameters<typeof toSchoolPath>[0],
    routeMode,
  );
}

function getMissingFieldError(fields: Array<{ label: string; value: string }>) {
  const missingField = fields.find((field) => field.value.trim().length === 0);
  return missingField ? `${missingField.label} is required.` : null;
}

function parsePositiveAmount(value: string) {
  const normalized = value.replace(/,/g, "").trim();
  const parsed = Number(normalized);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function formatKesAmount(amount: number) {
  return `KES ${amount.toLocaleString("en-KE")}`;
}

function SchoolPageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">{eyebrow}</p>
          <h2 className="mt-2 text-2xl font-bold text-foreground">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </Card>
  );
}

function SubscriptionBanner({
  subscription,
  role,
  routeMode,
}: {
  subscription: SchoolSubscriptionView;
  role: SchoolExperienceRole;
  routeMode: SchoolRouteMode;
}) {
  return (
    <Card className="border-l-4 border-l-warning p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill label={subscription.statusLabel} tone={subscription.tone} />
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
              {subscription.state}
            </span>
          </div>
          <h3 className="mt-3 text-lg font-semibold text-foreground">{subscription.headline}</h3>
          <p className="mt-2 text-sm leading-6 text-muted">{subscription.detail}</p>
          <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-muted">
            <span>{subscription.renewalDueLabel}</span>
            <span>{subscription.exportAllowedLabel}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={mapSchoolHref(role, subscription.primaryActionHref, routeMode)}>
            <Button>{subscription.primaryActionLabel}</Button>
          </Link>
          <Link href={buildSchoolSectionHref(role, "reports", routeMode)}>
            <Button variant="secondary">Export data</Button>
          </Link>
        </div>
      </div>
    </Card>
  );
}

function SubscriptionLifecyclePanel({
  subscription,
  role,
  routeMode,
}: {
  subscription: SchoolSubscriptionView;
  role: SchoolExperienceRole;
  routeMode: SchoolRouteMode;
}) {
  const [renewOpen, setRenewOpen] = useState(false);

  return (
    <>
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-lg font-semibold text-foreground">Subscription lifecycle</p>
                <StatusPill label={subscription.state} tone={subscription.tone} />
              </div>
              <p className="mt-2 text-sm leading-6 text-muted">
                {subscription.detail}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setRenewOpen(true)}>
                {subscription.primaryActionLabel}
              </Button>
              <Link href={buildSchoolSectionHref(role, "reports", routeMode)}>
                <Button variant="secondary">Export school data</Button>
              </Link>
            </div>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {subscription.stages.map((stage) => (
              <div
                key={stage.id}
                className={`rounded-xl border px-4 py-4 ${
                  stage.label === subscription.state
                    ? "border-warning bg-warning/10"
                    : "border-border bg-surface-muted"
                }`}
              >
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                  {stage.label}
                </p>
                <p className="mt-2 text-sm leading-6 text-foreground">{stage.description}</p>
              </div>
            ))}
          </div>
        </Card>
        <SimpleListCard
          title="Reminder delivery"
          subtitle="Admin, SMS, and email reminders stay visible before any access restriction."
          items={subscription.reminders.map((reminder) => ({
            id: reminder.id,
            title: reminder.title,
            subtitle: `${reminder.channel.toUpperCase()} • ${reminder.detail}`,
            value: reminder.status,
            tone: reminder.tone,
          }))}
        />
      </div>
      <Modal
        open={renewOpen}
        title="Renew school subscription"
        description="Use the current billing phone on file to start an MPESA renewal and restore continuous access."
        onClose={() => setRenewOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRenewOpen(false)}>
              Cancel
            </Button>
            <Link href={buildSchoolSectionHref(role, "finance", routeMode)}>
              <Button>Start MPESA renewal</Button>
            </Link>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-surface-muted px-4 py-4">
            <p className="text-sm font-semibold text-foreground">Renewal flow</p>
            <ol className="mt-3 space-y-2 text-sm leading-6 text-muted">
              <li>1. Generate a renewal invoice for the current subscription window.</li>
              <li>2. Send the MPESA STK push to the billing phone on file.</li>
              <li>3. Keep exports and billing open until the payment settles.</li>
              <li>4. Restore full school access automatically after the renewal posts.</li>
            </ol>
          </div>
          <div className="rounded-xl border border-border bg-white px-4 py-4">
            <p className="text-sm font-semibold text-foreground">Current policy</p>
            <p className="mt-2 text-sm leading-6 text-muted">
              The school never hard locks immediately. Warning banners appear first, then grace
              period, then read-only restriction, while export and renewal remain available.
            </p>
          </div>
        </div>
      </Modal>
    </>
  );
}

function SchoolDashboardHome({
  role,
  tenantSlug,
  routeMode,
}: {
  role: SchoolExperienceRole;
  tenantSlug?: string | null;
  routeMode: SchoolRouteMode;
}) {
  const { snapshot, model, subscription } = getSchoolWorkspace(role, tenantSlug);

  return (
    <div className="space-y-6">
      <SubscriptionBanner subscription={subscription} role={role} routeMode={routeMode} />
      <MetricGrid items={getSchoolKpiSummary(role, tenantSlug)} />
      <QuickActionBar
        actions={[
          { id: "record-payment", label: "Record Payment", description: "Post a school payment quickly", href: buildSchoolSectionHref(role, "finance", routeMode), icon: FileSpreadsheet },
          { id: "add-student", label: "Add Student", description: "Create a learner record", href: buildSchoolSectionHref(role, "students", routeMode), icon: UserPlus },
          { id: "send-sms", label: "Send SMS", description: "Reach families or a class stream", href: buildSchoolSectionHref(role, "communication", routeMode), icon: Send },
          { id: "print-report", label: "Print Report", description: "Open class or fee reports", href: buildSchoolSectionHref(role, "reports", routeMode), icon: Printer },
        ]}
      />
      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <DataTable
            title="MPESA transactions"
            subtitle="Fresh mobile payments that bursars or principals usually check first."
            columns={[
              { id: "student", header: "Student", render: (row) => row.student },
              { id: "amount", header: "Amount", render: (row) => row.amount, className: "text-right font-semibold", headerClassName: "text-right" },
              { id: "phone", header: "Phone", render: (row) => row.phone },
              { id: "code", header: "Code", render: (row) => row.code },
              { id: "status", header: "Status", render: (row) => <StatusPill label={row.status} tone={row.statusTone} /> },
            ]}
            rows={model.dashboard.mpesaFeed}
            getRowKey={(row) => row.id}
          />
          <DataTable
            title="Payment activity"
            subtitle="Posted and in-flight collections for the current term."
            columns={[
              { id: "student", header: "Student", render: (row) => row.student },
              { id: "amount", header: "Amount", render: (row) => row.amount, className: "text-right font-semibold", headerClassName: "text-right" },
              { id: "method", header: "Method", render: (row) => row.method },
              { id: "date", header: "Date", render: (row) => row.date },
              { id: "reference", header: "Reference", render: (row) => row.reference },
            ]}
            rows={model.finance.rows.slice(0, 5)}
            getRowKey={(row) => row.id}
          />
        </div>
        <div className="space-y-6">
          <SimpleListCard
            title="Defaulters list"
            subtitle="Families that usually need a call or reminder next."
            items={model.dashboard.defaulters.map((row) => ({
              id: row.id,
              title: row.student,
              subtitle: row.className,
              value: row.balance,
            }))}
          />
          <SimpleListCard
            title="Attendance summary"
            subtitle="Signals for class roll call completion today."
            items={snapshot.attendance.classStatus.map((entry) => ({
              id: entry.className,
              title: entry.className,
              subtitle: `Attendance completion ${entry.value}`,
              value: entry.status,
              tone:
                entry.status === "synced"
                  ? "ok"
                  : entry.status === "pending"
                    ? "warning"
                    : "critical",
            }))}
          />
          <SimpleListCard
            title="Alerts"
            subtitle="Items that need attention before routine work."
            items={snapshot.alerts.map((alert) => ({
              id: alert.id,
              title: alert.title,
              subtitle: alert.description,
              value: alert.severity,
              tone: alert.severity,
            }))}
          />
        </div>
      </div>
      <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
        <ActivityListCard
          title="Recent activity"
          subtitle="School operations in reverse chronological order."
          items={snapshot.activityFeed.map((item) => ({
            id: item.id,
            title: item.title,
            detail: item.detail,
            timeLabel: item.timeLabel,
            tone: item.category === "payment" ? "ok" : item.category === "attendance" ? "warning" : "ok",
          }))}
        />
        <Card className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-lg font-semibold text-foreground">Quick actions</p>
              <p className="mt-1 text-sm leading-6 text-muted">
                The everyday things school teams need within two clicks.
              </p>
          </div>
          <Link href={buildSchoolSectionHref(role, "reports", routeMode)} className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
              Reports
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {snapshot.quickActions.slice(0, 4).map((action) => (
              <Link
                key={action.id}
                href={mapSchoolHref(role, action.href, routeMode)}
                className="rounded-xl border border-border bg-surface-muted px-4 py-4 transition duration-150 hover:bg-surface-strong"
              >
                <p className="text-sm font-semibold text-foreground">{action.label}</p>
                <p className="mt-1 text-sm text-muted">{action.description}</p>
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function SchoolStudentsPage({
  role,
  tenantSlug,
  routeMode,
}: {
  role: SchoolExperienceRole;
  tenantSlug?: string | null;
  routeMode: SchoolRouteMode;
}) {
  const { model } = getSchoolWorkspace(role, tenantSlug);
  const [rows, setRows] = useState(model.students.rows);
  const [showAddStudentModal, setShowAddStudentModal] = useState(false);
  const [learnerName, setLearnerName] = useState("");
  const [admissionNumber, setAdmissionNumber] = useState("");
  const [className, setClassName] = useState("");
  const [parentContact, setParentContact] = useState("");
  const [studentError, setStudentError] = useState<string | null>(null);
  const [studentMessage, setStudentMessage] = useState<string | null>(null);

  function resetStudentDraft() {
    setLearnerName("");
    setAdmissionNumber("");
    setClassName("");
    setParentContact("");
    setStudentError(null);
  }

  function openStudentModal() {
    resetStudentDraft();
    setShowAddStudentModal(true);
  }

  function closeStudentModal() {
    setShowAddStudentModal(false);
    setStudentError(null);
  }

  function saveStudent() {
    const validationError = getMissingFieldError([
      { label: "Learner name", value: learnerName },
      { label: "Admission number", value: admissionNumber },
      { label: "Class", value: className },
      { label: "Parent contact", value: parentContact },
    ]);

    if (validationError) {
      setStudentError(validationError);
      return;
    }

    const nextLearnerName = learnerName.trim();
    const nextAdmissionNumber = admissionNumber.trim();
    const nextClassName = className.trim();
    const nextParentContact = parentContact.trim();

    setRows((currentRows) => [
      {
        id: `student-${nextAdmissionNumber.toLowerCase()}`,
        name: nextLearnerName,
        admissionNumber: nextAdmissionNumber,
        className: nextClassName,
        parent: nextParentContact,
        balance: "KES 0",
        balanceTone: "ok",
      },
      ...currentRows,
    ]);
    setStudentError(null);
    setStudentMessage(`${nextLearnerName} added to the learner register.`);
    resetStudentDraft();
    setShowAddStudentModal(false);
  }

  return (
    <div className="space-y-6">
      <SchoolPageHeader
        eyebrow="Students"
        title="Learner register"
        description="Search, review, and open each learner profile with the balance and parent contact visible immediately."
        actions={<Button onClick={openStudentModal}>Add student</Button>}
      />
      {studentMessage ? (
        <div
          aria-live="polite"
          className="rounded-xl border border-success/20 bg-success/10 px-4 py-3 text-sm text-foreground"
        >
          {studentMessage}
        </div>
      ) : null}
      <DataTable
        title="Students"
        subtitle="Admission, family contact, class placement, and fee balance in one table."
        columns={[
          {
            id: "name",
            header: "Student Name",
            render: (row) => (
              <Link href={buildSchoolStudentHref(role, row.id, routeMode)} className="font-semibold text-foreground underline-offset-4 hover:underline">
                {row.name}
              </Link>
            ),
          },
          { id: "admissionNumber", header: "Admission Number", render: (row) => row.admissionNumber },
          { id: "className", header: "Class", render: (row) => row.className },
          { id: "parent", header: "Parent Contact", render: (row) => row.parent },
          {
            id: "balance",
            header: "Fee Balance",
            render: (row) => <StatusPill label={row.balance} tone={row.balanceTone} />,
          },
        ]}
        rows={rows}
        getRowKey={(row) => row.id}
      />
      <Modal
        open={showAddStudentModal}
        title="Add student"
        description="Create a learner entry that immediately appears in the register."
        onClose={closeStudentModal}
        footer={
          <>
            <Button variant="secondary" onClick={closeStudentModal}>
              Cancel
            </Button>
            <Button onClick={saveStudent}>Save student</Button>
          </>
        }
      >
        <div className="space-y-4">
          {studentError ? (
            <div role="alert" className="rounded-xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-foreground">
              {studentError}
            </div>
          ) : null}
          <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-sm text-foreground">
            <span className="font-medium">Learner name</span>
            <input
              aria-label="Learner name"
              value={learnerName}
              onChange={(event) => {
                setLearnerName(event.target.value);
                setStudentError(null);
              }}
              className="input-base"
              placeholder="Mercy Atieno"
            />
          </label>
          <label className="space-y-2 text-sm text-foreground">
            <span className="font-medium">Admission number</span>
            <input
              aria-label="Admission number"
              value={admissionNumber}
              onChange={(event) => {
                setAdmissionNumber(event.target.value);
                setStudentError(null);
              }}
              className="input-base"
              placeholder="ADM-9001"
            />
          </label>
          <label className="space-y-2 text-sm text-foreground">
            <span className="font-medium">Class</span>
            <input
              aria-label="Class"
              value={className}
              onChange={(event) => {
                setClassName(event.target.value);
                setStudentError(null);
              }}
              className="input-base"
              placeholder="Grade 6 Hope"
            />
          </label>
          <label className="space-y-2 text-sm text-foreground">
            <span className="font-medium">Parent contact</span>
            <input
              aria-label="Parent contact"
              value={parentContact}
              onChange={(event) => {
                setParentContact(event.target.value);
                setStudentError(null);
              }}
              className="input-base"
              inputMode="tel"
              placeholder="0722000001"
            />
          </label>
        </div>
        </div>
      </Modal>
    </div>
  );
}

function StudentProfilePage({
  role,
  tenantSlug,
  studentId,
}: {
  role: SchoolExperienceRole;
  tenantSlug?: string | null;
  studentId: string;
}) {
  const { model } = getSchoolWorkspace(role, tenantSlug);
  const profile = model.studentProfiles.find((entry) => entry.id === studentId) ?? model.studentProfiles[0];
  const profileDocuments = [
    { label: "Admission form", value: "Uploaded and verified" },
    { label: "Guardian consent", value: "Stored with learner registration" },
  ];

  function downloadDocuments() {
    openPrintDocument({
      eyebrow: "Student documents",
      title: `${profile.name} document pack`,
      subtitle: `${profile.admissionNumber} • ${profile.className}`,
      rows: profileDocuments.map((item) => ({
        label: item.label,
        value: item.value,
      })),
      footer: "This document summary can be printed or saved as PDF for the learner file.",
    });
  }

  return (
    <div className="space-y-6">
      <SchoolPageHeader
        eyebrow="Student profile"
        title={profile.name}
        description={`${profile.admissionNumber} • ${profile.className} • Parent ${profile.parentName} (${profile.parentPhone})`}
        actions={
          <Button variant="secondary" onClick={downloadDocuments}>
            Download documents
          </Button>
        }
      />
      <MetricGrid
        items={profile.metrics.map((metric) => ({
          id: metric.id,
          label: metric.label,
          value: metric.value,
          helper: metric.helper,
        }))}
      />
      <Tabs
        items={[
          {
            id: "overview",
            label: "Overview",
            panel: (
              <div className="grid gap-6 lg:grid-cols-2">
                <SimpleListCard
                  title="Learner snapshot"
                  subtitle="The essentials principals and admins usually confirm first."
                  items={[
                    { id: "balance", title: "Current balance", subtitle: "What is still outstanding this term", value: profile.balance, tone: profile.balanceTone },
                    { id: "parent", title: "Parent contact", subtitle: profile.parentName, value: profile.parentPhone },
                    { id: "class", title: "Class placement", subtitle: profile.className, value: profile.admissionNumber },
                  ]}
                />
                <SimpleListCard
                  title="Overview actions"
                  subtitle="Fast follow-up actions for this learner."
                  items={[
                    { id: "call", title: "Call parent", subtitle: "Discuss attendance or balances", value: "Available" },
                    { id: "fee", title: "Open fee statement", subtitle: "Prepare a printable account view", value: "Ready" },
                    { id: "academics", title: "Open report card", subtitle: "See current performance and comments", value: "Current" },
                  ]}
                />
              </div>
            ),
          },
          {
            id: "fees",
            label: "Fees",
            panel: (
              <div className="space-y-6">
                <DataTable
                  title="Fee structure"
                  columns={[
                    { id: "item", header: "Item", render: (row) => row.item },
                    { id: "frequency", header: "Frequency", render: (row) => row.frequency },
                    { id: "amount", header: "Amount", render: (row) => row.amount, className: "text-right font-semibold", headerClassName: "text-right" },
                  ]}
                  rows={profile.feeStructure}
                  getRowKey={(row) => row.id}
                />
                <DataTable
                  title="Payment history"
                  columns={[
                    { id: "date", header: "Date", render: (row) => row.date },
                    { id: "method", header: "Method", render: (row) => row.method },
                    { id: "reference", header: "Reference", render: (row) => row.reference },
                    { id: "amount", header: "Amount", render: (row) => row.amount, className: "text-right font-semibold", headerClassName: "text-right" },
                    { id: "status", header: "Status", render: (row) => <StatusPill label={row.status} tone={row.statusTone} /> },
                  ]}
                  rows={profile.paymentHistory}
                  getRowKey={(row) => row.id}
                />
              </div>
            ),
          },
          {
            id: "attendance",
            label: "Attendance",
            panel: (
              <DataTable
                title="Attendance record"
                columns={[
                  { id: "date", header: "Date", render: (row) => row.date },
                  { id: "status", header: "Status", render: (row) => <StatusPill label={row.status} tone={row.statusTone} /> },
                  { id: "note", header: "Note", render: (row) => row.note },
                ]}
                rows={profile.attendance}
                getRowKey={(row) => row.id}
              />
            ),
          },
          {
            id: "academics",
            label: "Academics",
            panel: (
              <DataTable
                title="Academic performance"
                columns={[
                  { id: "subject", header: "Subject", render: (row) => row.subject },
                  { id: "teacher", header: "Teacher", render: (row) => row.teacher },
                  { id: "average", header: "Average", render: (row) => row.average, className: "text-right font-semibold", headerClassName: "text-right" },
                  { id: "grade", header: "Grade", render: (row) => row.grade },
                ]}
                rows={profile.academics}
                getRowKey={(row) => row.id}
              />
            ),
          },
          {
            id: "discipline",
            label: "Discipline",
            panel: (
              <SimpleListCard
                title="Discipline"
                subtitle="This space keeps pastoral notes calm and searchable."
                items={[
                  { id: "discipline-1", title: "No active discipline incidents", subtitle: "Learner has no unresolved concerns on file." },
                ]}
              />
            ),
          },
          {
            id: "documents",
            label: "Documents",
            panel: (
              <SimpleListCard
                title="Documents"
                subtitle="Files linked to admission, transfers, and medical notes."
                items={[
                  { id: "doc-1", title: "Admission form", subtitle: "Uploaded and verified by admin office", value: "PDF" },
                  { id: "doc-2", title: "Guardian consent", subtitle: "Stored with learner registration", value: "PDF" },
                ]}
              />
            ),
          },
        ]}
      />
    </div>
  );
}

function SchoolFinancePage({
  role,
  tenantSlug,
  routeMode,
}: {
  role: SchoolExperienceRole;
  tenantSlug?: string | null;
  routeMode: SchoolRouteMode;
}) {
  const { model, subscription } = getSchoolWorkspace(role, tenantSlug);
  const [rows, setRows] = useState(model.finance.rows);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [invoiceDraft, setInvoiceDraft] = useState({ studentName: "", amount: "" });
  const [paymentDraft, setPaymentDraft] = useState({
    studentName: "",
    amount: "",
    reference: "",
  });
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [financeMessage, setFinanceMessage] = useState<string | null>(null);

  function openInvoiceModal() {
    setInvoiceDraft({ studentName: "", amount: "" });
    setInvoiceError(null);
    setShowInvoiceModal(true);
  }

  function closeInvoiceModal() {
    setShowInvoiceModal(false);
    setInvoiceError(null);
  }

  function openPaymentModal() {
    setPaymentDraft({ studentName: "", amount: "", reference: "" });
    setPaymentError(null);
    setShowPaymentModal(true);
  }

  function closePaymentModal() {
    setShowPaymentModal(false);
    setPaymentError(null);
  }

  function saveInvoice() {
    const validationError = getMissingFieldError([
      { label: "Student", value: invoiceDraft.studentName },
      { label: "Amount", value: invoiceDraft.amount },
    ]);
    const parsedAmount = parsePositiveAmount(invoiceDraft.amount);

    if (validationError) {
      setInvoiceError(validationError);
      return;
    }

    if (parsedAmount === null) {
      setInvoiceError("Amount must be a number greater than zero.");
      return;
    }

    setRows((currentRows) => [
      {
        id: `invoice-${Date.now()}`,
        student: invoiceDraft.studentName.trim(),
        amount: formatKesAmount(parsedAmount),
        method: "Invoice",
        date: "Queued now",
        reference: `INV-${Date.now().toString().slice(-6)}`,
        status: "Pending",
        statusTone: "warning",
      },
      ...currentRows,
    ]);
    setInvoiceError(null);
    setFinanceMessage(`Invoice created for ${invoiceDraft.studentName.trim()}.`);
    setInvoiceDraft({ studentName: "", amount: "" });
    setShowInvoiceModal(false);
  }

  function savePayment() {
    const validationError = getMissingFieldError([
      { label: "Student", value: paymentDraft.studentName },
      { label: "Amount", value: paymentDraft.amount },
      { label: "Reference", value: paymentDraft.reference },
    ]);
    const parsedAmount = parsePositiveAmount(paymentDraft.amount);

    if (validationError) {
      setPaymentError(validationError);
      return;
    }

    if (parsedAmount === null) {
      setPaymentError("Amount must be a number greater than zero.");
      return;
    }

    setRows((currentRows) => [
      {
        id: `payment-${Date.now()}`,
        student: paymentDraft.studentName.trim(),
        amount: formatKesAmount(parsedAmount),
        method: "Manual entry",
        date: "Posted now",
        reference: paymentDraft.reference.trim(),
        status: "Matched",
        statusTone: "ok",
      },
      ...currentRows,
    ]);
    setPaymentError(null);
    setFinanceMessage(`Payment recorded for ${paymentDraft.studentName.trim()}.`);
    setPaymentDraft({ studentName: "", amount: "", reference: "" });
    setShowPaymentModal(false);
  }

  return (
    <div className="space-y-6">
      <SchoolPageHeader
        eyebrow="Fees and payments"
        title="Collections workspace"
        description="Record payments, generate statements, and keep balances obvious enough for bursars and admins to trust instantly."
        actions={
          <>
            <Button variant="secondary" onClick={openInvoiceModal}>
              Create invoice
            </Button>
            <Button onClick={openPaymentModal}>Record payment</Button>
          </>
        }
      />
      {financeMessage ? (
        <div
          aria-live="polite"
          className="rounded-xl border border-success/20 bg-success/10 px-4 py-3 text-sm text-foreground"
        >
          {financeMessage}
        </div>
      ) : null}
      <MetricGrid
        items={model.finance.summary.map((item) => ({
          id: item.id,
          label: item.label,
          value: item.value,
          helper: item.helper,
        }))}
      />
      <SubscriptionLifecyclePanel subscription={subscription} role={role} routeMode={routeMode} />
      <DataTable
        title="Payment history"
        subtitle="This term's collections and references, ready for statements or reversals."
        columns={[
          { id: "student", header: "Student", render: (row) => row.student },
          { id: "amount", header: "Amount", render: (row) => row.amount, className: "text-right font-semibold", headerClassName: "text-right" },
          { id: "method", header: "Method", render: (row) => row.method },
          { id: "date", header: "Date", render: (row) => row.date },
          { id: "reference", header: "Reference", render: (row) => row.reference },
          { id: "status", header: "Status", render: (row) => <StatusPill label={row.status} tone={row.statusTone} /> },
        ]}
        rows={rows}
        getRowKey={(row) => row.id}
      />
      <Modal
        open={showInvoiceModal}
        title="Create invoice"
        description="Generate a new fee invoice that appears in the collections workspace immediately."
        onClose={closeInvoiceModal}
        footer={
          <>
            <Button variant="secondary" onClick={closeInvoiceModal}>
              Cancel
            </Button>
            <Button onClick={saveInvoice}>Create invoice</Button>
          </>
        }
      >
        <div className="space-y-4">
          {invoiceError ? (
            <div role="alert" className="rounded-xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-foreground">
              {invoiceError}
            </div>
          ) : null}
          <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-sm text-foreground">
            <span className="font-medium">Student</span>
            <input
              aria-label="Invoice student"
              value={invoiceDraft.studentName}
              onChange={(event) => {
                setInvoiceDraft((current) => ({ ...current, studentName: event.target.value }));
                setInvoiceError(null);
              }}
              className="input-base"
              placeholder="Mercy Atieno"
            />
          </label>
          <label className="space-y-2 text-sm text-foreground">
            <span className="font-medium">Amount</span>
            <input
              aria-label="Invoice amount"
              value={invoiceDraft.amount}
              onChange={(event) => {
                setInvoiceDraft((current) => ({ ...current, amount: event.target.value }));
                setInvoiceError(null);
              }}
              className="input-base"
              inputMode="numeric"
              placeholder="18500"
            />
          </label>
        </div>
        </div>
      </Modal>
      <Modal
        open={showPaymentModal}
        title="Record payment"
        description="Post a payment reference straight into the fee history ledger."
        onClose={closePaymentModal}
        footer={
          <>
            <Button variant="secondary" onClick={closePaymentModal}>
              Cancel
            </Button>
            <Button onClick={savePayment}>Save payment</Button>
          </>
        }
      >
        <div className="space-y-4">
          {paymentError ? (
            <div role="alert" className="rounded-xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-foreground">
              {paymentError}
            </div>
          ) : null}
          <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-sm text-foreground">
            <span className="font-medium">Student</span>
            <input
              aria-label="Payment student"
              value={paymentDraft.studentName}
              onChange={(event) => {
                setPaymentDraft((current) => ({ ...current, studentName: event.target.value }));
                setPaymentError(null);
              }}
              className="input-base"
              placeholder="Mercy Atieno"
            />
          </label>
          <label className="space-y-2 text-sm text-foreground">
            <span className="font-medium">Amount</span>
            <input
              aria-label="Payment amount"
              value={paymentDraft.amount}
              onChange={(event) => {
                setPaymentDraft((current) => ({ ...current, amount: event.target.value }));
                setPaymentError(null);
              }}
              className="input-base"
              inputMode="numeric"
              placeholder="18500"
            />
          </label>
          <label className="space-y-2 text-sm text-foreground md:col-span-2">
            <span className="font-medium">Reference</span>
            <input
              aria-label="Payment reference"
              value={paymentDraft.reference}
              onChange={(event) => {
                setPaymentDraft((current) => ({ ...current, reference: event.target.value }));
                setPaymentError(null);
              }}
              className="input-base"
              placeholder="SMX82KQ4"
            />
          </label>
        </div>
        </div>
      </Modal>
    </div>
  );
}

function SchoolMpesaPage({
  role,
  tenantSlug,
}: {
  role: SchoolExperienceRole;
  tenantSlug?: string | null;
}) {
  const { model } = getSchoolWorkspace(role, tenantSlug);
  const [rows, setRows] = useState(model.mpesa.rows);
  const [showReconcileModal, setShowReconcileModal] = useState(false);
  const [receiptCode, setReceiptCode] = useState(model.mpesa.rows[0]?.code ?? "");
  const [matchedStudent, setMatchedStudent] = useState(model.mpesa.rows[0]?.matchedStudent ?? "");
  const [reconcileError, setReconcileError] = useState<string | null>(null);
  const [reconcileMessage, setReconcileMessage] = useState<string | null>(null);

  function openReconcileModal() {
    setReceiptCode(rows[0]?.code ?? "");
    setMatchedStudent(rows[0]?.matchedStudent ?? "");
    setReconcileError(null);
    setShowReconcileModal(true);
  }

  function closeReconcileModal() {
    setShowReconcileModal(false);
    setReconcileError(null);
  }

  function saveReconciliation() {
    const validationError = getMissingFieldError([
      { label: "Receipt code", value: receiptCode },
      { label: "Matched learner", value: matchedStudent },
    ]);
    const normalizedReceiptCode = receiptCode.trim();
    const normalizedStudent = matchedStudent.trim();

    if (validationError) {
      setReconcileError(validationError);
      return;
    }

    if (!rows.some((row) => row.code === normalizedReceiptCode)) {
      setReconcileError("Receipt code was not found in the current MPESA queue.");
      return;
    }

    setRows((currentRows) =>
      currentRows.map((row) =>
        row.code === normalizedReceiptCode
          ? {
              ...row,
              status: "Matched",
              statusTone: "ok",
              matchedStudent: normalizedStudent,
            }
          : row,
      ),
    );
    setReconcileError(null);
    setReconcileMessage(`${normalizedReceiptCode} matched to ${normalizedStudent}.`);
    setShowReconcileModal(false);
  }

  return (
    <div className="space-y-6">
      <SchoolPageHeader
        eyebrow="MPESA"
        title="Mobile money reconciliation"
        description="Handle auto-matching, manual review, callback confidence, and duplicate detection from one focused page."
        actions={<Button onClick={openReconcileModal}>Manual reconcile</Button>}
      />
      {reconcileMessage ? (
        <div
          aria-live="polite"
          className="rounded-xl border border-success/20 bg-success/10 px-4 py-3 text-sm text-foreground"
        >
          {reconcileMessage}
        </div>
      ) : null}
      <MetricGrid
        items={model.mpesa.summary.map((item) => ({
          id: item.id,
          label: item.label,
          value: item.value,
          helper: item.helper,
        }))}
      />
      <DataTable
        title="MPESA transactions"
        subtitle="Phone, amount, receipt code, status, and matched learner."
        columns={[
          { id: "phone", header: "Phone", render: (row) => row.phone },
          { id: "amount", header: "Amount", render: (row) => row.amount, className: "text-right font-semibold", headerClassName: "text-right" },
          { id: "code", header: "Code", render: (row) => row.code },
          { id: "status", header: "Status", render: (row) => <StatusPill label={row.status} tone={row.statusTone} /> },
          { id: "matchedStudent", header: "Matched Student", render: (row) => row.matchedStudent },
          { id: "receivedAt", header: "Received", render: (row) => row.receivedAt },
        ]}
        rows={rows}
        getRowKey={(row) => row.id}
      />
      <Modal
        open={showReconcileModal}
        title="Manual reconcile"
        description="Confirm the payment code and learner before updating the MPESA match state."
        onClose={closeReconcileModal}
        footer={
          <>
            <Button variant="secondary" onClick={closeReconcileModal}>
              Cancel
            </Button>
            <Button onClick={saveReconciliation}>Save match</Button>
          </>
        }
      >
        <div className="space-y-4">
          {reconcileError ? (
            <div role="alert" className="rounded-xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-foreground">
              {reconcileError}
            </div>
          ) : null}
          <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-sm text-foreground">
            <span className="font-medium">Receipt code</span>
            <input
              aria-label="Receipt code"
              value={receiptCode}
              onChange={(event) => {
                setReceiptCode(event.target.value);
                setReconcileError(null);
              }}
              className="input-base"
              placeholder="SMX82KQ4"
            />
          </label>
          <label className="space-y-2 text-sm text-foreground">
            <span className="font-medium">Matched learner</span>
            <input
              aria-label="Matched learner"
              value={matchedStudent}
              onChange={(event) => {
                setMatchedStudent(event.target.value);
                setReconcileError(null);
              }}
              className="input-base"
              placeholder="Mercy Atieno"
            />
          </label>
        </div>
        </div>
      </Modal>
    </div>
  );
}

function SchoolAttendancePage({
  role,
  tenantSlug,
}: {
  role: SchoolExperienceRole;
  tenantSlug?: string | null;
}) {
  const { model } = getSchoolWorkspace(role, tenantSlug);

  return (
    <div className="space-y-6">
      <SchoolPageHeader
        eyebrow="Attendance"
        title="Daily attendance"
        description="Simple, fast marking with enough summary to spot unmarked classes or absent learners immediately."
        actions={<StatusPill label={`Marked ${model.attendance.dateLabel}`} tone="ok" />}
      />
      <MetricGrid
        items={model.attendance.summary.map((item) => ({
          id: item.id,
          label: item.label,
          value: item.value,
          helper: item.helper,
        }))}
      />
      <DataTable
        title={`Roll call • ${model.attendance.dateLabel}`}
        subtitle="Toggle present or absent and keep offline-safe work clear."
        columns={[
          { id: "student", header: "Student", render: (row) => row.student },
          { id: "className", header: "Class", render: (row) => row.className },
          { id: "state", header: "Status", render: (row) => <StatusPill label={row.state} tone={row.state === "present" ? "ok" : "warning"} /> },
          { id: "synced", header: "Sync", render: (row) => <StatusPill label={row.synced} tone={row.synced} /> },
        ]}
        rows={model.attendance.rows}
        getRowKey={(row) => row.id}
      />
    </div>
  );
}

function SchoolAcademicsPage({
  role,
  tenantSlug,
}: {
  role: SchoolExperienceRole;
  tenantSlug?: string | null;
}) {
  const { model } = getSchoolWorkspace(role, tenantSlug);

  return (
    <div className="space-y-6">
      <SchoolPageHeader
        eyebrow="Academics"
        title="CBC academics"
        description="Marks entry, subject oversight, report cards, and classroom performance in a structure that feels familiar to schools."
      />
      <MetricGrid
        items={model.academics.summary.map((item) => ({
          id: item.id,
          label: item.label,
          value: item.value,
          helper: item.helper,
        }))}
      />
      <Tabs
        items={[
          {
            id: "subjects",
            label: "Subjects",
            panel: (
              <DataTable
                columns={[
                  { id: "subject", header: "Subject", render: (row) => row.subject },
                  { id: "teacher", header: "Teacher", render: (row) => row.teacher },
                  { id: "className", header: "Class", render: (row) => row.className },
                  { id: "average", header: "Average", render: (row) => row.average, className: "text-right font-semibold", headerClassName: "text-right" },
                ]}
                rows={model.academics.subjects}
                getRowKey={(row) => row.id}
              />
            ),
          },
          {
            id: "marks",
            label: "Marks entry",
            panel: (
              <DataTable
                columns={[
                  { id: "student", header: "Student", render: (row) => row.student },
                  { id: "english", header: "English", render: (row) => row.english, className: "text-right", headerClassName: "text-right" },
                  { id: "maths", header: "Maths", render: (row) => row.maths, className: "text-right", headerClassName: "text-right" },
                  { id: "science", header: "Science", render: (row) => row.science, className: "text-right", headerClassName: "text-right" },
                  { id: "socialStudies", header: "SST", render: (row) => row.socialStudies, className: "text-right", headerClassName: "text-right" },
                ]}
                rows={model.academics.marks}
                getRowKey={(row) => row.id}
              />
            ),
          },
          {
            id: "report-cards",
            label: "Report cards",
            panel: (
              <DataTable
                columns={[
                  { id: "learner", header: "Learner", render: (row) => row.learner },
                  { id: "className", header: "Class", render: (row) => row.className },
                  { id: "reportType", header: "Report", render: (row) => row.reportType },
                  { id: "status", header: "Status", render: (row) => <StatusPill label={row.status} tone={row.statusTone} /> },
                ]}
                rows={model.academics.reports}
                getRowKey={(row) => row.id}
              />
            ),
          },
        ]}
      />
    </div>
  );
}

function SchoolReportsPage({
  role,
  tenantSlug,
}: {
  role: SchoolExperienceRole;
  tenantSlug?: string | null;
}) {
  const { model } = getSchoolWorkspace(role, tenantSlug);

  function exportReportCatalog() {
    downloadCsvFile({
      filename: "school-reports.csv",
      headers: ["Report", "Description"],
      rows: model.reports.reports.map((report) => [report.title, report.description]),
    });
  }

  function printReportSummary(title: string, description: string) {
    openPrintDocument({
      eyebrow: "School reports",
      title,
      subtitle: description,
      rows: model.reports.summary.map((item) => ({
        label: item.label,
        value: item.value,
      })),
      footer: "Print this summary or save it as PDF from your browser print dialog.",
    });
  }

  return (
    <div className="space-y-6">
      <SchoolPageHeader
        eyebrow="Reports"
        title="Reports and exports"
        description="Print fee statements, payment summaries, report cards, and attendance exports without hunting through the system."
        actions={
          <>
            <Button variant="secondary" onClick={exportReportCatalog}>
              Export Excel
            </Button>
            <Button onClick={() => printReportSummary("School reports overview", "Operational reporting summary for the current workspace.")}>
              Print report
            </Button>
          </>
        }
      />
      <MetricGrid
        items={model.reports.summary.map((item) => ({
          id: item.id,
          label: item.label,
          value: item.value,
          helper: item.helper,
        }))}
      />
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {model.reports.reports.map((report) => {
          const Icon = report.icon;
          return (
            <Card key={report.id} className="p-5">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-foreground">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 text-lg font-semibold text-foreground">{report.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted">{report.description}</p>
              <div className="mt-5 flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => printReportSummary(report.title, report.description)}
                >
                  Print
                </Button>
                <Button
                  size="sm"
                  onClick={() =>
                    downloadTextFile({
                      filename: `${report.id}.txt`,
                      content: `${report.title}\n\n${report.description}`,
                    })
                  }
                >
                  Export PDF
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function SchoolCommunicationPage({
  role,
  tenantSlug,
}: {
  role: SchoolExperienceRole;
  tenantSlug?: string | null;
}) {
  const { model } = getSchoolWorkspace(role, tenantSlug);
  const [history, setHistory] = useState(model.communication.history);
  const [showSmsModal, setShowSmsModal] = useState(false);
  const [audience, setAudience] = useState("All parents");
  const [message, setMessage] = useState("");
  const [smsError, setSmsError] = useState<string | null>(null);
  const [smsMessage, setSmsMessage] = useState<string | null>(null);

  function openSmsModal() {
    setAudience("All parents");
    setMessage("");
    setSmsError(null);
    setShowSmsModal(true);
  }

  function closeSmsModal() {
    setShowSmsModal(false);
    setSmsError(null);
  }

  function sendSms() {
    const validationError = getMissingFieldError([
      { label: "Audience", value: audience },
      { label: "Message", value: message },
    ]);

    if (validationError) {
      setSmsError(validationError);
      return;
    }

    const trimmedAudience = audience.trim();
    const trimmedMessage = message.trim();

    setHistory((currentRows) => [
      {
        id: `sms-${Date.now()}`,
        audience: trimmedAudience,
        message: trimmedMessage,
        sentAt: "Sent now",
        status: "Delivered",
        statusTone: "ok",
      },
      ...currentRows,
    ]);
    setSmsError(null);
    setSmsMessage(`SMS sent to ${trimmedAudience}.`);
    setMessage("");
    setShowSmsModal(false);
  }

  return (
    <div className="space-y-6">
      <SchoolPageHeader
        eyebrow="Communication"
        title="School messaging"
        description="Announcements, fee reminders, class updates, and SMS history in one straightforward workspace."
        actions={<Button onClick={openSmsModal}>Send SMS</Button>}
      />
      {smsMessage ? (
        <div
          aria-live="polite"
          className="rounded-xl border border-success/20 bg-success/10 px-4 py-3 text-sm text-foreground"
        >
          {smsMessage}
        </div>
      ) : null}
      <MetricGrid
        items={model.communication.summary.map((item) => ({
          id: item.id,
          label: item.label,
          value: item.value,
          helper: item.helper,
        }))}
      />
      <DataTable
        title="SMS history"
        subtitle="Messages already sent to all parents, class groups, or balance follow-up lists."
        columns={[
          { id: "audience", header: "Audience", render: (row) => row.audience },
          { id: "message", header: "Message", render: (row) => row.message },
          { id: "sentAt", header: "Sent", render: (row) => row.sentAt },
          { id: "status", header: "Status", render: (row) => <StatusPill label={row.status} tone={row.statusTone} /> },
        ]}
        rows={history}
        getRowKey={(row) => row.id}
      />
      <Modal
        open={showSmsModal}
        title="Send SMS"
        description="Compose a school message and add it to the delivered communication log."
        onClose={closeSmsModal}
        footer={
          <>
            <Button variant="secondary" onClick={closeSmsModal}>
              Cancel
            </Button>
            <Button onClick={sendSms}>Send SMS</Button>
          </>
        }
      >
        <div className="space-y-4">
          {smsError ? (
            <div role="alert" className="rounded-xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-foreground">
              {smsError}
            </div>
          ) : null}
          <label className="space-y-2 text-sm text-foreground">
            <span className="font-medium">Audience</span>
            <input
              aria-label="Audience"
              value={audience}
              onChange={(event) => {
                setAudience(event.target.value);
                setSmsError(null);
              }}
              className="input-base"
              placeholder="All parents"
            />
          </label>
          <label className="space-y-2 text-sm text-foreground">
            <span className="font-medium">Message</span>
            <textarea
              aria-label="Message"
              value={message}
              onChange={(event) => {
                setMessage(event.target.value);
                setSmsError(null);
              }}
              className="input-base min-h-28"
              placeholder="Fee reminder or school notice"
            />
          </label>
        </div>
      </Modal>
    </div>
  );
}

function SchoolBasicCardPage({
  eyebrow,
  title,
  description,
  items,
}: {
  eyebrow: string;
  title: string;
  description: string;
  items: Array<{ id: string; title: string; subtitle: string; value?: string }>;
}) {
  return (
    <div className="space-y-6">
      <SchoolPageHeader eyebrow={eyebrow} title={title} description={description} />
      <SimpleListCard title={title} subtitle={description} items={items} />
    </div>
  );
}

export function SchoolPages({
  role,
  section = "dashboard",
  studentId,
  tenantSlug,
  routeMode = "hosted",
}: {
  role: SchoolExperienceRole;
  section?: string;
  studentId?: string;
  tenantSlug?: string | null;
  routeMode?: SchoolRouteMode;
}) {
  const workspace = getSchoolWorkspace(role, tenantSlug);
  const { navItems, profile, branding } = workspace;
  const activeHref = studentId
    ? buildSchoolSectionHref(role, "students", routeMode)
    : section === "dashboard"
      ? buildSchoolSectionHref(role, "dashboard", routeMode)
      : buildSchoolSectionHref(
          role,
          section as Parameters<typeof toSchoolPath>[0],
          routeMode,
        );
  const scopedNavItems = navItems.map((item) => ({
    ...item,
    href: mapSchoolHref(role, item.href, routeMode),
  }));
  const notifications: ExperienceNotificationItem[] = [
    {
      id: "subscription-renewal",
      title: workspace.subscription.statusLabel,
      detail: workspace.subscription.detail,
      timeLabel: "billing",
      tone: workspace.subscription.tone,
      href: mapSchoolHref(role, workspace.subscription.primaryActionHref, routeMode),
    },
    ...workspace.snapshot.notifications.slice(0, 3).map(
      (item): ExperienceNotificationItem => ({
        id: item.id,
        title: item.title,
        detail: `${item.severity.toUpperCase()} notification`,
        timeLabel: item.timeLabel,
        tone: item.severity === "critical" ? "critical" : item.severity === "warning" ? "warning" : "ok",
        href: buildSchoolSectionHref(role, "reports", routeMode),
      }),
    ),
  ];

  return (
    <ErpShell
      brand={{
        title: branding.shortName,
        subtitle: `${branding.county} school ERP`,
      }}
      navItems={scopedNavItems}
      activeHref={activeHref}
      topLabel={`${branding.name} school ERP`}
      title={schoolSectionLabels[section] ?? "Dashboard"}
      subtitle={`Built for ${branding.name}: clear balances, familiar school workflows, and direct actions for non-technical teams.`}
      status={{ label: "Tenant isolated", tone: "ok" }}
      profile={profile}
      notifications={notifications}
      actions={
        <StatusPill
          label={`${workspace.model.currentTerm} • ${workspace.model.academicYear}`}
          tone="ok"
        />
      }
    >
      {studentId ? <StudentProfilePage role={role} tenantSlug={tenantSlug} studentId={studentId} /> : null}
      {!studentId && section === "dashboard" ? <SchoolDashboardHome role={role} tenantSlug={tenantSlug} routeMode={routeMode} /> : null}
      {!studentId && section === "students" ? <SchoolStudentsPage role={role} tenantSlug={tenantSlug} routeMode={routeMode} /> : null}
      {!studentId && section === "finance" ? <SchoolFinancePage role={role} tenantSlug={tenantSlug} routeMode={routeMode} /> : null}
      {!studentId && section === "mpesa" ? <SchoolMpesaPage role={role} tenantSlug={tenantSlug} /> : null}
      {!studentId && section === "attendance" ? <SchoolAttendancePage role={role} tenantSlug={tenantSlug} /> : null}
      {!studentId && section === "academics" ? <SchoolAcademicsPage role={role} tenantSlug={tenantSlug} /> : null}
      {!studentId && section === "reports" ? <SchoolReportsPage role={role} tenantSlug={tenantSlug} /> : null}
      {!studentId && section === "communication" ? <SchoolCommunicationPage role={role} tenantSlug={tenantSlug} /> : null}
      {!studentId && section === "exams" ? (
        <SchoolBasicCardPage
          eyebrow="Exams"
          title="Exam operations"
          description="Timelines, invigilation readiness, and exam-room preparation in a calm operational view."
          items={[
            { id: "exam-1", title: "Mid-term CAT", subtitle: "Starts Monday across Grade 4–9", value: "5 days" },
            { id: "exam-2", title: "Invigilation rota", subtitle: "Teachers allocated and awaiting principal confirmation", value: "Draft" },
            { id: "exam-3", title: "CBC moderation", subtitle: "Science and Maths papers need moderation", value: "2 queues" },
          ]}
        />
      ) : null}
      {!studentId && section === "timetable" ? (
        <SchoolBasicCardPage
          eyebrow="Timetable"
          title="Timetable coordination"
          description="Class streams, teacher cover, and room availability without clutter."
          items={[
            { id: "time-1", title: "Grade 7 Hope", subtitle: "Maths • Mr. Otieno • Room 4", value: "08:00" },
            { id: "time-2", title: "Grade 5 Joy", subtitle: "English • Ms. Njoroge • Room 2", value: "09:10" },
            { id: "time-3", title: "Cover needed", subtitle: "Science practical facilitator absent", value: "Action" },
          ]}
        />
      ) : null}
      {!studentId && section === "staff" ? (
        <SchoolBasicCardPage
          eyebrow="Staff"
          title="Staff operations"
          description="Teachers, office staff, and operational ownership at a glance."
          items={[
            { id: "staff-1", title: "Teaching staff", subtitle: "27 teachers active this term", value: "27" },
            { id: "staff-2", title: "Admin coverage", subtitle: "Front office and bursary both staffed today", value: "Ready" },
            { id: "staff-3", title: "Leave requests", subtitle: "Two pending approvals this week", value: "2" },
          ]}
        />
      ) : null}
      {!studentId && section === "inventory" ? (
        <SchoolBasicCardPage
          eyebrow="Inventory"
          title="Inventory control"
          description="Simple operational inventory for books, lab items, and consumables."
          items={[
            { id: "inv-1", title: "Exercise books", subtitle: "Store balance looks healthy for the month", value: "1,240" },
            { id: "inv-2", title: "Science kits", subtitle: "Three kits need replenishment before exams", value: "Low" },
            { id: "inv-3", title: "Printer paper", subtitle: "Stock supports current report-card run", value: "OK" },
          ]}
        />
      ) : null}
      {!studentId && section === "settings" ? (
        <div className="space-y-6">
          <SchoolPageHeader
            eyebrow="Settings"
            title="School settings"
            description="School profile, fee structure, and user management in one trusted admin area."
          />
          <div className="grid gap-6 lg:grid-cols-3">
            <DataTable
              title="School profile"
              columns={[
                { id: "label", header: "Field", render: (row) => row.label },
                { id: "value", header: "Value", render: (row) => row.value },
              ]}
              rows={workspace.model.settings.schoolProfile}
              getRowKey={(row) => row.id}
            />
            <DataTable
              title="Fee structure"
              columns={[
                { id: "item", header: "Item", render: (row) => row.item },
                { id: "frequency", header: "Frequency", render: (row) => row.frequency },
                { id: "amount", header: "Amount", render: (row) => row.amount, className: "text-right font-semibold", headerClassName: "text-right" },
              ]}
              rows={workspace.model.settings.feeStructure}
              getRowKey={(row) => row.id}
            />
            <DataTable
              title="Users"
              columns={[
                { id: "name", header: "User", render: (row) => row.name },
                { id: "role", header: "Role", render: (row) => row.role },
                { id: "phone", header: "Phone", render: (row) => row.phone },
                { id: "status", header: "Status", render: (row) => <StatusPill label={row.status} tone={row.statusTone} /> },
              ]}
              rows={workspace.model.settings.users}
              getRowKey={(row) => row.id}
            />
          </div>
        </div>
      ) : null}
    </ErpShell>
  );
}

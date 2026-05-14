"use client";

import { useMemo, useState } from "react";
import {
  ArrowRight,
  BookOpenCheck,
  CircleDollarSign,
  FileSpreadsheet,
  Filter,
  MessageSquareText,
  Printer,
  Search,
  Send,
  ShieldCheck,
  SmartphoneCharging,
  UserPlus,
  Users,
} from "lucide-react";
import Link from "next/link";

import { AcademicsWidget } from "@/components/dashboard/academics-widget";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { AlertsPanel } from "@/components/dashboard/alerts-panel";
import { KpiCards } from "@/components/dashboard/kpi-cards";
import { AdmissionsDashboardHome } from "@/components/modules/admissions/admissions-dashboard-home";
import { AdmissionsModuleScreen } from "@/components/modules/admissions/admissions-module-screen";
import { InventoryDashboardHome } from "@/components/modules/inventory/inventory-dashboard-home";
import { InventoryModuleScreen } from "@/components/modules/inventory/inventory-module-screen";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { Card } from "@/components/ui/card";
import { Button, buttonClasses } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { Tabs } from "@/components/ui/tabs";
import {
  buildSchoolErpModel,
  type DashboardDefaulterRow,
  type DashboardMpesaRow,
  type FeeStructureRow,
  type FinancePaymentRow,
  type MarksEntryRow,
  type MpesaTransactionRow,
  type ReportCardRow,
  type SchoolErpModel,
  type SmsHistoryRow,
  type StudentProfileData,
  type StudentRow,
  type UserManagementRow,
} from "@/lib/dashboard/erp-model";
import {
  downloadCsvFile,
  openPrintDocument,
  type PrintableRow,
} from "@/lib/dashboard/export";
import type {
  DashboardRole,
  DashboardSnapshot,
  QuickActionItem,
} from "@/lib/dashboard/types";
import { isProductionReadyModule } from "@/lib/features/module-readiness";

function SummaryCards({
  items,
}: {
  items: Array<{ id: string; label: string; value: string; helper: string }>;
}) {
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <Card key={item.id} className="p-5">
          <p className="eyebrow">
            {item.label}
          </p>
          <p className="mt-3 metric-value">
            {item.value}
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">{item.helper}</p>
        </Card>
      ))}
    </section>
  );
}

function PrintableSheet({
  eyebrow,
  title,
  subtitle,
  rows,
  footer,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  rows: Array<{ id: string; label: string; value: string; tone?: "default" | "danger" }>;
  footer: string;
}) {
  return (
    <Card className="p-6">
      <div className="mx-auto max-w-2xl rounded-[var(--radius)] border border-border bg-white p-6 shadow-sm">
        <div className="border-b border-border pb-4">
          <p className="eyebrow">
            {eyebrow}
          </p>
          <h3 className="mt-2 metric-value-sm">{title}</h3>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">{subtitle}</p>
        </div>
        <div className="mt-5 space-y-3">
          {rows.map((row) => (
            <div
              key={row.id}
              className="flex items-center justify-between gap-4 border-b border-border/70 pb-3 last:border-b-0 last:pb-0"
            >
              <p className="text-sm text-foreground">{row.label}</p>
              <p
                className={`text-sm font-semibold ${
                  row.tone === "danger" ? "text-danger" : "text-foreground"
                }`}
              >
                {row.value}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-5 rounded-[var(--radius)] border border-border bg-surface-muted px-4 py-3">
          <p className="text-[13px] leading-relaxed text-muted">{footer}</p>
        </div>
      </div>
    </Card>
  );
}

function MpesaFeedCard({
  rows,
}: {
  rows: DashboardMpesaRow[];
}) {
  const columns: DataTableColumn<DashboardMpesaRow>[] = [
    {
      id: "student",
      header: "Student",
      render: (row) => <span className="font-semibold">{row.student}</span>,
    },
    {
      id: "amount",
      header: "Amount",
      className: "text-right font-semibold",
      headerClassName: "text-right",
      render: (row) => row.amount,
    },
    { id: "phone", header: "Phone", render: (row) => row.phone },
    { id: "code", header: "Code", render: (row) => row.code },
    {
      id: "status",
      header: "Status",
      render: (row) => <StatusPill label={row.status} tone={row.statusTone} />,
    },
  ];

  return (
    <div>
      <DataTable
        title="M-PESA feed"
        subtitle="Fresh transactions that bursars usually need to verify first."
        columns={columns}
        rows={rows}
        getRowKey={(row) => row.id}
      />
    </div>
  );
}

function DefaultersCard({
  rows,
}: {
  rows: DashboardDefaulterRow[];
}) {
  return (
    <Card className="p-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="eyebrow">
            Defaulters
          </p>
          <h3 className="mt-2 section-title text-lg">
            Students with balances
          </h3>
        </div>
        <Link
          href="/dashboard/admin/students"
          className="text-sm font-semibold text-accent"
        >
          View all
        </Link>
      </div>
      <div className="mt-4 space-y-3">
        {rows.map((row) => (
          <div
            key={row.id}
            className="flex items-center justify-between rounded-[var(--radius)] border border-border bg-surface-muted px-4 py-3"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{row.student}</p>
              <p className="mt-1 text-sm text-muted">{row.className}</p>
            </div>
            <p className="text-sm font-semibold text-danger">{row.balance}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function TeacherClassroomCard({
  snapshot,
}: {
  snapshot: DashboardSnapshot;
}) {
  return (
    <Card className="p-6">
      <p className="eyebrow">
        Classroom focus
      </p>
      <h3 className="mt-2 metric-value-sm">
        What needs attention this lesson?
      </h3>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-[var(--radius)] border border-border bg-surface-muted p-5">
          <p className="eyebrow">
            Grading queue
          </p>
          <p className="mt-3 metric-value">
            {snapshot.academics.gradingQueue}
          </p>
          <p className="mt-3 text-[13px] leading-relaxed text-muted">
            Moderate pending CBC submissions before the afternoon lessons begin.
          </p>
        </div>
        <div className="rounded-[var(--radius)] border border-border bg-surface-muted p-5">
          <p className="eyebrow">
            Next exam
          </p>
          <p className="mt-3 metric-value">
            {snapshot.academics.nextExam}
          </p>
          <p className="mt-3 text-[13px] leading-relaxed text-muted">
            Keep revision and classroom readiness visible without opening a second screen.
          </p>
        </div>
      </div>
    </Card>
  );
}

function ParentFamilyCard({
  profile,
}: {
  profile: StudentProfileData;
}) {
  return (
    <Card className="p-6">
      <p className="eyebrow">
        Child overview
      </p>
      <h3 className="mt-2 metric-value-sm">
        Family summary
      </h3>
      <p className="mt-3 text-[13px] leading-relaxed text-muted">
        Keep the learner, current balance, and the next likely parent action in one familiar view.
      </p>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-[var(--radius)] border border-border bg-surface-muted p-5">
          <p className="eyebrow">
            Learner
          </p>
          <p className="mt-3 metric-value-sm">
            {profile.name}
          </p>
          <p className="mt-2 text-sm text-muted">
            {profile.className}
          </p>
        </div>
        <div className="rounded-[var(--radius)] border border-border bg-surface-muted p-5">
          <p className="eyebrow">
            Balance
          </p>
          <div className="mt-3 flex items-center gap-3">
            <p className="metric-value-sm">
              {profile.balance}
            </p>
            <StatusPill label={profile.balance} tone={profile.balanceTone} />
          </div>
          <p className="mt-2 text-sm text-muted">
            Parent phone: {profile.parentPhone}
          </p>
        </div>
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/dashboard/parent/students"
          className={buttonClasses({ variant: "primary", size: "md" })}
        >
          View child summary
        </Link>
        <Link
          href="/dashboard/parent/finance"
          className={buttonClasses({ variant: "secondary", size: "md" })}
        >
          View fee details
        </Link>
      </div>
    </Card>
  );
}

function ParentUpdatesCard({
  snapshot,
}: {
  snapshot: DashboardSnapshot;
}) {
  return (
    <Card className="p-6">
      <p className="eyebrow">
        Family updates
      </p>
      <h3 className="mt-2 metric-value-sm">
        Keep up with school notices
      </h3>
      <div className="mt-6 space-y-3">
        {snapshot.notifications.slice(0, 3).map((notification) => (
          <Link
            key={notification.id}
            href={notification.href}
            className="flex items-center justify-between rounded-[var(--radius)] border border-border bg-surface-muted px-4 py-4 transition duration-150 hover:bg-surface-strong/70"
          >
            <div>
              <p className="text-sm font-semibold text-foreground">
                {notification.title}
              </p>
              <p className="mt-1 eyebrow">
                {notification.timeLabel}
              </p>
            </div>
            <StatusPill label={notification.severity} tone={notification.severity} />
          </Link>
        ))}
      </div>
    </Card>
  );
}

export function DashboardHome({
  role,
  snapshot,
  online,
  onAction,
}: {
  role: DashboardRole;
  snapshot: DashboardSnapshot;
  online: boolean;
  onAction: (action: QuickActionItem) => void;
}) {
  const model = useMemo(
    () => buildSchoolErpModel({ role, tenant: snapshot.tenant, online }),
    [online, role, snapshot.tenant],
  );
  const primaryProfile = model.studentProfiles[0];
  const isFinanceRole = role === "admin" || role === "bursar";
  const isTeacherRole = role === "teacher";
  const isStorekeeperRole = role === "storekeeper";
  const isAdmissionsRole = role === "admissions";
  const isParentRole = role === "parent";
  const academicsReady = isProductionReadyModule("academics");

  return (
    <div data-testid="dashboard-view" className="space-y-6">
      <div data-testid="alerts-section">
        <AlertsPanel alerts={snapshot.alerts} />
      </div>

      <div data-testid="kpi-section">
        <KpiCards cards={model.dashboard.kpis} />
      </div>

      <div data-testid="quick-actions-section">
        <QuickActions
          actions={snapshot.quickActions}
          online={online}
          role={role}
          onAction={onAction}
        />
      </div>

      {isFinanceRole ? (
        <section data-testid="core-widgets" className="grid gap-6 xl:grid-cols-12">
          <div data-testid="core-widget" className="xl:col-span-7">
            <MpesaFeedCard rows={model.dashboard.mpesaFeed} />
          </div>
          <div className="space-y-6 xl:col-span-5">
            <div data-testid="context-section">
              <DefaultersCard rows={model.dashboard.defaulters} />
            </div>
            <div data-testid="activity-feed-section">
              <ActivityFeed items={snapshot.activityFeed} />
            </div>
          </div>
        </section>
      ) : isTeacherRole ? (
        <>
          {academicsReady ? (
            <section data-testid="core-widgets" className="grid gap-6 xl:grid-cols-12">
              <div data-testid="core-widget" className="xl:col-span-12">
                <AcademicsWidget
                  data={snapshot.academics}
                  href="/dashboard/teacher/academics"
                />
              </div>
            </section>
          ) : null}

          <div data-testid="context-section">
            <TeacherClassroomCard snapshot={snapshot} />
          </div>

          <div data-testid="activity-feed-section">
            <ActivityFeed items={snapshot.activityFeed} />
          </div>
        </>
        ) : isStorekeeperRole ? (
          <InventoryDashboardHome />
        ) : isAdmissionsRole ? (
          <AdmissionsDashboardHome />
        ) : isParentRole && primaryProfile ? (
          <>
            <section data-testid="core-widgets" className="grid gap-6 xl:grid-cols-12">
              <div data-testid="core-widget" className="xl:col-span-7">
              <ParentFamilyCard profile={primaryProfile} />
            </div>
            {academicsReady ? (
              <div data-testid="core-widget" className="xl:col-span-5">
                <AcademicsWidget
                  data={snapshot.academics}
                  href="/dashboard/parent/academics"
                />
              </div>
            ) : null}
          </section>

          <div data-testid="context-section">
            <ParentUpdatesCard snapshot={snapshot} />
          </div>

          <div data-testid="activity-feed-section">
            <ActivityFeed items={snapshot.activityFeed} />
          </div>
        </>
      ) : null}
    </div>
  );
}

export function StudentsPage({
  role,
  snapshot,
  online,
}: {
  role: DashboardRole;
  snapshot: DashboardSnapshot;
  online: boolean;
}) {
  const model = useMemo(
    () => buildSchoolErpModel({ role, tenant: snapshot.tenant, online }),
    [online, role, snapshot.tenant],
  );
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [showModal, setShowModal] = useState(false);

  const filteredRows = model.students.rows.filter((row) => {
    const matchesSearch =
      row.name.toLowerCase().includes(search.toLowerCase()) ||
      row.admissionNumber.toLowerCase().includes(search.toLowerCase()) ||
      row.parent.toLowerCase().includes(search.toLowerCase());
    const matchesClass = classFilter === "all" || row.className === classFilter;

    return matchesSearch && matchesClass;
  });

  const columns: DataTableColumn<StudentRow>[] = [
    {
      id: "name",
      header: "Name",
      render: (row) => (
        <Link
          href={`/dashboard/${role}/students/${row.id}`}
          className="font-semibold text-accent hover:underline"
        >
          {row.name}
        </Link>
      ),
    },
    { id: "adm", header: "Adm No", render: (row) => row.admissionNumber },
    { id: "class", header: "Class", render: (row) => row.className },
    { id: "parent", header: "Parent", render: (row) => row.parent },
    {
      id: "balance",
      header: "Balance",
      className: "text-right",
      headerClassName: "text-right",
      render: (row) => <StatusPill label={row.balance} tone={row.balanceTone} />,
    },
  ];

  const studentsWithBalance = filteredRows.filter(
    (row) => row.balanceTone === "warning" || row.balanceTone === "critical",
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Students"
        title="Student register"
        description="Search quickly, understand balances instantly, and open the student profile in one click."
        actions={
          <Button
            onClick={() => setShowModal(true)}
            variant="primary"
            size="lg"
          >
            <UserPlus className="h-4 w-4" />
            Add Student
          </Button>
        }
      />

      <SummaryCards items={model.students.metrics} />

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <Card className="p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <p className="eyebrow">
                  Search and filter
                </p>
                <h3 className="mt-2 section-title">
                  Keep the register easy to scan
                </h3>
                <p className="mt-1 text-[13px] leading-relaxed text-muted">
                  Search by learner, admission number, or parent and keep balances visible in the same view.
                </p>
              </div>
              <div className="rounded-[var(--radius)] border border-border bg-surface-muted px-4 py-3 text-sm text-muted">
                Showing <span className="font-semibold text-foreground">{filteredRows.length}</span> learners
              </div>
            </div>
            <div className="mt-5 grid gap-3 lg:grid-cols-[1.5fr_0.8fr]">
              <label className="flex items-center gap-3 rounded-[var(--radius)] border border-border bg-surface-muted px-4 py-3">
                <Search className="h-4 w-4 text-muted" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search student, admission number, or parent"
                  className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
                />
              </label>
              <label className="flex items-center gap-3 rounded-[var(--radius)] border border-border bg-surface-muted px-4 py-3">
                <Filter className="h-4 w-4 text-muted" />
                <select
                  value={classFilter}
                  onChange={(event) => setClassFilter(event.target.value)}
                  className="w-full bg-transparent text-sm outline-none"
                >
                  <option value="all">All classes</option>
                  {Array.from(new Set(model.students.rows.map((row) => row.className))).map(
                    (className) => (
                      <option key={className} value={className}>
                        {className}
                      </option>
                    ),
                  )}
                </select>
              </label>
            </div>
          </Card>

          <DataTable
            title="Students"
            subtitle="Balances stay visible in the same table so bursars and school admins never need a second screen."
            columns={columns}
            rows={filteredRows}
            getRowKey={(row) => row.id}
          />
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <p className="eyebrow">
              What needs attention
            </p>
            <h3 className="mt-2 section-title">
              Follow-up queue
            </h3>
            <div className="mt-4 space-y-3">
              <div className="rounded-[var(--radius)] border border-border bg-surface-muted px-4 py-3">
                <p className="eyebrow">Balances open</p>
                <p className="mt-2 metric-value">{studentsWithBalance.length}</p>
                <p className="mt-1 text-sm text-muted">Learners that still need payment follow-up.</p>
              </div>
              <div className="rounded-[var(--radius)] border border-border bg-surface-muted px-4 py-3">
                <p className="eyebrow">Next action</p>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  Open the learner profile, confirm the parent contact, then print or send the fee statement.
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="eyebrow">
                  Defaulters
                </p>
                <h3 className="mt-2 section-title">
                  Highest balances
                </h3>
              </div>
              <Link
                href={`/dashboard/${role}/reports`}
                className="text-sm font-semibold text-accent"
              >
                Statements
              </Link>
            </div>
            <div className="mt-4 space-y-3">
              {model.dashboard.defaulters.slice(0, 4).map((row) => (
                <div
                  key={row.id}
                  className="rounded-[var(--radius)] border border-border bg-surface-muted px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{row.student}</p>
                      <p className="mt-1 text-sm text-muted">{row.className}</p>
                    </div>
                    <p className="text-sm font-semibold text-danger">{row.balance}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </section>

      <Modal
        open={showModal}
        title="Add student"
        description="Capture the essential school details first. Everything else can be completed from the student profile."
        onClose={() => setShowModal(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button onClick={() => setShowModal(false)}>Save Student</Button>
          </>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          {["Full name", "Admission number", "Class", "Parent phone"].map((label) => (
            <label key={label} className="space-y-2">
              <span className="text-sm font-semibold text-foreground">{label}</span>
              <input
                className="input-base"
                placeholder={label}
              />
            </label>
          ))}
        </div>
      </Modal>
    </div>
  );
}

export function StudentProfilePage({
  role,
  snapshot,
  online,
  studentId,
}: {
  role: DashboardRole;
  snapshot: DashboardSnapshot;
  online: boolean;
  studentId: string;
}) {
  const model = useMemo(
    () => buildSchoolErpModel({ role, tenant: snapshot.tenant, online }),
    [online, role, snapshot.tenant],
  );
  const profile = model.studentProfiles.find((item) => item.id === studentId);

  if (!profile) {
    return (
      <Card className="p-10 text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-muted">
          Student Profile
        </p>
        <h2 className="mt-3 metric-value">
          Student not found
        </h2>
        <p className="mt-3 text-[13px] leading-relaxed text-muted">
          The learner profile could not be opened for this role and tenant.
        </p>
        <Link
          href={`/dashboard/${role}/students`}
          className={buttonClasses({ variant: "primary", size: "lg", className: "mt-6" })}
        >
          Back to students
        </Link>
      </Card>
    );
  }

  const feeColumns: DataTableColumn<FeeStructureRow>[] = [
    { id: "item", header: "Item", render: (row) => row.item },
    {
      id: "amount",
      header: "Amount",
      className: "text-right font-semibold",
      headerClassName: "text-right",
      render: (row) => row.amount,
    },
    { id: "frequency", header: "Frequency", render: (row) => row.frequency },
  ];

  const paymentColumns: DataTableColumn<StudentProfileData["paymentHistory"][number]>[] = [
    {
      id: "amount",
      header: "Amount",
      className: "text-right font-semibold",
      headerClassName: "text-right",
      render: (row) => row.amount,
    },
    { id: "method", header: "Method", render: (row) => row.method },
    { id: "date", header: "Date", render: (row) => row.date },
    { id: "reference", header: "Reference", render: (row) => row.reference },
    {
      id: "status",
      header: "Status",
      render: (row) => <StatusPill label={row.status} tone={row.statusTone} />,
    },
  ];

  const academicsColumns: DataTableColumn<StudentProfileData["academics"][number]>[] = [
    { id: "subject", header: "Subject", render: (row) => row.subject },
    { id: "teacher", header: "Teacher", render: (row) => row.teacher },
    { id: "average", header: "Average", render: (row) => row.average },
    { id: "grade", header: "CBC band", render: (row) => row.grade },
  ];
  const leadingSubject = [...profile.academics].sort((left, right) => {
    const leftValue = Number.parseInt(left.average, 10);
    const rightValue = Number.parseInt(right.average, 10);
    return rightValue - leftValue;
  })[0];
  const statementRows: PrintableRow[] = [
    ...profile.feeStructure.map((item) => ({
      label: `${item.item} (${item.frequency})`,
      value: item.amount,
    })),
    {
      label: "Latest payment",
      value: profile.paymentHistory[0]?.amount ?? "KES 0",
    },
    {
      label: "Balance due",
      value: profile.balance,
      tone: profile.balanceTone === "ok" ? "default" : "danger",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Student Profile"
        title={profile.name}
        description={`${profile.admissionNumber} | ${profile.className} | Parent: ${profile.parentName}`}
        actions={
          <Link
            href={`/dashboard/${role}/students`}
            className={buttonClasses({ variant: "secondary", size: "lg" })}
          >
            Back to Students
          </Link>
        }
        meta={
          <>
            <StatusPill label={profile.balance} tone={profile.balanceTone} />
            <StatusPill label={profile.parentPhone} tone="ok" />
          </>
        }
      />

      <SummaryCards items={profile.metrics} />

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="p-6">
          <p className="eyebrow">
            Learner summary
          </p>
          <h3 className="mt-2 section-title">
            Family, class, and fee status
          </h3>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="rounded-[var(--radius)] border border-border bg-surface-muted px-4 py-4">
              <p className="eyebrow">Parent</p>
              <p className="mt-2 text-base font-semibold text-foreground">{profile.parentName}</p>
              <p className="mt-1 text-sm text-muted">{profile.parentPhone}</p>
            </div>
            <div className="rounded-[var(--radius)] border border-border bg-surface-muted px-4 py-4">
              <p className="eyebrow">Class</p>
              <p className="mt-2 text-base font-semibold text-foreground">{profile.className}</p>
              <p className="mt-1 text-sm text-muted">CBC learner record</p>
            </div>
            <div className="rounded-[var(--radius)] border border-border bg-surface-muted px-4 py-4">
              <p className="eyebrow">Outstanding balance</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <p className="text-base font-semibold text-foreground">{profile.balance}</p>
                <StatusPill label={profile.balance} tone={profile.balanceTone} />
              </div>
            </div>
            <div className="rounded-[var(--radius)] border border-border bg-surface-muted px-4 py-4">
              <p className="eyebrow">Latest payment</p>
              <p className="mt-2 text-base font-semibold text-foreground">
                {profile.paymentHistory[0]?.amount ?? "KES 0"}
              </p>
              <p className="mt-1 text-sm text-muted">
                {profile.paymentHistory[0]?.date ?? "No payment posted yet"}
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <p className="eyebrow">
            Recommended next step
          </p>
          <h3 className="mt-2 section-title">
            Resolve the family account fast
          </h3>
          <p className="mt-3 text-[13px] leading-relaxed text-muted">
            Use the fee tab to confirm the current structure, then record payment or print the latest student statement.
          </p>
          <div className="mt-5 space-y-3">
            <div className="rounded-[var(--radius)] border border-border bg-surface-muted px-4 py-3">
              <p className="eyebrow">Best action now</p>
              <p className="mt-2 text-sm font-semibold text-foreground">
                {profile.balanceTone === "ok"
                  ? "Balance is clear. Share academic progress and notices instead."
                  : "Record or confirm payment, then send a follow-up message to the parent."}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href={`/dashboard/${role}/finance`}
                className={buttonClasses({ variant: "primary", size: "md" })}
              >
                Record Payment
              </Link>
              <Link
                href={`/dashboard/${role}/reports`}
                className={buttonClasses({ variant: "secondary", size: "md" })}
              >
                Print Statement
              </Link>
            </div>
          </div>
        </Card>
      </section>

      <Tabs
        items={[
          {
            id: "overview",
            label: "Overview",
            panel: (
              <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                <Card className="p-6">
                  <p className="eyebrow">
                    Family contact
                  </p>
                  <h3 className="mt-2 section-title">
                    Parent and fee overview
                  </h3>
                  <div className="mt-6 grid gap-4 md:grid-cols-2">
                    <div className="rounded-[var(--radius)] border border-border bg-surface-muted p-4">
                      <p className="eyebrow">Parent</p>
                      <p className="mt-2 text-lg font-bold text-foreground">{profile.parentName}</p>
                      <p className="mt-1 text-sm text-muted">{profile.parentPhone}</p>
                    </div>
                    <div className="rounded-[var(--radius)] border border-border bg-surface-muted p-4">
                      <p className="eyebrow">Class</p>
                      <p className="mt-2 text-lg font-bold text-foreground">{profile.className}</p>
                      <p className="mt-1 text-sm text-muted">CBC learner record</p>
                    </div>
                  </div>
                </Card>
                <Card className="p-6">
                  <p className="eyebrow">
                    Next action
                  </p>
                  <h3 className="mt-2 section-title">
                    What should the bursar do?
                  </h3>
                  <p className="mt-4 text-[13px] leading-relaxed text-muted">
                    If balance remains open, call the family and issue the latest fee statement before end of day.
                  </p>
                  <div className="mt-6 flex flex-wrap gap-3">
                    <Link
                      href={`/dashboard/${role}/finance`}
                      className={buttonClasses({ variant: "primary", size: "md" })}
                    >
                      Record Payment
                    </Link>
                    <Link
                      href={`/dashboard/${role}/reports`}
                      className={buttonClasses({ variant: "secondary", size: "md" })}
                    >
                      Print Statement
                    </Link>
                  </div>
                </Card>
              </div>
            ),
          },
          {
            id: "fees",
            label: "Fees",
            panel: (
              <div className="space-y-6">
                <div className="grid gap-4 xl:grid-cols-2">
                  <Card className="p-5">
                    <p className="eyebrow">
                      Account position
                    </p>
                    <h3 className="mt-2 section-title">
                      What does the family need now?
                    </h3>
                    <div className="mt-4 rounded-[var(--radius)] border border-border bg-surface-muted px-4 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="section-title">{profile.balance}</p>
                        <StatusPill label={profile.balance} tone={profile.balanceTone} />
                      </div>
                      <p className="mt-2 text-[13px] leading-relaxed text-muted">
                        {profile.balanceTone === "ok"
                          ? "This learner is currently clear. Share statements only when the parent requests a record."
                          : "Balance is still open. Confirm the latest payment, then print or send the statement immediately."}
                      </p>
                    </div>
                  </Card>

                  <Card className="p-5">
                    <p className="eyebrow">
                      Fee mix
                    </p>
                    <h3 className="mt-2 section-title">
                      Current structure at a glance
                    </h3>
                    <div className="mt-4 space-y-3">
                      {profile.feeStructure.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between rounded-[var(--radius)] border border-border bg-surface-muted px-4 py-3"
                        >
                          <div>
                            <p className="text-sm font-semibold text-foreground">{item.item}</p>
                            <p className="mt-1 text-sm text-muted">{item.frequency}</p>
                          </div>
                          <p className="text-sm font-semibold text-foreground">{item.amount}</p>
                        </div>
                      ))}
                    </div>
                  </Card>
                </div>

                <PrintableSheet
                  eyebrow="Printable statement preview"
                  title={`${profile.name} fee statement`}
                  subtitle={`${profile.admissionNumber} | ${profile.className} | Parent: ${profile.parentName}`}
                  rows={statementRows.map((row, index) => ({
                    id: `statement-row-${index + 1}`,
                    ...row,
                  }))}
                  footer="Use this as the on-screen statement preview before printing or exporting a formal family statement."
                />

                <div className="flex flex-wrap gap-3">
                  <Button
                    onClick={() =>
                      openPrintDocument({
                        eyebrow: "Student fee statement",
                        title: `${profile.name} fee statement`,
                        subtitle: `${profile.admissionNumber} | ${profile.className} | Parent: ${profile.parentName}`,
                        rows: statementRows,
                        footer:
                          "This statement is generated from the current learner fee structure and the latest posted payment history.",
                      })
                    }
                  >
                    <Printer className="h-4 w-4" />
                    Print Statement
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      downloadCsvFile({
                        filename: `${profile.admissionNumber.toLowerCase()}-fee-statement.csv`,
                        headers: ["Item", "Amount"],
                        rows: statementRows.map((row) => [row.label, row.value]),
                      })
                    }
                  >
                    <FileSpreadsheet className="h-4 w-4" />
                    Export Statement
                  </Button>
                </div>

                <DataTable
                  title="Fee structure"
                  subtitle="Every fee line is visible in the same familiar structure bursars already use."
                  columns={feeColumns}
                  rows={profile.feeStructure}
                  getRowKey={(row) => row.id}
                />
                <DataTable
                  title="Payment history"
                  subtitle="Payments come from the ledger-backed posting history."
                  columns={paymentColumns}
                  rows={profile.paymentHistory}
                  getRowKey={(row) => row.id}
                />
              </div>
            ),
          },
          {
            id: "academics",
            label: "Academics",
            panel: (
              <div className="space-y-6">
                <div className="grid gap-4 xl:grid-cols-2">
                  <Card className="p-5">
                    <p className="eyebrow">
                      Learning signal
                    </p>
                    <h3 className="mt-2 section-title">
                      Strongest recent subject
                    </h3>
                    <div className="mt-4 rounded-[var(--radius)] border border-border bg-surface-muted px-4 py-4">
                      <p className="text-base font-semibold text-foreground">
                        {leadingSubject?.subject ?? "No subject data"}
                      </p>
                      <p className="mt-1 text-sm text-muted">
                        {leadingSubject ? `${leadingSubject.average} average | ${leadingSubject.grade}` : "Awaiting marks entry"}
                      </p>
                    </div>
                  </Card>

                  <Card className="p-5">
                    <p className="eyebrow">
                      Classroom context
                    </p>
                    <h3 className="mt-2 section-title">
                      Teacher view
                    </h3>
                    <p className="mt-4 text-[13px] leading-relaxed text-muted">
                      Use the marks table below for subject-by-subject review, then move to report generation only when the learner story is clear.
                    </p>
                  </Card>
                </div>

                <DataTable
                  title="Academic performance"
                  subtitle="CBC subject performance kept in a simple table first."
                  columns={academicsColumns}
                  rows={profile.academics}
                  getRowKey={(row) => row.id}
                />
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}

export function FinancePage({
  role,
  snapshot,
  online,
}: {
  role: DashboardRole;
  snapshot: DashboardSnapshot;
  online: boolean;
}) {
  const model = useMemo(
    () => buildSchoolErpModel({ role, tenant: snapshot.tenant, online }),
    [online, role, snapshot.tenant],
  );
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showReverseModal, setShowReverseModal] = useState(false);
  const [search, setSearch] = useState("");
  const [methodFilter, setMethodFilter] = useState("all");

  const columns: DataTableColumn<FinancePaymentRow>[] = [
    { id: "student", header: "Student", render: (row) => <span className="font-semibold">{row.student}</span> },
    {
      id: "amount",
      header: "Amount",
      className: "text-right font-semibold",
      headerClassName: "text-right",
      render: (row) => row.amount,
    },
    { id: "method", header: "Method", render: (row) => row.method },
    { id: "date", header: "Date", render: (row) => row.date },
    { id: "reference", header: "Reference", render: (row) => row.reference },
    {
      id: "status",
      header: "Status",
      render: (row) => <StatusPill label={row.status} tone={row.statusTone} />,
    },
  ];
  const filteredRows = model.finance.rows.filter((row) => {
    const normalizedSearch = search.trim().toLowerCase();
    const matchesSearch =
      normalizedSearch.length === 0 ||
      row.student.toLowerCase().includes(normalizedSearch) ||
      row.reference.toLowerCase().includes(normalizedSearch);
    const matchesMethod = methodFilter === "all" || row.method === methodFilter;

    return matchesSearch && matchesMethod;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Fees / Payments"
        title="Collections desk"
        description="Show the numbers first, keep payment recording familiar, and make reversal actions explicit."
        actions={
          <>
            <Button
              variant="secondary"
              size="lg"
              disabled={!online}
              onClick={() => setShowReverseModal(true)}
            >
              Reverse Payment
            </Button>
            <Button size="lg" disabled={!online} onClick={() => setShowPaymentModal(true)}>
              Record Payment
            </Button>
          </>
        }
      />

      <SummaryCards items={model.finance.summary} />

      <Card className="p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="eyebrow">
              Ledger-safe posting
            </p>
            <h3 className="mt-2 section-title">
              Finance stays online-only
            </h3>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">
              Payments and reversals post into the ledger, so the desk stays intentionally strict and always connected.
            </p>
          </div>
          <StatusPill label={online ? "Ledger live" : "Finance disabled offline"} tone={online ? "ok" : "critical"} />
        </div>
      </Card>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <Card className="p-5">
            <div className="grid gap-3 lg:grid-cols-[1.3fr_0.8fr]">
              <label className="flex items-center gap-3 rounded-[var(--radius)] border border-border bg-surface-muted px-4 py-3">
                <Search className="h-4 w-4 text-muted" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search learner or payment reference"
                  className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
                />
              </label>
              <label className="flex items-center gap-3 rounded-[var(--radius)] border border-border bg-surface-muted px-4 py-3">
                <Filter className="h-4 w-4 text-muted" />
                <select
                  value={methodFilter}
                  onChange={(event) => setMethodFilter(event.target.value)}
                  className="w-full bg-transparent text-sm outline-none"
                >
                  <option value="all">All methods</option>
                  {Array.from(new Set(model.finance.rows.map((row) => row.method))).map((method) => (
                    <option key={method} value={method}>
                      {method}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </Card>

          <DataTable
            title="Payments"
            subtitle="Student, amount, method, date, and reference stay together for quick verification."
            columns={columns}
            rows={filteredRows}
            getRowKey={(row) => row.id}
          />
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <p className="eyebrow">
              Collections checklist
            </p>
            <h3 className="mt-2 section-title">
              What should the bursar do next?
            </h3>
            <div className="mt-4 space-y-3">
              {[
                "Confirm all large M-PESA payments are matched to a learner.",
                "Follow up learners still appearing in the defaulters list.",
                "Use reversals only when the ledger posting truly needs correction.",
              ].map((item) => (
                <div key={item} className="rounded-[var(--radius)] border border-border bg-surface-muted px-4 py-3">
                  <p className="text-sm text-foreground">{item}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="eyebrow">
                  Defaulters
                </p>
                <h3 className="mt-2 section-title">
                  Balance follow-up
                </h3>
              </div>
              <Link href={`/dashboard/${role}/students`} className="text-sm font-semibold text-accent">
                Open students
              </Link>
            </div>
            <div className="mt-4 space-y-3">
              {model.dashboard.defaulters.slice(0, 4).map((row) => (
                <div key={row.id} className="rounded-[var(--radius)] border border-border bg-surface-muted px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{row.student}</p>
                      <p className="mt-1 text-sm text-muted">{row.className}</p>
                    </div>
                    <p className="text-sm font-semibold text-danger">{row.balance}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </section>

      <Modal
        open={showPaymentModal}
        title="Record payment"
        description="Use the same simple flow bursars already know: student, amount, method, reference."
        onClose={() => setShowPaymentModal(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowPaymentModal(false)}>
              Cancel
            </Button>
            <Button disabled={!online} onClick={() => setShowPaymentModal(false)}>
              Post Payment
            </Button>
          </>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          {["Student", "Amount", "Method", "Reference"].map((label) => (
            <label key={label} className="space-y-2">
              <span className="text-sm font-semibold text-foreground">{label}</span>
              <input
                className="input-base"
                placeholder={label}
              />
            </label>
          ))}
        </div>
      </Modal>

      <Modal
        open={showReverseModal}
        title="Reverse payment"
        description="Reversals should be rare and explicit so audit trails stay clean."
        onClose={() => setShowReverseModal(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowReverseModal(false)}>
              Keep Payment
            </Button>
            <Button variant="danger" disabled={!online} onClick={() => setShowReverseModal(false)}>
              Reverse Posted Payment
            </Button>
          </>
        }
      >
        <p className="text-[13px] leading-relaxed text-muted">
          Confirm the reference, choose the reason, and continue only if the ledger entry truly needs reversal.
        </p>
      </Modal>
    </div>
  );
}

export function MpesaPage({
  role,
  snapshot,
  online,
}: {
  role: DashboardRole;
  snapshot: DashboardSnapshot;
  online: boolean;
}) {
  const model = useMemo(
    () => buildSchoolErpModel({ role, tenant: snapshot.tenant, online }),
    [online, role, snapshot.tenant],
  );
  const [showMatchModal, setShowMatchModal] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const columns: DataTableColumn<MpesaTransactionRow>[] = [
    { id: "phone", header: "Phone", render: (row) => row.phone },
    {
      id: "amount",
      header: "Amount",
      className: "text-right font-semibold",
      headerClassName: "text-right",
      render: (row) => row.amount,
    },
    { id: "code", header: "Code", render: (row) => <span className="font-semibold">{row.code}</span> },
    {
      id: "status",
      header: "Status",
      render: (row) => <StatusPill label={row.status} tone={row.statusTone} />,
    },
    { id: "student", header: "Matched Student", render: (row) => row.matchedStudent },
    {
      id: "actions",
      header: "Action",
      render: (row) =>
        row.statusTone === "warning" ? (
          <Button size="sm" disabled={!online} onClick={() => setShowMatchModal(true)}>
            Manual Match
          </Button>
        ) : (
          <span className="text-sm text-muted">Auto-match complete</span>
        ),
    },
  ];
  const filteredRows = model.mpesa.rows.filter((row) => {
    const normalizedSearch = search.trim().toLowerCase();
    const matchesSearch =
      normalizedSearch.length === 0 ||
      row.phone.toLowerCase().includes(normalizedSearch) ||
      row.code.toLowerCase().includes(normalizedSearch) ||
      row.matchedStudent.toLowerCase().includes(normalizedSearch);
    const matchesStatus =
      statusFilter === "all" || row.status.toLowerCase() === statusFilter;

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="MPESA Transactions"
        title="M-PESA matching desk"
        description="Keep the mobile money queue simple: matched, pending, or failed, with manual intervention only when needed."
      />

      <SummaryCards items={model.mpesa.summary} />

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <Card className="p-5">
            <div className="flex items-start gap-3 rounded-[var(--radius)] border border-border bg-surface-muted px-4 py-3">
              <SmartphoneCharging className="mt-0.5 h-5 w-5 text-accent" />
              <p className="text-sm leading-6 text-foreground">
                Auto-match is enabled for parent phone numbers already linked to students. Only unmatched items should need manual attention.
              </p>
            </div>
          </Card>

          <Card className="p-5">
            <div className="grid gap-3 lg:grid-cols-[1.3fr_0.8fr]">
              <label className="flex items-center gap-3 rounded-[var(--radius)] border border-border bg-surface-muted px-4 py-3">
                <Search className="h-4 w-4 text-muted" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search phone, code, or learner"
                  className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
                />
              </label>
              <label className="flex items-center gap-3 rounded-[var(--radius)] border border-border bg-surface-muted px-4 py-3">
                <Filter className="h-4 w-4 text-muted" />
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  className="w-full bg-transparent text-sm outline-none"
                >
                  <option value="all">All statuses</option>
                  {Array.from(new Set(model.mpesa.rows.map((row) => row.status.toLowerCase()))).map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </Card>

          <DataTable
            title="Transaction queue"
            subtitle="Phone, amount, code, status, and the matched learner in one grid."
            columns={columns}
            rows={filteredRows}
            getRowKey={(row) => row.id}
          />
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <p className="eyebrow">
              Matching rules
            </p>
            <h3 className="mt-2 section-title">
              Keep mobile money clean
            </h3>
            <div className="mt-4 space-y-3">
              {[
                "Matched items should not need a second review unless the amount is disputed.",
                "Pending items need parent phone confirmation before manual matching.",
                "Failed items belong in reconciliation and should not be forced into the ledger.",
              ].map((item) => (
                <div key={item} className="rounded-[var(--radius)] border border-border bg-surface-muted px-4 py-3">
                  <p className="text-sm text-foreground">{item}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <p className="eyebrow">
              Pending manual matches
            </p>
            <h3 className="mt-2 section-title">
              Transactions waiting on review
            </h3>
            <div className="mt-4 space-y-3">
              {model.mpesa.rows
                .filter((row) => row.statusTone === "warning")
                .slice(0, 4)
                .map((row) => (
                  <div key={row.id} className="rounded-[var(--radius)] border border-border bg-surface-muted px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{row.code}</p>
                        <p className="mt-1 text-sm text-muted">{row.phone}</p>
                      </div>
                      <p className="text-sm font-semibold text-foreground">{row.amount}</p>
                    </div>
                  </div>
                ))}
            </div>
          </Card>
        </div>
      </section>

      <Modal
        open={showMatchModal}
        title="Manual match"
        description="Use this only for genuine unmatched transactions after confirming the family phone number."
        onClose={() => setShowMatchModal(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowMatchModal(false)}>
              Cancel
            </Button>
            <Button disabled={!online} onClick={() => setShowMatchModal(false)}>
              Confirm Match
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <label className="space-y-2">
            <span className="text-sm font-semibold text-foreground">Student</span>
            <input className="input-base" placeholder="Search learner" />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-foreground">Confirmation note</span>
            <textarea className="min-h-28 input-base" placeholder="Why this match is valid" />
          </label>
        </div>
      </Modal>
    </div>
  );
}

export function AcademicsPage({
  role,
  snapshot,
  online,
}: {
  role: DashboardRole;
  snapshot: DashboardSnapshot;
  online: boolean;
}) {
  const model = useMemo(
    () => buildSchoolErpModel({ role, tenant: snapshot.tenant, online }),
    [online, role, snapshot.tenant],
  );
  const [showMarksModal, setShowMarksModal] = useState(false);

  const subjectColumns: DataTableColumn<SchoolErpModel["academics"]["subjects"][number]>[] = [
    { id: "subject", header: "Subject", render: (row) => <span className="font-semibold">{row.subject}</span> },
    { id: "teacher", header: "Teacher", render: (row) => row.teacher },
    { id: "class", header: "Class", render: (row) => row.className },
    { id: "average", header: "Average", render: (row) => row.average },
  ];

  const marksColumns: DataTableColumn<MarksEntryRow>[] = [
    { id: "student", header: "Student", render: (row) => <span className="font-semibold">{row.student}</span> },
    { id: "english", header: "English", render: (row) => row.english },
    { id: "maths", header: "Maths", render: (row) => row.maths },
    { id: "science", header: "Science", render: (row) => row.science },
    { id: "social", header: "Social", render: (row) => row.socialStudies },
  ];

  const reportColumns: DataTableColumn<ReportCardRow>[] = [
    { id: "learner", header: "Learner", render: (row) => <span className="font-semibold">{row.learner}</span> },
    { id: "class", header: "Class", render: (row) => row.className },
    { id: "type", header: "Report", render: (row) => row.reportType },
    {
      id: "status",
      header: "Status",
      render: (row) => <StatusPill label={row.status} tone={row.statusTone} />,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Academics"
        title="Academics and report cards"
        description="Subjects, marks, and report cards stay in a simple school flow instead of a complex grading tool."
        actions={
          <Button size="lg" onClick={() => setShowMarksModal(true)}>
            <BookOpenCheck className="h-4 w-4" />
            Enter Marks
          </Button>
        }
      />

      <SummaryCards items={model.academics.summary} />

      <Card className="p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="eyebrow">
              Academic workflow
            </p>
            <h3 className="mt-2 section-title">
              Subjects, marks, and reports in one place
            </h3>
          </div>
          <div className="rounded-[var(--radius)] border border-border bg-surface-muted px-4 py-3 text-sm text-muted">
            Keep tables first so teachers can act quickly.
          </div>
        </div>
      </Card>

      <Tabs
        items={[
          {
            id: "subjects",
            label: "Subjects",
            panel: (
              <DataTable
                title="Subjects"
                subtitle="CBC subject coverage and current average performance."
                columns={subjectColumns}
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
                title="Marks entry"
                subtitle="Recent marks entry view for quick review."
                columns={marksColumns}
                rows={model.academics.marks}
                getRowKey={(row) => row.id}
              />
            ),
          },
          {
            id: "reports",
            label: "Report cards",
            panel: (
              <DataTable
                title="Report cards"
                subtitle="What is ready to print and what still needs attention."
                columns={reportColumns}
                rows={model.academics.reports}
                getRowKey={(row) => row.id}
              />
            ),
          },
        ]}
      />

      <Modal
        open={showMarksModal}
        title="Enter marks"
        description="Capture marks quickly, then move back into the academic tables for review and report preparation."
        onClose={() => setShowMarksModal(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowMarksModal(false)}>
              Cancel
            </Button>
            <Button onClick={() => setShowMarksModal(false)}>Save Marks</Button>
          </>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          {["Learner", "Class", "Subject", "Score"].map((label) => (
            <label key={label} className="space-y-2">
              <span className="text-sm font-semibold text-foreground">{label}</span>
              <input
                className="input-base"
                placeholder={label}
              />
            </label>
          ))}
        </div>
      </Modal>
    </div>
  );
}

export function CommunicationPage({
  role,
  snapshot,
  online,
}: {
  role: DashboardRole;
  snapshot: DashboardSnapshot;
  online: boolean;
}) {
  const model = useMemo(
    () => buildSchoolErpModel({ role, tenant: snapshot.tenant, online }),
    [online, role, snapshot.tenant],
  );
  const [sent, setSent] = useState(false);

  const columns: DataTableColumn<SmsHistoryRow>[] = [
    { id: "audience", header: "Audience", render: (row) => row.audience },
    { id: "message", header: "Message", render: (row) => row.message },
    { id: "sentAt", header: "Sent At", render: (row) => row.sentAt },
    {
      id: "status",
      header: "Status",
      render: (row) => <StatusPill label={row.status} tone={row.statusTone} />,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Communication (SMS)"
        title="Send school messages"
        description="Bursars and admins should be able to send a fee reminder or school notice in under a minute."
        meta={<StatusPill label={online ? "Messaging live" : "Messaging unavailable offline"} tone={online ? "ok" : "warning"} />}
      />

      <SummaryCards items={model.communication.summary} />

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="p-6">
          <p className="eyebrow">
            Audience
          </p>
          <h3 className="mt-2 section-title">
            Send SMS
          </h3>
          <div className="mt-6 grid gap-3">
            {[
              { label: "All parents", icon: MessageSquareText },
              { label: "By class", icon: Users },
              { label: "Defaulters", icon: CircleDollarSign },
            ].map((item) => {
              const Icon = item.icon;

              return (
                <button
                  key={item.label}
                  type="button"
                  className="flex items-center justify-between rounded-[var(--radius)] border border-border bg-surface-muted px-4 py-4 text-left transition duration-150 hover:bg-surface-strong"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-[var(--radius)] bg-surface">
                      <Icon className="h-5 w-5 text-accent" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">{item.label}</p>
                      <p className="text-sm text-muted">Fast familiar outreach list</p>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted" />
                </button>
              );
            })}
          </div>
        </Card>

        <Card className="p-6">
          <p className="eyebrow">
            Message draft
          </p>
          <h3 className="mt-2 section-title">
            Compose notice
          </h3>
          <div className="mt-6 grid gap-4">
            <label className="space-y-2">
              <span className="text-sm font-semibold text-foreground">Audience</span>
              <select className="input-base">
                <option>Defaulters</option>
                <option>All parents</option>
                <option>Class group</option>
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-sm font-semibold text-foreground">Message</span>
              <textarea
                className="min-h-32 input-base"
                placeholder="Write the school notice to send"
              />
            </label>
            <div className="flex flex-wrap items-center justify-between gap-3">
              {sent ? <StatusPill label="Message queued" tone="ok" /> : <span />}
              <Button disabled={!online} onClick={() => setSent(true)}>
                <Send className="h-4 w-4" />
                Send SMS
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <DataTable
        title="SMS history"
        subtitle="Recent communication stays visible for follow-up and accountability."
        columns={columns}
        rows={model.communication.history}
        getRowKey={(row) => row.id}
      />
    </div>
  );
}

export function ReportsPage({
  role,
  snapshot,
  online,
}: {
  role: DashboardRole;
  snapshot: DashboardSnapshot;
  online: boolean;
}) {
  const model = useMemo(
    () => buildSchoolErpModel({ role, tenant: snapshot.tenant, online }),
    [online, role, snapshot.tenant],
  );
  const feeStatementRows = model.students.rows
    .filter((row) => row.balanceTone !== "ok")
    .slice(0, 8);
  const classSummaryRows = Array.from(
    model.students.rows.reduce(
      (map, row) => {
        const current = map.get(row.className) ?? {
          id: row.className,
          className: row.className,
          learners: 0,
          withBalance: 0,
        };
        current.learners += 1;
        if (row.balanceTone !== "ok") {
          current.withBalance += 1;
        }
        map.set(row.className, current);
        return map;
      },
      new Map<string, { id: string; className: string; learners: number; withBalance: number }>(),
    ).values(),
  );

  const feeStatementColumns: DataTableColumn<StudentRow>[] = [
    { id: "student", header: "Student", render: (row) => row.name },
    { id: "class", header: "Class", render: (row) => row.className },
    { id: "parent", header: "Parent", render: (row) => row.parent },
    {
      id: "balance",
      header: "Balance",
      className: "text-right",
      headerClassName: "text-right",
      render: (row) => <StatusPill label={row.balance} tone={row.balanceTone} />,
    },
  ];

  const classSummaryColumns: DataTableColumn<(typeof classSummaryRows)[number]>[] = [
    { id: "class", header: "Class", render: (row) => row.className },
    {
      id: "learners",
      header: "Learners",
      className: "text-right font-semibold",
      headerClassName: "text-right",
      render: (row) => `${row.learners}`,
    },
    {
      id: "withBalance",
      header: "With balance",
      className: "text-right font-semibold",
      headerClassName: "text-right",
      render: (row) => `${row.withBalance}`,
    },
  ];

  const paymentReportColumns: DataTableColumn<FinancePaymentRow>[] = [
    { id: "student", header: "Student", render: (row) => row.student },
    {
      id: "amount",
      header: "Amount",
      className: "text-right font-semibold",
      headerClassName: "text-right",
      render: (row) => row.amount,
    },
    { id: "method", header: "Method", render: (row) => row.method },
    { id: "date", header: "Date", render: (row) => row.date },
    { id: "reference", header: "Reference", render: (row) => row.reference },
  ];

  const handleReportPrint = (reportId: string) => {
    if (reportId === "report-fee-statement") {
      openPrintDocument({
        eyebrow: "Fee statement batch",
        title: "Fee statement batch preview",
        subtitle: "Learners with open balances and the current amount due.",
        rows: feeStatementRows.slice(0, 8).map((row) => ({
          label: `${row.name} | ${row.className}`,
          value: row.balance,
          tone: row.balanceTone === "ok" ? "default" : ("danger" as const),
        })),
        footer:
          "Use this print view for quick family follow-up before generating detailed statements learner by learner.",
      });
      return;
    }

    if (reportId === "report-class-summary") {
      openPrintDocument({
        eyebrow: "Class summary",
        title: "Class summary preview",
        subtitle: "Learner distribution and fee pressure grouped by class.",
        rows: classSummaryRows.map((row) => ({
          label: row.className,
          value: `${row.learners} learners | ${row.withBalance} with balance`,
          tone: row.withBalance > 0 ? "danger" : "default",
        })),
        footer:
          "Class summaries are most useful when principals and bursars need a fast overview before drilling into learner-level detail.",
      });
      return;
    }

    openPrintDocument({
      eyebrow: "Payment report",
      title: "Payment report preview",
      subtitle: "Recent posted payments grouped in a simple finance audit format.",
      rows: model.finance.rows.slice(0, 8).map((row) => ({
        label: `${row.student} | ${row.method} | ${row.date}`,
        value: `${row.amount} | ${row.reference}`,
      })),
      footer:
        "Use this print view for daily collections review before sharing or archiving the full ledger-backed report.",
    });
  };

  const handleReportExport = (reportId: string) => {
    if (reportId === "report-fee-statement") {
      downloadCsvFile({
        filename: "fee-statement-batch.csv",
        headers: ["Student", "Class", "Parent", "Balance"],
        rows: feeStatementRows.map((row) => [row.name, row.className, row.parent, row.balance]),
      });
      return;
    }

    if (reportId === "report-class-summary") {
      downloadCsvFile({
        filename: "class-summary.csv",
        headers: ["Class", "Learners", "With Balance"],
        rows: classSummaryRows.map((row) => [
          row.className,
          `${row.learners}`,
          `${row.withBalance}`,
        ]),
      });
      return;
    }

    downloadCsvFile({
      filename: "payment-report.csv",
      headers: ["Student", "Amount", "Method", "Date", "Reference"],
      rows: model.finance.rows.map((row) => [
        row.student,
        row.amount,
        row.method,
        row.date,
        row.reference,
      ]),
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Reports"
        title="Reports and exports"
        description="Tables first, print and export second. Reports should answer a school question immediately."
      />

      <SummaryCards items={model.reports.summary} />

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid gap-6 md:grid-cols-2">
          {model.reports.reports.map((report) => {
            const Icon = report.icon;

            return (
              <Card key={report.id} className="p-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-[var(--radius)] bg-accent-soft">
                  <Icon className="h-5 w-5 text-accent" />
                </div>
                <h3 className="mt-5 section-title">
                  {report.title}
                </h3>
                <p className="mt-3 text-[13px] leading-relaxed text-muted">{report.description}</p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Button variant="primary" onClick={() => handleReportPrint(report.id)}>
                    <Printer className="h-4 w-4" />
                    Print
                  </Button>
                  <Button variant="secondary" onClick={() => handleReportExport(report.id)}>
                    <FileSpreadsheet className="h-4 w-4" />
                    Export Excel
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>

        <Card className="p-5">
          <p className="eyebrow">
            Reporting rules
          </p>
          <h3 className="mt-2 section-title">
            Keep exports predictable
          </h3>
          <div className="mt-4 space-y-3">
            {[
              "Print when the school office needs a signed paper copy.",
              "Export when bursars or principals need to work outside the dashboard.",
              "Lead with statements, class summaries, and payment reports before custom analytics.",
            ].map((item) => (
              <div key={item} className="rounded-[var(--radius)] border border-border bg-surface-muted px-4 py-3">
                <p className="text-sm text-foreground">{item}</p>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <Tabs
        items={[
          {
            id: "fee-statement",
            label: "Fee statement",
            panel: (
              <div className="space-y-6">
                <PrintableSheet
                  eyebrow="Printable layout"
                  title="Fee statement batch preview"
                  subtitle="The office should be able to scan the report before printing or exporting it."
                  rows={feeStatementRows.slice(0, 5).map((row) => ({
                    id: row.id,
                    label: `${row.name} | ${row.className}`,
                    value: row.balance,
                    tone: row.balanceTone === "ok" ? "default" : "danger",
                  }))}
                  footer="Lead with learners who still have open balances so statements stay operational, not decorative."
                />
                <DataTable
                  title="Fee statement preview"
                  subtitle="Who still owes and which families likely need statements first."
                  columns={feeStatementColumns}
                  rows={feeStatementRows}
                  getRowKey={(row) => row.id}
                />
              </div>
            ),
          },
          {
            id: "class-summary",
            label: "Class summary",
            panel: (
              <div className="space-y-6">
                <PrintableSheet
                  eyebrow="Printable layout"
                  title="Class summary preview"
                  subtitle="A principal-friendly class roll-up that still reads clearly when printed."
                  rows={classSummaryRows.slice(0, 5).map((row) => ({
                    id: row.id,
                    label: `${row.className} learners`,
                    value: `${row.learners} total | ${row.withBalance} with balance`,
                    tone: row.withBalance > 0 ? "danger" : "default",
                  }))}
                  footer="This view keeps class size and fee pressure together so a principal understands the class posture quickly."
                />
                <DataTable
                  title="Class summary"
                  subtitle="A simple class-level roll-up for principals and school admins."
                  columns={classSummaryColumns}
                  rows={classSummaryRows}
                  getRowKey={(row) => row.id}
                />
              </div>
            ),
          },
          {
            id: "payment-report",
            label: "Payment report",
            panel: (
              <div className="space-y-6">
                <PrintableSheet
                  eyebrow="Printable layout"
                  title="Payment report preview"
                  subtitle="Recent collections summarized the way bursars expect to review them before sharing."
                  rows={model.finance.rows.slice(0, 5).map((row) => ({
                    id: row.id,
                    label: `${row.student} | ${row.method}`,
                    value: `${row.amount} | ${row.reference}`,
                  }))}
                  footer="Use the table below for the full operational audit trail, then print or export once the daily collections look correct."
                />
                <DataTable
                  title="Payment report"
                  subtitle="Recent finance activity kept in a familiar table before export."
                  columns={paymentReportColumns}
                  rows={model.finance.rows}
                  getRowKey={(row) => row.id}
                />
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}

export function SettingsPage({
  role,
  snapshot,
  online,
}: {
  role: DashboardRole;
  snapshot: DashboardSnapshot;
  online: boolean;
}) {
  const model = useMemo(
    () => buildSchoolErpModel({ role, tenant: snapshot.tenant, online }),
    [online, role, snapshot.tenant],
  );

  const feeColumns: DataTableColumn<FeeStructureRow>[] = [
    { id: "item", header: "Fee Item", render: (row) => row.item },
    {
      id: "amount",
      header: "Amount",
      className: "text-right font-semibold",
      headerClassName: "text-right",
      render: (row) => row.amount,
    },
    { id: "frequency", header: "Frequency", render: (row) => row.frequency },
  ];

  const userColumns: DataTableColumn<UserManagementRow>[] = [
    { id: "name", header: "Name", render: (row) => <span className="font-semibold">{row.name}</span> },
    { id: "role", header: "Role", render: (row) => row.role },
    { id: "phone", header: "Phone", render: (row) => row.phone },
    {
      id: "status",
      header: "Status",
      render: (row) => <StatusPill label={row.status} tone={row.statusTone} />,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="School setup"
        description="Keep school profile, fee structure, and user management in one clear page."
      />
      <Card className="p-5">
        <div className="flex items-start gap-3 rounded-[var(--radius)] border border-border bg-surface-muted px-4 py-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 text-accent" />
          <p className="text-sm leading-6 text-foreground">
            Settings stay simple: school profile, fee structure, and user access all remain tenant-scoped and easy to review.
          </p>
        </div>
      </Card>

      <Tabs
        items={[
          {
            id: "profile",
            label: "School profile",
            panel: (
              <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
                <Card className="p-6">
                  <p className="eyebrow">
                    School profile
                  </p>
                  <h3 className="mt-2 section-title">
                    Current school settings
                  </h3>
                  <div className="mt-6 space-y-4">
                    {model.settings.schoolProfile.map((field) => (
                      <div
                        key={field.id}
                        className="flex items-center justify-between rounded-[var(--radius)] border border-border bg-surface-muted px-4 py-4"
                      >
                        <p className="text-sm font-semibold text-foreground">{field.label}</p>
                        <p className="text-sm text-muted">{field.value}</p>
                      </div>
                    ))}
                  </div>
                </Card>

                <Card className="p-6">
                  <p className="eyebrow">
                    Quick system rules
                  </p>
                  <h3 className="mt-2 section-title">
                    What is protected?
                  </h3>
                  <div className="mt-6 space-y-4">
                    {[
                      "Finance actions stay online-only to protect ledger truth.",
                      "Retired modules stay hidden from operational workspaces.",
                      "User management stays tenant-scoped and role-based.",
                    ].map((item) => (
                      <div
                        key={item}
                        className="flex items-start gap-3 rounded-[var(--radius)] border border-border bg-surface-muted px-4 py-4"
                      >
                        <ShieldCheck className="mt-0.5 h-5 w-5 text-accent" />
                        <p className="text-sm leading-6 text-foreground">{item}</p>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            ),
          },
          {
            id: "fees",
            label: "Fee structure",
            panel: (
              <DataTable
                title="Fee structure"
                subtitle="Tuition, lunch, and other fee items stay plainly editable and easy to read."
                columns={feeColumns}
                rows={model.settings.feeStructure}
                getRowKey={(row) => row.id}
              />
            ),
          },
          {
            id: "users",
            label: "Users",
            panel: (
              <DataTable
                title="User management"
                subtitle="School users are shown without technical clutter."
                columns={userColumns}
                rows={model.settings.users}
                getRowKey={(row) => row.id}
              />
            ),
          },
        ]}
      />
    </div>
  );
}

export function ModuleScreen({
  role,
  moduleName,
  snapshot,
  online,
}: {
  role: DashboardRole;
  moduleName: string;
  snapshot: DashboardSnapshot;
  online: boolean;
}) {
  if (moduleName === "students") {
    return <StudentsPage role={role} snapshot={snapshot} online={online} />;
  }

  if (moduleName === "inventory") {
    return <InventoryModuleScreen role={role} snapshot={snapshot} online={online} />;
  }

  if (moduleName === "admissions") {
    return <AdmissionsModuleScreen role={role} snapshot={snapshot} online={online} />;
  }

  if (moduleName === "finance") {
    return <FinancePage role={role} snapshot={snapshot} online={online} />;
  }

  if (moduleName === "mpesa") {
    return <MpesaPage role={role} snapshot={snapshot} online={online} />;
  }

  if (moduleName === "academics") {
    return <AcademicsPage role={role} snapshot={snapshot} online={online} />;
  }

  if (moduleName === "communication") {
    return <CommunicationPage role={role} snapshot={snapshot} online={online} />;
  }

  if (moduleName === "reports") {
    return <ReportsPage role={role} snapshot={snapshot} online={online} />;
  }

  return <SettingsPage role={role} snapshot={snapshot} online={online} />;
}

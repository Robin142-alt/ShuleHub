"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, BookOpenCheck, FileSpreadsheet, Printer, Send, UserPlus } from "lucide-react";

import { ActivityListCard, SimpleListCard } from "@/components/experience/activity-list-card";
import { MetricGrid } from "@/components/experience/metric-grid";
import { QuickActionBar } from "@/components/experience/quick-action-bar";
import { AdmissionsModuleScreen } from "@/components/modules/admissions/admissions-module-screen";
import { ExamsModuleScreen } from "@/components/modules/exams/exams-module-screen";
import { InventoryModuleScreen } from "@/components/modules/inventory/inventory-module-screen";
import { ErpShell } from "@/components/school/erp-shell";
import { UserManagementPanel } from "@/components/school/user-management-panel";
import { SupportCenterWorkspace } from "@/components/support/support-center-workspace";
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
import { getCsrfToken } from "@/lib/auth/csrf-client";
import type { ExperienceNotificationItem } from "@/lib/experiences/types";
import { getSchoolKpiSummary, getSchoolWorkspace, schoolSectionLabels, type SchoolExperienceRole, type SchoolSubscriptionView } from "@/lib/experiences/school-data";
import { toSchoolPath, toSchoolStudentPath } from "@/lib/routing/experience-routes";

type SchoolRouteMode = "hosted" | "public";
type ManualReceiptMethod = "cash" | "cheque" | "bank_deposit" | "eft" | "mpesa_c2b";
type ManualReceiptStatus = "received" | "deposited" | "cleared" | "bounced" | "reversed";
type MpesaC2bStatus = "pending_review" | "matched" | "rejected";

type ManualReceiptResponse = {
  id: string;
  receipt_number: string;
  payment_method: ManualReceiptMethod;
  status: ManualReceiptStatus;
  student_id: string | null;
  invoice_id: string | null;
  amount_minor: string;
  payer_name: string | null;
  received_at: string;
  cheque_number: string | null;
  drawer_bank: string | null;
  deposit_reference: string | null;
  ledger_transaction_id: string | null;
  reversal_ledger_transaction_id: string | null;
  notes: string | null;
};

type MpesaC2bPaymentResponse = {
  id: string;
  trans_id: string;
  business_short_code: string;
  bill_ref_number: string | null;
  invoice_number: string | null;
  amount_minor: string;
  phone_number: string | null;
  payer_name: string | null;
  status: MpesaC2bStatus;
  matched_invoice_id: string | null;
  matched_student_id: string | null;
  ledger_transaction_id: string | null;
  received_at: string;
};

type FinanceActivityResponse = {
  id: string;
  kind: "invoice" | "receipt";
  student_id: string | null;
  student_name: string | null;
  invoice_id: string | null;
  amount_minor: string;
  method: string;
  status: string;
  reference: string;
  occurred_at: string;
  ledger_transaction_id: string | null;
};

type StudentFeeBalanceResponse = {
  tenant_id: string;
  student_id: string;
  student_name: string | null;
  currency_code: string;
  invoiced_amount_minor: string;
  paid_amount_minor: string;
  credit_amount_minor: string;
  balance_amount_minor: string;
  invoice_count: number;
  last_activity_at: string | null;
};

type StudentFeeStatementEntryResponse = {
  id: string;
  kind: "invoice" | "receipt";
  source_id: string;
  invoice_id: string | null;
  reference: string;
  description: string;
  status: string;
  method: string;
  debit_amount_minor: string;
  credit_amount_minor: string;
  balance_after_minor: string;
  occurred_at: string;
  ledger_transaction_id: string | null;
};

type StudentFeeStatementResponse = {
  summary: StudentFeeBalanceResponse;
  entries: StudentFeeStatementEntryResponse[];
};

type CsvReportArtifactResponse = {
  filename: string;
  content_type: string;
  csv: string;
};

type FinanceReconciliationBucket = "cleared" | "pending" | "exception";

type FinanceReconciliationTotals = {
  transaction_count: number;
  total_amount_minor: string;
  cleared_count: number;
  cleared_amount_minor: string;
  pending_count: number;
  pending_amount_minor: string;
  exception_count: number;
  exception_amount_minor: string;
};

type FinanceReconciliationMethodSummary = {
  payment_method: ManualReceiptMethod;
  transaction_count: number;
  total_amount_minor: string;
  cleared_amount_minor: string;
  pending_amount_minor: string;
  exception_amount_minor: string;
};

type FinanceReconciliationRow = {
  payment_id: string;
  receipt_number: string;
  payment_method: ManualReceiptMethod;
  status: ManualReceiptStatus;
  reconciliation_bucket: FinanceReconciliationBucket;
  amount_minor: string;
  currency_code: string;
  occurred_at: string;
  reference: string;
  payer_name: string | null;
  student_id: string | null;
  invoice_id: string | null;
  ledger_transaction_id: string | null;
  reversal_ledger_transaction_id: string | null;
};

type FinanceReconciliationResponse = {
  period: {
    from: string;
    to: string;
    payment_method: ManualReceiptMethod | null;
  };
  totals: FinanceReconciliationTotals;
  method_summaries: FinanceReconciliationMethodSummary[];
  rows: FinanceReconciliationRow[];
};

type FeeStructureLineItemResponse = {
  code: string;
  label: string;
  amount_minor: string;
};

type FeeStructureResponse = {
  id: string;
  name: string;
  academic_year: string;
  term: string;
  grade_level: string;
  class_name: string | null;
  currency_code: string;
  status: "draft" | "active" | "archived";
  due_days: number;
  line_items: FeeStructureLineItemResponse[];
  total_amount_minor: string;
  created_at: string;
};

type BulkFeeInvoiceGenerationResponse = {
  fee_structure_id: string;
  idempotency_key: string;
  generated_count: number;
  skipped_count: number;
};

type BillableFeeStudentResponse = {
  student_id: string;
  student_name: string;
  admission_number: string;
  grade_level: string;
  class_name: string | null;
  guardian_phone: string | null;
};

type FinanceActivityRow = {
  id: string;
  student: string;
  amount: string;
  method: string;
  date: string;
  reference: string;
  status: string;
  statusTone: "ok" | "warning" | "critical";
};

type FeeLineItemDraft = {
  id: string;
  code: string;
  label: string;
  amount: string;
};

type BulkFeeStudentDraft = {
  id: string;
  student_id: string;
  student_name: string;
  admission_number: string;
  class_name: string;
  guardian_phone: string;
};

const manualReceiptMethodLabels: Record<ManualReceiptMethod, string> = {
  cash: "Cash",
  cheque: "Cheque",
  bank_deposit: "Bank deposit",
  eft: "EFT",
  mpesa_c2b: "M-PESA Paybill",
};

const manualReceiptSelectableMethods: ManualReceiptMethod[] = [
  "cash",
  "cheque",
  "bank_deposit",
  "eft",
];

const manualReceiptStatusTone: Record<ManualReceiptStatus, "ok" | "warning" | "critical"> = {
  received: "warning",
  deposited: "warning",
  cleared: "ok",
  bounced: "critical",
  reversed: "warning",
};

const mpesaC2bStatusTone: Record<MpesaC2bStatus, "ok" | "warning" | "critical"> = {
  pending_review: "warning",
  matched: "ok",
  rejected: "critical",
};

const financeReconciliationBucketTone: Record<FinanceReconciliationBucket, "ok" | "warning" | "critical"> = {
  cleared: "ok",
  pending: "warning",
  exception: "critical",
};

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

  if (normalized === "library" || normalized.startsWith("library/")) {
    return `/${normalized}`;
  }

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

function formatMinorKes(amountMinor: string) {
  const value = Number(amountMinor);

  if (!Number.isFinite(value)) {
    return "KES 0";
  }

  return formatKesAmount(value / 100);
}

function toMinorUnits(amount: string) {
  const parsed = parsePositiveAmount(amount);

  if (parsed === null) {
    return null;
  }

  return String(Math.round(parsed * 100));
}

function buildFeeStructureLineItems(drafts: FeeLineItemDraft[]) {
  const activeDrafts = drafts.filter((draft) =>
    [draft.code, draft.label, draft.amount].some((value) => value.trim().length > 0),
  );
  const seenCodes = new Set<string>();
  const lineItems: FeeStructureLineItemResponse[] = [];

  if (activeDrafts.length === 0) {
    return { error: "At least one fee line item is required.", lineItems };
  }

  for (const draft of activeDrafts) {
    const code = draft.code.trim().toLowerCase();
    const label = draft.label.trim();
    const amountMinor = toMinorUnits(draft.amount);

    if (!code || !label || !draft.amount.trim()) {
      return { error: "Each fee line item needs a code, label, and amount.", lineItems };
    }

    if (!amountMinor) {
      return { error: "Fee line item amounts must be greater than zero.", lineItems };
    }

    if (seenCodes.has(code)) {
      return { error: `Duplicate fee line item code "${code}".`, lineItems };
    }

    seenCodes.add(code);
    lineItems.push({ code, label, amount_minor: amountMinor });
  }

  return { error: null, lineItems };
}

function buildBulkFeeStudents(drafts: BulkFeeStudentDraft[]) {
  const activeDrafts = drafts.filter((draft) =>
    [draft.student_id, draft.student_name, draft.admission_number, draft.class_name, draft.guardian_phone].some(
      (value) => value.trim().length > 0,
    ),
  );
  const seenStudentIds = new Set<string>();
  const students: Array<Omit<BulkFeeStudentDraft, "id">> = [];

  if (activeDrafts.length === 0) {
    return { error: "At least one student is required for bulk billing.", students };
  }

  for (const draft of activeDrafts) {
    const studentId = draft.student_id.trim();
    const studentName = draft.student_name.trim();

    if (!studentId || !studentName) {
      return { error: "Each billing row needs a student ID and student name.", students };
    }

    if (seenStudentIds.has(studentId)) {
      return { error: `Student "${studentId}" appears more than once.`, students };
    }

    seenStudentIds.add(studentId);
    students.push({
      student_id: studentId,
      student_name: studentName,
      admission_number: draft.admission_number.trim(),
      class_name: draft.class_name.trim(),
      guardian_phone: draft.guardian_phone.trim(),
    });
  }

  return { error: null, students };
}

function getTodayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function getMonthStartInputValue() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
}

function createDraftId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createEmptyFeeLineItemDraft(): FeeLineItemDraft {
  return {
    id: createDraftId("fee-line"),
    code: "",
    label: "",
    amount: "",
  };
}

function createEmptyBulkFeeStudentDraft(): BulkFeeStudentDraft {
  return {
    id: createDraftId("bulk-student"),
    student_id: "",
    student_name: "",
    admission_number: "",
    class_name: "",
    guardian_phone: "",
  };
}

function formatActivityDate(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "Unknown";
  }

  return parsed.toLocaleDateString("en-KE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getFinanceActivityTone(activity: FinanceActivityResponse): "ok" | "warning" | "critical" {
  if (activity.kind === "invoice") {
    return activity.status === "paid" ? "ok" : "warning";
  }

  if (activity.status === "cleared") {
    return "ok";
  }

  return activity.status === "bounced" || activity.status === "reversed" ? "critical" : "warning";
}

function getStatementEntryTone(entry: StudentFeeStatementEntryResponse): "ok" | "warning" | "critical" {
  if (["paid", "cleared"].includes(entry.status)) {
    return "ok";
  }

  if (["bounced", "reversed", "void"].includes(entry.status)) {
    return "critical";
  }

  return "warning";
}

function toFinanceActivityRow(activity: FinanceActivityResponse): FinanceActivityRow {
  return {
    id: activity.id,
    student: activity.student_name ?? activity.student_id ?? "Unassigned",
    amount: formatMinorKes(activity.amount_minor),
    method:
      activity.kind === "invoice"
        ? "Invoice"
        : manualReceiptMethodLabels[activity.method as ManualReceiptMethod] ?? activity.method,
    date: formatActivityDate(activity.occurred_at),
    reference: activity.reference,
    status: activity.status.replace("_", " "),
    statusTone: getFinanceActivityTone(activity),
  };
}

function sumFinanceActivityMinor(
  activities: FinanceActivityResponse[],
  predicate: (activity: FinanceActivityResponse) => boolean,
) {
  return activities
    .filter(predicate)
    .reduce((total, activity) => {
      try {
        return total + BigInt(activity.amount_minor);
      } catch {
        return total;
      }
    }, BigInt(0))
    .toString();
}

function buildFinanceSummaryItems(
  activities: FinanceActivityResponse[],
  loading: boolean,
) {
  const invoicedMinor = sumFinanceActivityMinor(activities, (activity) => activity.kind === "invoice");
  const collectedMinor = sumFinanceActivityMinor(
    activities,
    (activity) => activity.kind === "receipt" && activity.status === "cleared",
  );
  const pendingReviewCount = activities.filter(
    (activity) =>
      activity.kind === "receipt" &&
      ["received", "deposited"].includes(activity.status),
  ).length;
  const outstandingMinor = (BigInt(invoicedMinor) - BigInt(collectedMinor)).toString();

  return [
    {
      id: "invoiced",
      label: "Invoiced",
      value: loading ? "Loading" : formatMinorKes(invoicedMinor),
      helper: "Live fee invoices",
    },
    {
      id: "collected",
      label: "Collected",
      value: loading ? "Loading" : formatMinorKes(collectedMinor),
      helper: "Cleared receipts",
    },
    {
      id: "outstanding",
      label: "Outstanding",
      value: loading ? "Loading" : formatMinorKes(BigInt(outstandingMinor) > BigInt(0) ? outstandingMinor : "0"),
      helper: "Invoice less cleared receipts",
    },
    {
      id: "pending-review",
      label: "Pending review",
      value: loading ? "Loading" : String(pendingReviewCount),
      helper: "Receipts awaiting clearance",
    },
  ];
}

function buildSchoolQuickActions(role: SchoolExperienceRole, routeMode: SchoolRouteMode) {
  if (role === "librarian") {
    return [
      {
        id: "open-library",
        label: "Open Catalog",
        description: "Manage catalog, borrowing, returns, and fines.",
        href: "/library",
        icon: BookOpenCheck,
      },
      {
        id: "library-reports",
        label: "Reports",
        description: "Review overdue items, loans, fines, and inventory movement.",
        href: "/library/reports",
        icon: FileSpreadsheet,
      },
    ];
  }

  return [
    { id: "record-payment", label: "Record Payment", description: "Post a school payment quickly", href: buildSchoolSectionHref(role, "finance", routeMode), icon: FileSpreadsheet },
    { id: "add-student", label: "Add Student", description: "Create a learner record", href: buildSchoolSectionHref(role, "students", routeMode), icon: UserPlus },
    { id: "send-sms", label: "Send SMS", description: "Reach families or a class stream", href: buildSchoolSectionHref(role, "communication", routeMode), icon: Send },
    { id: "print-report", label: "Print Report", description: "Open class or fee reports", href: buildSchoolSectionHref(role, "reports", routeMode), icon: Printer },
  ];
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
        actions={buildSchoolQuickActions(role, routeMode)}
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
            tone: item.category === "payment" ? "ok" : "ok",
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
              placeholder="Learner full name"
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
              placeholder="Admission number"
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
              placeholder="Class and stream"
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
              placeholder="Parent phone number"
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
                    { id: "call", title: "Call parent", subtitle: "Discuss balances or classroom updates", value: "Available" },
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
  const { subscription } = getSchoolWorkspace(role, tenantSlug);
  const [activity, setActivity] = useState<FinanceActivityResponse[]>([]);
  const [rows, setRows] = useState<FinanceActivityRow[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const [balances, setBalances] = useState<StudentFeeBalanceResponse[]>([]);
  const [balancesLoading, setBalancesLoading] = useState(true);
  const [statement, setStatement] = useState<StudentFeeStatementResponse | null>(null);
  const [statementLoading, setStatementLoading] = useState(false);
  const [statementError, setStatementError] = useState<string | null>(null);
  const [reconciliation, setReconciliation] = useState<FinanceReconciliationResponse | null>(null);
  const [reconciliationLoading, setReconciliationLoading] = useState(true);
  const [reconciliationError, setReconciliationError] = useState<string | null>(null);
  const [reconciliationFilters, setReconciliationFilters] = useState<{
    from: string;
    to: string;
    method: ManualReceiptMethod | "all";
  }>(() => ({
    from: getMonthStartInputValue(),
    to: getTodayInputValue(),
    method: "all",
  }));
  const [feeStructures, setFeeStructures] = useState<FeeStructureResponse[]>([]);
  const [feeStructuresLoading, setFeeStructuresLoading] = useState(true);
  const [feeStructureError, setFeeStructureError] = useState<string | null>(null);
  const [feeStructureDraft, setFeeStructureDraft] = useState({
    name: "",
    academic_year: String(new Date().getFullYear()),
    term: "",
    grade_level: "",
    class_name: "",
    status: "active" as FeeStructureResponse["status"],
    due_days: "14",
  });
  const [feeLineItems, setFeeLineItems] = useState<FeeLineItemDraft[]>(() => [
    createEmptyFeeLineItemDraft(),
  ]);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [billableStudents, setBillableStudents] = useState<BillableFeeStudentResponse[]>([]);
  const [billableStudentsLoading, setBillableStudentsLoading] = useState(false);
  const [bulkDraft, setBulkDraft] = useState({
    fee_structure_id: "",
    idempotency_key: "",
    due_at: "",
  });
  const [bulkStudents, setBulkStudents] = useState<BulkFeeStudentDraft[]>(() => [
    createEmptyBulkFeeStudentDraft(),
  ]);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [invoiceDraft, setInvoiceDraft] = useState({ studentId: "", studentName: "", amount: "", dueAt: "" });
  const [paymentDraft, setPaymentDraft] = useState({
    payment_method: "cash" as ManualReceiptMethod,
    student_id: "",
    invoice_id: "",
    payer_name: "",
    amount: "",
    reference: "",
  });
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [financeMessage, setFinanceMessage] = useState<string | null>(null);

  async function loadFinanceActivity() {
    setActivityLoading(true);

    try {
      const response = await fetch(buildBillingApiPath("/api/billing/finance-activity", tenantSlug), {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Finance activity could not be loaded.");
      }

      const payload = (await response.json()) as FinanceActivityResponse[];
      setActivity(payload);
      setRows(payload.map(toFinanceActivityRow));
    } catch (caught) {
      setActivity([]);
      setRows([]);
      setFinanceMessage(caught instanceof Error ? caught.message : "Finance activity could not be loaded.");
    } finally {
      setActivityLoading(false);
    }
  }

  async function loadStudentBalances() {
    setBalancesLoading(true);

    try {
      const response = await fetch(buildBillingApiPath("/api/billing/student-balances", tenantSlug), {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Student balances could not be loaded.");
      }

      const payload = (await response.json()) as StudentFeeBalanceResponse[];
      setBalances(payload);
    } catch (caught) {
      setBalances([]);
      setFinanceMessage(caught instanceof Error ? caught.message : "Student balances could not be loaded.");
    } finally {
      setBalancesLoading(false);
    }
  }

  async function loadReconciliationReport() {
    setReconciliationLoading(true);
    setReconciliationError(null);

    const params = new URLSearchParams();

    if (reconciliationFilters.from) {
      params.set("from", reconciliationFilters.from);
    }

    if (reconciliationFilters.to) {
      params.set("to", reconciliationFilters.to);
    }

    if (reconciliationFilters.method !== "all") {
      params.set("method", reconciliationFilters.method);
    }

    try {
      const response = await fetch(
        buildBillingApiPath(`/api/billing/reconciliation?${params.toString()}`, tenantSlug),
        { cache: "no-store" },
      );
      const payload = (await response.json().catch(() => null)) as
        | FinanceReconciliationResponse
        | { message?: string }
        | null;

      if (!response.ok || !payload || !("rows" in payload)) {
        throw new Error(
          payload && "message" in payload && payload.message
            ? payload.message
            : "Reconciliation report could not be loaded.",
        );
      }

      setReconciliation(payload);
    } catch (caught) {
      setReconciliation(null);
      setReconciliationError(caught instanceof Error ? caught.message : "Reconciliation report could not be loaded.");
    } finally {
      setReconciliationLoading(false);
    }
  }

  async function loadFeeStructures() {
    setFeeStructuresLoading(true);
    setFeeStructureError(null);

    try {
      const response = await fetch(buildBillingApiPath("/api/billing/fee-structures", tenantSlug), {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as
        | FeeStructureResponse[]
        | { message?: string }
        | null;

      if (!response.ok || !Array.isArray(payload)) {
        throw new Error(
          payload && !Array.isArray(payload) && payload.message
            ? payload.message
            : "Fee structures could not be loaded.",
        );
      }

      setFeeStructures(payload);
      setBulkDraft((current) => ({
        ...current,
        fee_structure_id: current.fee_structure_id || payload[0]?.id || "",
      }));
    } catch (caught) {
      setFeeStructures([]);
      setFeeStructureError(caught instanceof Error ? caught.message : "Fee structures could not be loaded.");
    } finally {
      setFeeStructuresLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadFinanceActivity();
      void loadStudentBalances();
      void loadReconciliationReport();
      void loadFeeStructures();
    }, 0);

    return () => window.clearTimeout(timer);
    // The initial finance loaders are intentionally scoped to the active tenant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantSlug]);

  function openInvoiceModal() {
    setInvoiceDraft({ studentId: "", studentName: "", amount: "", dueAt: "" });
    setInvoiceError(null);
    setShowInvoiceModal(true);
  }

  function closeInvoiceModal() {
    setShowInvoiceModal(false);
    setInvoiceError(null);
  }

  function openPaymentModal() {
    setPaymentDraft({
      payment_method: "cash",
      student_id: "",
      invoice_id: "",
      payer_name: "",
      amount: "",
      reference: "",
    });
    setPaymentError(null);
    setShowPaymentModal(true);
  }

  function closePaymentModal() {
    setShowPaymentModal(false);
    setPaymentError(null);
  }

  function closeStatementModal() {
    setStatement(null);
    setStatementError(null);
    setStatementLoading(false);
  }

  async function openStudentStatement(balance: StudentFeeBalanceResponse) {
    setStatementError(null);
    setStatementLoading(true);

    try {
      const response = await fetch(
        buildBillingApiPath(
          `/api/billing/student-balances/${encodeURIComponent(balance.student_id)}/statement`,
          tenantSlug,
        ),
        { cache: "no-store" },
      );
      const payload = (await response.json().catch(() => null)) as
        | StudentFeeStatementResponse
        | { message?: string }
        | null;

      if (!response.ok || !payload || !("entries" in payload)) {
        throw new Error(
          payload && "message" in payload && payload.message
            ? payload.message
            : "Student statement could not be loaded.",
        );
      }

      setStatement(payload);
    } catch (caught) {
      setStatement(null);
      setStatementError(caught instanceof Error ? caught.message : "Student statement could not be loaded.");
    } finally {
      setStatementLoading(false);
    }
  }

  async function exportStudentStatement(studentId: string) {
    setStatementError(null);

    try {
      const response = await fetch(
        buildBillingApiPath(
          `/api/billing/student-balances/${encodeURIComponent(studentId)}/statement/export`,
          tenantSlug,
        ),
        { cache: "no-store" },
      );
      const payload = (await response.json().catch(() => null)) as
        | CsvReportArtifactResponse
        | { message?: string }
        | null;

      if (!response.ok || !payload || !("csv" in payload)) {
        throw new Error(
          payload && "message" in payload && payload.message
            ? payload.message
            : "Student statement export could not be prepared.",
        );
      }

      downloadTextFile({
        filename: payload.filename,
        content: payload.csv,
        mimeType: payload.content_type,
      });
    } catch (caught) {
      setStatementError(caught instanceof Error ? caught.message : "Student statement export could not be prepared.");
    }
  }

  async function exportReconciliationReport() {
    setReconciliationError(null);

    const params = new URLSearchParams();

    if (reconciliationFilters.from) {
      params.set("from", reconciliationFilters.from);
    }

    if (reconciliationFilters.to) {
      params.set("to", reconciliationFilters.to);
    }

    if (reconciliationFilters.method !== "all") {
      params.set("method", reconciliationFilters.method);
    }

    try {
      const response = await fetch(
        buildBillingApiPath(`/api/billing/reconciliation/export?${params.toString()}`, tenantSlug),
        { cache: "no-store" },
      );
      const payload = (await response.json().catch(() => null)) as
        | CsvReportArtifactResponse
        | { message?: string }
        | null;

      if (!response.ok || !payload || !("csv" in payload)) {
        throw new Error(
          payload && "message" in payload && payload.message
            ? payload.message
            : "Reconciliation export could not be prepared.",
        );
      }

      downloadTextFile({
        filename: payload.filename,
        content: payload.csv,
        mimeType: payload.content_type,
      });
    } catch (caught) {
      setReconciliationError(caught instanceof Error ? caught.message : "Reconciliation export could not be prepared.");
    }
  }

  function updateFeeLineItem(
    id: string,
    field: keyof Omit<FeeLineItemDraft, "id">,
    value: string,
  ) {
    setFeeLineItems((current) =>
      current.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
    );
    setFeeStructureError(null);
  }

  function removeFeeLineItem(id: string) {
    setFeeLineItems((current) =>
      current.length === 1 ? [createEmptyFeeLineItemDraft()] : current.filter((item) => item.id !== id),
    );
    setFeeStructureError(null);
  }

  function updateBulkStudent(
    id: string,
    field: keyof Omit<BulkFeeStudentDraft, "id">,
    value: string,
  ) {
    setBulkStudents((current) =>
      current.map((student) => (student.id === id ? { ...student, [field]: value } : student)),
    );
    setBulkError(null);
  }

  function removeBulkStudent(id: string) {
    setBulkStudents((current) =>
      current.length === 1 ? [createEmptyBulkFeeStudentDraft()] : current.filter((student) => student.id !== id),
    );
    setBulkError(null);
  }

  async function saveFeeStructure() {
    const validationError = getMissingFieldError([
      { label: "Fee name", value: feeStructureDraft.name },
      { label: "Academic year", value: feeStructureDraft.academic_year },
      { label: "Term", value: feeStructureDraft.term },
      { label: "Grade level", value: feeStructureDraft.grade_level },
    ]);
    const dueDays = Number(feeStructureDraft.due_days);
    const lineItemResult = buildFeeStructureLineItems(feeLineItems);

    if (validationError) {
      setFeeStructureError(validationError);
      return;
    }

    if (!Number.isInteger(dueDays) || dueDays < 0 || dueDays > 365) {
      setFeeStructureError("Due days must be a whole number between 0 and 365.");
      return;
    }

    if (lineItemResult.error) {
      setFeeStructureError(lineItemResult.error);
      return;
    }

    try {
      const csrfToken = await getCsrfToken();
      const response = await fetch(buildBillingApiPath("/api/billing/fee-structures", tenantSlug), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-shulehub-csrf": csrfToken,
        },
        body: JSON.stringify({
          name: feeStructureDraft.name.trim(),
          academic_year: feeStructureDraft.academic_year.trim(),
          term: feeStructureDraft.term.trim(),
          grade_level: feeStructureDraft.grade_level.trim(),
          class_name: feeStructureDraft.class_name.trim() || undefined,
          status: feeStructureDraft.status,
          due_days: dueDays,
          line_items: lineItemResult.lineItems,
          metadata: {
            source: "school_finance_fee_setup",
          },
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | FeeStructureResponse
        | { message?: string }
        | null;

      if (!response.ok || !payload || !("id" in payload)) {
        throw new Error(payload && "message" in payload && payload.message ? payload.message : "Fee structure could not be saved.");
      }

      setFeeStructureError(null);
      setFinanceMessage(`${payload.name} saved for ${payload.grade_level}.`);
      setBulkDraft((current) => ({ ...current, fee_structure_id: payload.id }));
      setFeeStructureDraft((current) => ({
        ...current,
        name: "",
        term: "",
        grade_level: "",
        class_name: "",
      }));
      setFeeLineItems([createEmptyFeeLineItemDraft()]);
      await loadFeeStructures();
    } catch (caught) {
      setFeeStructureError(caught instanceof Error ? caught.message : "Fee structure could not be saved.");
    }
  }

  async function archiveFeeStructure(feeStructure: FeeStructureResponse) {
    try {
      const csrfToken = await getCsrfToken();
      const response = await fetch(
        buildBillingApiPath(`/api/billing/fee-structures/${encodeURIComponent(feeStructure.id)}/archive`, tenantSlug),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-shulehub-csrf": csrfToken,
          },
        },
      );
      const payload = (await response.json().catch(() => null)) as
        | FeeStructureResponse
        | { message?: string }
        | null;

      if (!response.ok || !payload || !("id" in payload)) {
        throw new Error(payload && "message" in payload && payload.message ? payload.message : "Fee structure could not be archived.");
      }

      setFeeStructureError(null);
      setFinanceMessage(`${payload.name} archived.`);
      setBillableStudents([]);
      setBulkDraft((current) => ({
        ...current,
        fee_structure_id: current.fee_structure_id === payload.id ? "" : current.fee_structure_id,
      }));
      await loadFeeStructures();
    } catch (caught) {
      setFeeStructureError(caught instanceof Error ? caught.message : "Fee structure could not be archived.");
    }
  }

  async function generateBulkFeeInvoices() {
    const selectedFeeStructureId = bulkDraft.fee_structure_id.trim();
    const studentResult = buildBulkFeeStudents(bulkStudents);

    if (!selectedFeeStructureId) {
      setBulkError("Select a fee structure before generating invoices.");
      return;
    }

    if (studentResult.error) {
      setBulkError(studentResult.error);
      return;
    }

    try {
      const csrfToken = await getCsrfToken();
      const idempotencyKey =
        bulkDraft.idempotency_key.trim() ||
        `bulk-fees-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const response = await fetch(
        buildBillingApiPath(`/api/billing/fee-structures/${encodeURIComponent(selectedFeeStructureId)}/generate-invoices`, tenantSlug),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-shulehub-csrf": csrfToken,
          },
          body: JSON.stringify({
            idempotency_key: idempotencyKey,
            due_at: bulkDraft.due_at.trim()
              ? new Date(`${bulkDraft.due_at.trim()}T23:59:59.000Z`).toISOString()
              : undefined,
            target_students: studentResult.students.map((student) => ({
              student_id: student.student_id,
              student_name: student.student_name,
              admission_number: student.admission_number || undefined,
              class_name: student.class_name || undefined,
              guardian_phone: student.guardian_phone || undefined,
            })),
            metadata: {
              source: "school_finance_bulk_billing",
            },
          }),
        },
      );
      const payload = (await response.json().catch(() => null)) as
        | BulkFeeInvoiceGenerationResponse
        | { message?: string }
        | null;

      if (!response.ok || !payload || !("generated_count" in payload)) {
        throw new Error(payload && "message" in payload && payload.message ? payload.message : "Bulk invoices could not be generated.");
      }

      setBulkError(null);
      setFinanceMessage(`${payload.generated_count} invoices generated; ${payload.skipped_count} duplicate rows skipped.`);
      setBulkDraft((current) => ({ ...current, idempotency_key: "", due_at: "" }));
      setBulkStudents([createEmptyBulkFeeStudentDraft()]);
      await loadFinanceActivity();
      await loadStudentBalances();
      await loadReconciliationReport();
    } catch (caught) {
      setBulkError(caught instanceof Error ? caught.message : "Bulk invoices could not be generated.");
    }
  }

  async function loadBillableStudentsForSelectedFeeStructure() {
    const selectedFeeStructureId = bulkDraft.fee_structure_id.trim();

    if (!selectedFeeStructureId) {
      setBulkError("Select a fee structure before loading roster students.");
      return;
    }

    setBillableStudentsLoading(true);
    setBulkError(null);

    try {
      const response = await fetch(
        buildBillingApiPath(`/api/billing/fee-structures/${encodeURIComponent(selectedFeeStructureId)}/billable-students`, tenantSlug),
        { cache: "no-store" },
      );
      const payload = (await response.json().catch(() => null)) as
        | BillableFeeStudentResponse[]
        | { message?: string }
        | null;

      if (!response.ok || !Array.isArray(payload)) {
        throw new Error(
          payload && !Array.isArray(payload) && payload.message
            ? payload.message
            : "Billable roster could not be loaded.",
        );
      }

      setBillableStudents(payload);

      if (payload.length === 0) {
        setBulkStudents([createEmptyBulkFeeStudentDraft()]);
        setFinanceMessage("No active roster students matched this fee structure.");
        return;
      }

      setBulkStudents(
        payload.map((student) => ({
          id: student.student_id,
          student_id: student.student_id,
          student_name: student.student_name,
          admission_number: student.admission_number,
          class_name: student.class_name ?? student.grade_level,
          guardian_phone: student.guardian_phone ?? "",
        })),
      );
      setFinanceMessage(`${payload.length} roster students loaded for bulk billing.`);
    } catch (caught) {
      setBillableStudents([]);
      setBulkError(caught instanceof Error ? caught.message : "Billable roster could not be loaded.");
    } finally {
      setBillableStudentsLoading(false);
    }
  }

  async function saveInvoice() {
    const validationError = getMissingFieldError([
      { label: "Student ID", value: invoiceDraft.studentId },
      { label: "Student name", value: invoiceDraft.studentName },
      { label: "Amount", value: invoiceDraft.amount },
    ]);
    const amountMinor = toMinorUnits(invoiceDraft.amount);

    if (validationError) {
      setInvoiceError(validationError);
      return;
    }

    if (!amountMinor) {
      setInvoiceError("Amount must be a number greater than zero.");
      return;
    }

    try {
      const csrfToken = await getCsrfToken();
      const response = await fetch(buildBillingApiPath("/api/billing/invoices", tenantSlug), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-shulehub-csrf": csrfToken,
        },
        body: JSON.stringify({
          description: `Fees for ${invoiceDraft.studentName.trim()}`,
          total_amount_minor: amountMinor,
          due_at: invoiceDraft.dueAt.trim()
            ? new Date(invoiceDraft.dueAt.trim()).toISOString()
            : undefined,
          metadata: {
            student_id: invoiceDraft.studentId.trim(),
            student_name: invoiceDraft.studentName.trim(),
          },
        }),
      });
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.message ?? "Invoice could not be created.");
      }

      setInvoiceError(null);
      setFinanceMessage(`Invoice created for ${invoiceDraft.studentName.trim()}.`);
      setInvoiceDraft({ studentId: "", studentName: "", amount: "", dueAt: "" });
      setShowInvoiceModal(false);
      await loadFinanceActivity();
      await loadStudentBalances();
    } catch (caught) {
      setInvoiceError(caught instanceof Error ? caught.message : "Invoice could not be created.");
    }
  }

  async function savePayment() {
    const validationError = getMissingFieldError([
      { label: "Student or invoice", value: paymentDraft.student_id || paymentDraft.invoice_id },
      { label: "Amount", value: paymentDraft.amount },
      { label: "Reference", value: paymentDraft.reference },
    ]);
    const amountMinor = toMinorUnits(paymentDraft.amount);

    if (validationError) {
      setPaymentError(validationError);
      return;
    }

    if (!amountMinor) {
      setPaymentError("Amount must be a number greater than zero.");
      return;
    }

    try {
      const csrfToken = await getCsrfToken();
      const response = await fetch(buildBillingApiPath("/api/billing/manual-fee-payments", tenantSlug), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-shulehub-csrf": csrfToken,
        },
        body: JSON.stringify({
          idempotency_key: `finance-quick-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          payment_method: paymentDraft.payment_method,
          amount_minor: amountMinor,
          student_id: paymentDraft.student_id.trim() || undefined,
          invoice_id: paymentDraft.invoice_id.trim() || undefined,
          payer_name: paymentDraft.payer_name.trim() || undefined,
          deposit_reference: paymentDraft.reference.trim(),
          external_reference: paymentDraft.reference.trim(),
          metadata: {
            source: "school_finance_quick_entry",
            student_name: paymentDraft.payer_name.trim() || undefined,
          },
        }),
      });
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.message ?? "Payment could not be recorded.");
      }

      setPaymentError(null);
      setFinanceMessage("Payment recorded and posted to finance activity.");
      setPaymentDraft({
        payment_method: "cash",
        student_id: "",
        invoice_id: "",
        payer_name: "",
        amount: "",
        reference: "",
      });
      setShowPaymentModal(false);
      await loadFinanceActivity();
      await loadStudentBalances();
      await loadReconciliationReport();
    } catch (caught) {
      setPaymentError(caught instanceof Error ? caught.message : "Payment could not be recorded.");
    }
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
      <MetricGrid items={buildFinanceSummaryItems(activity, activityLoading)} />
      <SubscriptionLifecyclePanel subscription={subscription} role={role} routeMode={routeMode} />
      <section className="space-y-5 rounded-xl border border-border bg-surface px-5 py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fee setup</p>
            <h3 className="mt-1 text-lg font-semibold text-foreground">Term billing control</h3>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              Build structured fees, then generate controlled invoices for the selected student rows.
            </p>
          </div>
          <Button variant="secondary" onClick={() => void loadFeeStructures()}>
            Refresh
          </Button>
        </div>
        {feeStructureError ? (
          <div role="alert" className="rounded-xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-foreground">
            {feeStructureError}
          </div>
        ) : null}
        {bulkError ? (
          <div role="alert" className="rounded-xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-foreground">
            {bulkError}
          </div>
        ) : null}
        <div className="grid gap-5 xl:grid-cols-2">
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-2 text-sm text-foreground md:col-span-2">
                <span className="font-medium">Fee name</span>
                <input
                  aria-label="Fee structure name"
                  className="input-base"
                  value={feeStructureDraft.name}
                  onChange={(event) => {
                    setFeeStructureDraft((current) => ({ ...current, name: event.target.value }));
                    setFeeStructureError(null);
                  }}
                />
              </label>
              <label className="space-y-2 text-sm text-foreground">
                <span className="font-medium">Academic year</span>
                <input
                  aria-label="Fee structure academic year"
                  className="input-base"
                  value={feeStructureDraft.academic_year}
                  onChange={(event) => {
                    setFeeStructureDraft((current) => ({ ...current, academic_year: event.target.value }));
                    setFeeStructureError(null);
                  }}
                />
              </label>
              <label className="space-y-2 text-sm text-foreground">
                <span className="font-medium">Term</span>
                <input
                  aria-label="Fee structure term"
                  className="input-base"
                  value={feeStructureDraft.term}
                  onChange={(event) => {
                    setFeeStructureDraft((current) => ({ ...current, term: event.target.value }));
                    setFeeStructureError(null);
                  }}
                />
              </label>
              <label className="space-y-2 text-sm text-foreground">
                <span className="font-medium">Grade level</span>
                <input
                  aria-label="Fee structure grade level"
                  className="input-base"
                  value={feeStructureDraft.grade_level}
                  onChange={(event) => {
                    setFeeStructureDraft((current) => ({ ...current, grade_level: event.target.value }));
                    setFeeStructureError(null);
                  }}
                />
              </label>
              <label className="space-y-2 text-sm text-foreground">
                <span className="font-medium">Class</span>
                <input
                  aria-label="Fee structure class"
                  className="input-base"
                  value={feeStructureDraft.class_name}
                  onChange={(event) => {
                    setFeeStructureDraft((current) => ({ ...current, class_name: event.target.value }));
                    setFeeStructureError(null);
                  }}
                />
              </label>
              <label className="space-y-2 text-sm text-foreground">
                <span className="font-medium">Status</span>
                <select
                  aria-label="Fee structure status"
                  className="input-base"
                  value={feeStructureDraft.status}
                  onChange={(event) => {
                    setFeeStructureDraft((current) => ({
                      ...current,
                      status: event.target.value as FeeStructureResponse["status"],
                    }));
                    setFeeStructureError(null);
                  }}
                >
                  <option value="active">Active</option>
                  <option value="draft">Draft</option>
                  <option value="archived">Archived</option>
                </select>
              </label>
              <label className="space-y-2 text-sm text-foreground">
                <span className="font-medium">Due days</span>
                <input
                  aria-label="Fee structure due days"
                  className="input-base"
                  inputMode="numeric"
                  value={feeStructureDraft.due_days}
                  onChange={(event) => {
                    setFeeStructureDraft((current) => ({ ...current, due_days: event.target.value }));
                    setFeeStructureError(null);
                  }}
                />
              </label>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-foreground">Line items</p>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setFeeLineItems((current) => [...current, createEmptyFeeLineItemDraft()])}
                >
                  Add line
                </Button>
              </div>
              {feeLineItems.map((item) => (
                <div key={item.id} className="grid gap-2 md:grid-cols-[0.8fr_1.2fr_0.8fr_auto]">
                  <input
                    aria-label="Fee line item code"
                    className="input-base"
                    value={item.code}
                    onChange={(event) => updateFeeLineItem(item.id, "code", event.target.value)}
                  />
                  <input
                    aria-label="Fee line item label"
                    className="input-base"
                    value={item.label}
                    onChange={(event) => updateFeeLineItem(item.id, "label", event.target.value)}
                  />
                  <input
                    aria-label="Fee line item amount"
                    className="input-base"
                    inputMode="decimal"
                    value={item.amount}
                    onChange={(event) => updateFeeLineItem(item.id, "amount", event.target.value)}
                  />
                  <Button size="sm" variant="ghost" onClick={() => removeFeeLineItem(item.id)}>
                    Remove
                  </Button>
                </div>
              ))}
            </div>
            <Button onClick={() => void saveFeeStructure()}>Save fee structure</Button>
          </div>
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-2 text-sm text-foreground md:col-span-2">
                <span className="font-medium">Fee structure</span>
                <select
                  aria-label="Bulk billing fee structure"
                  className="input-base"
                  value={bulkDraft.fee_structure_id}
                  onChange={(event) => {
                    setBulkDraft((current) => ({ ...current, fee_structure_id: event.target.value }));
                    setBillableStudents([]);
                    setBulkError(null);
                  }}
                >
                  <option value="">Select fee structure</option>
                  {feeStructures.map((structure) => (
                    <option key={structure.id} value={structure.id}>
                      {structure.name} - {structure.grade_level} {structure.term}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2 text-sm text-foreground">
                <span className="font-medium">Due date</span>
                <input
                  aria-label="Bulk billing due date"
                  className="input-base"
                  type="date"
                  value={bulkDraft.due_at}
                  onChange={(event) => {
                    setBulkDraft((current) => ({ ...current, due_at: event.target.value }));
                    setBulkError(null);
                  }}
                />
              </label>
              <label className="space-y-2 text-sm text-foreground">
                <span className="font-medium">Batch key</span>
                <input
                  aria-label="Bulk billing idempotency key"
                  className="input-base"
                  value={bulkDraft.idempotency_key}
                  onChange={(event) => {
                    setBulkDraft((current) => ({ ...current, idempotency_key: event.target.value }));
                    setBulkError(null);
                  }}
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => void loadBillableStudentsForSelectedFeeStructure()}
                disabled={billableStudentsLoading}
              >
                {billableStudentsLoading ? "Loading roster" : "Load roster"}
              </Button>
              <Button onClick={() => void generateBulkFeeInvoices()}>Generate invoices</Button>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-foreground">Students</p>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setBulkStudents((current) => [...current, createEmptyBulkFeeStudentDraft()])}
                >
                  Add student
                </Button>
              </div>
              {bulkStudents.map((student) => (
                <div key={student.id} className="grid gap-2 md:grid-cols-2 xl:grid-cols-[1fr_1fr_0.8fr_0.8fr_0.9fr_auto]">
                  <input
                    aria-label="Bulk billing student ID"
                    className="input-base"
                    value={student.student_id}
                    onChange={(event) => updateBulkStudent(student.id, "student_id", event.target.value)}
                  />
                  <input
                    aria-label="Bulk billing student name"
                    className="input-base"
                    value={student.student_name}
                    onChange={(event) => updateBulkStudent(student.id, "student_name", event.target.value)}
                  />
                  <input
                    aria-label="Bulk billing admission number"
                    className="input-base"
                    value={student.admission_number}
                    onChange={(event) => updateBulkStudent(student.id, "admission_number", event.target.value)}
                  />
                  <input
                    aria-label="Bulk billing class"
                    className="input-base"
                    value={student.class_name}
                    onChange={(event) => updateBulkStudent(student.id, "class_name", event.target.value)}
                  />
                  <input
                    aria-label="Bulk billing guardian phone"
                    className="input-base"
                    value={student.guardian_phone}
                    onChange={(event) => updateBulkStudent(student.id, "guardian_phone", event.target.value)}
                  />
                  <Button size="sm" variant="ghost" onClick={() => removeBulkStudent(student.id)}>
                    Remove
                  </Button>
                </div>
              ))}
            </div>
            <DataTable
              title="Billable roster"
              subtitle={billableStudentsLoading ? "Loading active students..." : "Active students matched to the selected fee structure."}
              columns={[
                { id: "student", header: "Student", render: (row) => row.student_name },
                { id: "admission", header: "Admission", render: (row) => row.admission_number },
                {
                  id: "class",
                  header: "Class",
                  render: (row) => `${row.grade_level}${row.class_name ? ` / ${row.class_name}` : ""}`,
                },
                { id: "guardian", header: "Guardian phone", render: (row) => row.guardian_phone ?? "Not set" },
              ]}
              rows={billableStudents}
              getRowKey={(row) => row.student_id}
              emptyMessage={billableStudentsLoading ? "Loading roster students..." : "No roster students loaded for this fee structure."}
            />
          </div>
        </div>
        <DataTable
          title="Fee structures"
          subtitle={feeStructuresLoading ? "Loading fee structures..." : "Tenant-scoped fee plans available for bulk billing."}
          columns={[
            { id: "name", header: "Name", render: (row) => row.name },
            {
              id: "scope",
              header: "Scope",
              render: (row) => `${row.academic_year} / ${row.term} / ${row.grade_level}${row.class_name ? ` / ${row.class_name}` : ""}`,
            },
            { id: "items", header: "Items", render: (row) => String(row.line_items.length), className: "text-right", headerClassName: "text-right" },
            { id: "total", header: "Total", render: (row) => formatMinorKes(row.total_amount_minor), className: "text-right font-semibold", headerClassName: "text-right" },
            { id: "due", header: "Due days", render: (row) => String(row.due_days), className: "text-right", headerClassName: "text-right" },
            {
              id: "status",
              header: "Status",
              render: (row) => (
                <StatusPill
                  label={row.status}
                  tone={row.status === "active" ? "ok" : row.status === "draft" ? "warning" : "critical"}
                />
              ),
            },
            {
              id: "actions",
              header: "Actions",
              render: (row) =>
                row.status === "archived" ? (
                  <span className="text-xs text-muted-foreground">Archived</span>
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => void archiveFeeStructure(row)}>
                    Archive
                  </Button>
                ),
            },
          ]}
          rows={feeStructures}
          getRowKey={(row) => row.id}
          emptyMessage={feeStructuresLoading ? "Loading fee structures..." : "No fee structures have been created yet."}
        />
      </section>
      <section className="space-y-5 rounded-xl border border-border bg-surface px-5 py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reconciliation</p>
            <h3 className="mt-1 text-lg font-semibold text-foreground">Accountant collection control</h3>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              Match cleared collections, pending bank work, and exception receipts across payment channels.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-5">
            <input
              aria-label="Reconciliation from date"
              className="input-base"
              type="date"
              value={reconciliationFilters.from}
              onChange={(event) =>
                setReconciliationFilters((current) => ({ ...current, from: event.target.value }))
              }
            />
            <input
              aria-label="Reconciliation to date"
              className="input-base"
              type="date"
              value={reconciliationFilters.to}
              onChange={(event) =>
                setReconciliationFilters((current) => ({ ...current, to: event.target.value }))
              }
            />
            <select
              aria-label="Reconciliation payment method"
              className="input-base"
              value={reconciliationFilters.method}
              onChange={(event) =>
                setReconciliationFilters((current) => ({
                  ...current,
                  method: event.target.value as ManualReceiptMethod | "all",
                }))
              }
            >
              <option value="all">All methods</option>
              {Object.entries(manualReceiptMethodLabels).map(([method, label]) => (
                <option key={method} value={method}>
                  {label}
                </option>
              ))}
            </select>
            <Button variant="secondary" onClick={() => void loadReconciliationReport()}>
              Run
            </Button>
            <Button onClick={() => void exportReconciliationReport()}>
              Export
            </Button>
          </div>
        </div>
        {reconciliationError ? (
          <div role="alert" className="rounded-xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-foreground">
            {reconciliationError}
          </div>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-border bg-surface-strong p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cleared</p>
            <p className="mt-1 text-sm font-semibold text-foreground">
              {reconciliationLoading ? "Loading" : formatMinorKes(reconciliation?.totals.cleared_amount_minor ?? "0")}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-surface-strong p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pending</p>
            <p className="mt-1 text-sm font-semibold text-foreground">
              {reconciliationLoading ? "Loading" : formatMinorKes(reconciliation?.totals.pending_amount_minor ?? "0")}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-surface-strong p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Exceptions</p>
            <p className="mt-1 text-sm font-semibold text-foreground">
              {reconciliationLoading ? "Loading" : formatMinorKes(reconciliation?.totals.exception_amount_minor ?? "0")}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-surface-strong p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Transactions</p>
            <p className="mt-1 text-sm font-semibold text-foreground">
              {reconciliationLoading ? "Loading" : String(reconciliation?.totals.transaction_count ?? 0)}
            </p>
          </div>
        </div>
        <DataTable
          title="Method summary"
          subtitle={reconciliationLoading ? "Loading channel totals..." : "Cleared, pending, and exception totals by collection channel."}
          columns={[
            { id: "method", header: "Method", render: (row) => manualReceiptMethodLabels[row.payment_method] },
            { id: "count", header: "Count", render: (row) => String(row.transaction_count), className: "text-right", headerClassName: "text-right" },
            { id: "cleared", header: "Cleared", render: (row) => formatMinorKes(row.cleared_amount_minor), className: "text-right", headerClassName: "text-right" },
            { id: "pending", header: "Pending", render: (row) => formatMinorKes(row.pending_amount_minor), className: "text-right", headerClassName: "text-right" },
            { id: "exceptions", header: "Exceptions", render: (row) => formatMinorKes(row.exception_amount_minor), className: "text-right", headerClassName: "text-right" },
          ]}
          rows={reconciliation?.method_summaries ?? []}
          getRowKey={(row) => row.payment_method}
          emptyMessage={reconciliationLoading ? "Loading reconciliation method totals..." : "No method totals for this period."}
        />
        <DataTable
          title="Reconciliation register"
          subtitle={reconciliationLoading ? "Loading receipt register..." : "Receipt-level accountant control for the selected period."}
          columns={[
            { id: "occurred", header: "Occurred", render: (row) => formatActivityDate(row.occurred_at) },
            { id: "receipt", header: "Receipt", render: (row) => row.receipt_number },
            { id: "method", header: "Method", render: (row) => manualReceiptMethodLabels[row.payment_method] },
            { id: "amount", header: "Amount", render: (row) => formatMinorKes(row.amount_minor), className: "text-right font-semibold", headerClassName: "text-right" },
            { id: "reference", header: "Reference", render: (row) => row.reference },
            { id: "ledger", header: "Ledger", render: (row) => row.ledger_transaction_id ?? row.reversal_ledger_transaction_id ?? "Pending" },
            {
              id: "bucket",
              header: "Bucket",
              render: (row) => (
                <StatusPill
                  label={row.reconciliation_bucket}
                  tone={financeReconciliationBucketTone[row.reconciliation_bucket]}
                />
              ),
            },
          ]}
          rows={reconciliation?.rows ?? []}
          getRowKey={(row) => row.payment_id}
          emptyMessage={reconciliationLoading ? "Loading reconciliation receipts..." : "No receipts match this reconciliation period."}
        />
      </section>
      <DataTable
        title="Payment history"
        subtitle={activityLoading ? "Loading persisted finance activity..." : "Invoices and ledger-backed receipts from the live billing system."}
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
        emptyMessage={activityLoading ? "Loading finance activity..." : "No finance activity has been posted yet."}
      />
      <DataTable
        title="Student balances"
        subtitle={balancesLoading ? "Loading persisted student statements..." : "Outstanding balances from live invoices, cleared allocations, and unapplied credits."}
        columns={[
          {
            id: "student",
            header: "Student",
            render: (row) => row.student_name ?? row.student_id,
          },
          {
            id: "invoiced",
            header: "Invoiced",
            render: (row) => formatMinorKes(row.invoiced_amount_minor),
            className: "text-right",
            headerClassName: "text-right",
          },
          {
            id: "paid",
            header: "Paid",
            render: (row) => formatMinorKes(row.paid_amount_minor),
            className: "text-right",
            headerClassName: "text-right",
          },
          {
            id: "credit",
            header: "Credit",
            render: (row) => formatMinorKes(row.credit_amount_minor),
            className: "text-right",
            headerClassName: "text-right",
          },
          {
            id: "balance",
            header: "Balance",
            render: (row) => formatMinorKes(row.balance_amount_minor),
            className: "text-right font-semibold",
            headerClassName: "text-right",
          },
          {
            id: "invoiceCount",
            header: "Invoices",
            render: (row) => String(row.invoice_count),
            className: "text-right",
            headerClassName: "text-right",
          },
          {
            id: "lastActivity",
            header: "Last activity",
            render: (row) => (row.last_activity_at ? formatActivityDate(row.last_activity_at) : "No activity"),
          },
          {
            id: "actions",
            header: "Actions",
            render: (row) => (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => void openStudentStatement(row)}>
                  View
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void exportStudentStatement(row.student_id)}>
                  Export
                </Button>
              </div>
            ),
          },
        ]}
        rows={balances}
        getRowKey={(row) => row.student_id}
        emptyMessage={balancesLoading ? "Loading student balances..." : "No student balances have been created yet."}
      />
      <Modal
        open={Boolean(statement || statementLoading || statementError)}
        title={statement ? `${statement.summary.student_name ?? statement.summary.student_id} fee statement` : "Student statement"}
        description="Invoice debits, receipt credits, pending payments, and running balance from persisted billing records."
        onClose={closeStatementModal}
        footer={
          <>
            <Button variant="secondary" onClick={closeStatementModal}>
              Close
            </Button>
            {statement ? (
              <Button onClick={() => void exportStudentStatement(statement.summary.student_id)}>
                Export CSV
              </Button>
            ) : null}
          </>
        }
      >
        <div className="space-y-5">
          {statementError ? (
            <div role="alert" className="rounded-xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-foreground">
              {statementError}
            </div>
          ) : null}
          {statementLoading ? (
            <div className="rounded-xl border border-border bg-surface-strong px-4 py-3 text-sm text-muted-foreground">
              Loading statement activity...
            </div>
          ) : null}
          {statement ? (
            <>
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="rounded-xl border border-border bg-surface-strong p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Invoiced</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">{formatMinorKes(statement.summary.invoiced_amount_minor)}</p>
                </div>
                <div className="rounded-xl border border-border bg-surface-strong p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Paid</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">{formatMinorKes(statement.summary.paid_amount_minor)}</p>
                </div>
                <div className="rounded-xl border border-border bg-surface-strong p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Credit</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">{formatMinorKes(statement.summary.credit_amount_minor)}</p>
                </div>
                <div className="rounded-xl border border-border bg-surface-strong p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Balance</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">{formatMinorKes(statement.summary.balance_amount_minor)}</p>
                </div>
              </div>
              <DataTable
                title="Statement activity"
                subtitle="Running balance from invoice debits and receipt credits."
                columns={[
                  { id: "date", header: "Date", render: (row) => formatActivityDate(row.occurred_at) },
                  { id: "type", header: "Type", render: (row) => row.kind },
                  { id: "reference", header: "Reference", render: (row) => row.reference },
                  { id: "description", header: "Description", render: (row) => row.description },
                  {
                    id: "debit",
                    header: "Debit",
                    render: (row) => formatMinorKes(row.debit_amount_minor),
                    className: "text-right",
                    headerClassName: "text-right",
                  },
                  {
                    id: "credit",
                    header: "Credit",
                    render: (row) => formatMinorKes(row.credit_amount_minor),
                    className: "text-right",
                    headerClassName: "text-right",
                  },
                  {
                    id: "balance",
                    header: "Balance",
                    render: (row) => formatMinorKes(row.balance_after_minor),
                    className: "text-right font-semibold",
                    headerClassName: "text-right",
                  },
                  {
                    id: "status",
                    header: "Status",
                    render: (row) => <StatusPill label={row.status.replace("_", " ")} tone={getStatementEntryTone(row)} />,
                  },
                ]}
                rows={statement.entries}
                getRowKey={(row) => row.id}
                emptyMessage="No statement activity found."
              />
            </>
          ) : null}
        </div>
      </Modal>
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
            <span className="font-medium">Student ID</span>
            <input
              aria-label="Invoice student ID"
              value={invoiceDraft.studentId}
              onChange={(event) => {
                setInvoiceDraft((current) => ({ ...current, studentId: event.target.value }));
                setInvoiceError(null);
              }}
              className="input-base"
              placeholder="Student UUID"
            />
          </label>
          <label className="space-y-2 text-sm text-foreground">
            <span className="font-medium">Student name</span>
            <input
              aria-label="Invoice student"
              value={invoiceDraft.studentName}
              onChange={(event) => {
                setInvoiceDraft((current) => ({ ...current, studentName: event.target.value }));
                setInvoiceError(null);
              }}
              className="input-base"
              placeholder="Learner full name"
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
              placeholder="Amount in KES"
            />
          </label>
          <label className="space-y-2 text-sm text-foreground md:col-span-2">
            <span className="font-medium">Due date</span>
            <input
              aria-label="Invoice due date"
              value={invoiceDraft.dueAt}
              onChange={(event) => {
                setInvoiceDraft((current) => ({ ...current, dueAt: event.target.value }));
                setInvoiceError(null);
              }}
              className="input-base"
              type="date"
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
            <span className="font-medium">Method</span>
            <select
              aria-label="Payment method"
              value={paymentDraft.payment_method}
              onChange={(event) => {
                setPaymentDraft((current) => ({
                  ...current,
                  payment_method: event.target.value as ManualReceiptMethod,
                }));
                setPaymentError(null);
              }}
              className="input-base"
            >
              {manualReceiptSelectableMethods
                .filter((method) => method !== "cheque")
                .map((method) => (
                  <option key={method} value={method}>
                    {manualReceiptMethodLabels[method]}
                  </option>
                ))}
            </select>
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
              placeholder="Amount in KES"
            />
          </label>
          <label className="space-y-2 text-sm text-foreground">
            <span className="font-medium">Student ID</span>
            <input
              aria-label="Payment student ID"
              value={paymentDraft.student_id}
              onChange={(event) => {
                setPaymentDraft((current) => ({ ...current, student_id: event.target.value }));
                setPaymentError(null);
              }}
              className="input-base"
              placeholder="Student UUID"
            />
          </label>
          <label className="space-y-2 text-sm text-foreground">
            <span className="font-medium">Invoice ID</span>
            <input
              aria-label="Payment invoice ID"
              value={paymentDraft.invoice_id}
              onChange={(event) => {
                setPaymentDraft((current) => ({ ...current, invoice_id: event.target.value }));
                setPaymentError(null);
              }}
              className="input-base"
              placeholder="Invoice UUID"
            />
          </label>
          <label className="space-y-2 text-sm text-foreground md:col-span-2">
            <span className="font-medium">Payer name</span>
            <input
              aria-label="Payment payer name"
              value={paymentDraft.payer_name}
              onChange={(event) => {
                setPaymentDraft((current) => ({ ...current, payer_name: event.target.value }));
                setPaymentError(null);
              }}
              className="input-base"
              placeholder="Parent or payer name"
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
              placeholder="Payment reference"
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
      <MpesaC2bReviewPanel tenantSlug={tenantSlug} />
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
              placeholder="Receipt code"
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
              placeholder="Learner full name"
            />
          </label>
        </div>
        </div>
      </Modal>
      <ManualReceiptsPanel tenantSlug={tenantSlug} />
    </div>
  );
}

function MpesaC2bReviewPanel({ tenantSlug }: { tenantSlug?: string | null }) {
  const [payments, setPayments] = useState<MpesaC2bPaymentResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [reconciling, setReconciling] = useState(false);
  const [selectedPaymentId, setSelectedPaymentId] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadPendingPayments() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          buildPaymentsApiPath("/api/payments/mpesa/c2b/payments?status=pending_review", tenantSlug),
          { cache: "no-store" },
        );

        if (!response.ok) {
          throw new Error("Pending Paybill deposits could not be loaded.");
        }

        const payload = (await response.json()) as MpesaC2bPaymentResponse[];

        if (active) {
          setPayments(payload);
          setSelectedPaymentId((current) => current || payload[0]?.id || "");
        }
      } catch (caught) {
        if (active) {
          setError(caught instanceof Error ? caught.message : "Pending Paybill deposits could not be loaded.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadPendingPayments();

    return () => {
      active = false;
    };
  }, [tenantSlug]);

  async function reconcilePayment() {
    const validationError = getMissingFieldError([
      { label: "Payment", value: selectedPaymentId },
      { label: "Invoice or student", value: invoiceId || studentId },
    ]);

    if (validationError) {
      setError(validationError);
      return;
    }

    setReconciling(true);
    setError(null);
    setMessage(null);

    try {
      const csrfToken = await getCsrfToken();
      const response = await fetch(
        buildPaymentsApiPath(`/api/payments/mpesa/c2b/payments/${selectedPaymentId}/reconcile`, tenantSlug),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-shulehub-csrf": csrfToken,
          },
          body: JSON.stringify({
            invoice_id: invoiceId.trim() || undefined,
            student_id: studentId.trim() || undefined,
            notes: notes.trim() || undefined,
          }),
        },
      );
      const payload = (await response.json().catch(() => null)) as
        | MpesaC2bPaymentResponse
        | { message?: string }
        | null;

      if (!response.ok || !payload || !("id" in payload)) {
        throw new Error(
          payload && "message" in payload && payload.message
            ? payload.message
            : "Paybill deposit could not be reconciled.",
        );
      }

      setPayments((current) => current.filter((payment) => payment.id !== payload.id));
      setMessage(`${payload.trans_id} reconciled and posted to the fee ledger.`);
      setSelectedPaymentId("");
      setInvoiceId("");
      setStudentId("");
      setNotes("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Paybill deposit could not be reconciled.");
    } finally {
      setReconciling(false);
    }
  }

  return (
    <section className="space-y-5 rounded-xl border border-border bg-surface px-5 py-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Paybill review</p>
          <h3 className="mt-1 text-lg font-semibold text-foreground">Unmatched direct M-PESA deposits</h3>
        </div>
        <div className="grid gap-2 sm:grid-cols-4">
          <select
            aria-label="Pending Paybill payment"
            className="input-base sm:col-span-2"
            value={selectedPaymentId}
            onChange={(event) => setSelectedPaymentId(event.target.value)}
          >
            <option value="">Select deposit</option>
            {payments.map((payment) => (
              <option key={payment.id} value={payment.id}>
                {payment.trans_id} - {formatMinorKes(payment.amount_minor)}
              </option>
            ))}
          </select>
          <input
            aria-label="Invoice ID"
            className="input-base"
            placeholder="Invoice ID"
            value={invoiceId}
            onChange={(event) => setInvoiceId(event.target.value)}
          />
          <input
            aria-label="Student ID"
            className="input-base"
            placeholder="Student ID"
            value={studentId}
            onChange={(event) => setStudentId(event.target.value)}
          />
          <input
            aria-label="Reconciliation notes"
            className="input-base sm:col-span-3"
            placeholder="Review note"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
          <Button onClick={reconcilePayment} disabled={reconciling}>
            {reconciling ? "Posting..." : "Reconcile"}
          </Button>
        </div>
      </div>
      {message ? (
        <div aria-live="polite" className="rounded-xl border border-success/20 bg-success/10 px-4 py-3 text-sm text-foreground">
          {message}
        </div>
      ) : null}
      {error ? (
        <div role="alert" className="rounded-xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-foreground">
          {error}
        </div>
      ) : null}
      <DataTable
        title="Pending Paybill deposits"
        subtitle={loading ? "Loading unmatched deposits..." : "Direct customer-to-business payments waiting for accountant review."}
        columns={[
          { id: "code", header: "Code", render: (row) => row.trans_id },
          { id: "amount", header: "Amount", render: (row) => formatMinorKes(row.amount_minor), className: "text-right font-semibold", headerClassName: "text-right" },
          { id: "phone", header: "Phone", render: (row) => row.phone_number ?? "Unknown" },
          { id: "reference", header: "Reference", render: (row) => row.bill_ref_number ?? row.invoice_number ?? "Missing" },
          { id: "status", header: "Status", render: (row) => <StatusPill label={row.status.replace("_", " ")} tone={mpesaC2bStatusTone[row.status]} /> },
        ]}
        rows={payments}
        getRowKey={(row) => row.id}
        emptyMessage={loading ? "Loading pending Paybill deposits..." : "No unmatched Paybill deposits need review."}
      />
    </section>
  );
}

function ManualReceiptsPanel({ tenantSlug }: { tenantSlug?: string | null }) {
  const [receipts, setReceipts] = useState<ManualReceiptResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    payment_method: "cheque" as ManualReceiptMethod,
    amount: "",
    student_id: "",
    invoice_id: "",
    payer_name: "",
    cheque_number: "",
    drawer_bank: "",
    deposit_reference: "",
    asset_account_code: "1120-BANK-CLEARING",
    fee_control_account_code: "1100-AR-FEES",
    notes: "",
  });

  useEffect(() => {
    let active = true;

    async function loadReceipts() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(buildBillingApiPath("/api/billing/manual-fee-payments", tenantSlug), {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Manual receipts could not be loaded.");
        }

        const payload = (await response.json()) as ManualReceiptResponse[];

        if (active) {
          setReceipts(payload);
        }
      } catch (caught) {
        if (active) {
          setError(caught instanceof Error ? caught.message : "Manual receipts could not be loaded.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadReceipts();

    return () => {
      active = false;
    };
  }, [tenantSlug]);

  async function submitReceipt() {
    const amountMinor = toMinorUnits(draft.amount);
    const validationError = getMissingFieldError([
      { label: "Amount", value: draft.amount },
      { label: "Student or invoice", value: draft.student_id || draft.invoice_id },
      ...(draft.payment_method === "cheque"
        ? [
            { label: "Cheque number", value: draft.cheque_number },
            { label: "Drawer bank", value: draft.drawer_bank },
          ]
        : []),
    ]);

    if (validationError) {
      setError(validationError);
      return;
    }

    if (!amountMinor) {
      setError("Enter a valid amount.");
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const csrfToken = await getCsrfToken();
      const response = await fetch(buildBillingApiPath("/api/billing/manual-fee-payments", tenantSlug), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-shulehub-csrf": csrfToken,
        },
        body: JSON.stringify({
          idempotency_key: `manual-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          payment_method: draft.payment_method,
          amount_minor: amountMinor,
          student_id: draft.student_id.trim() || undefined,
          invoice_id: draft.invoice_id.trim() || undefined,
          payer_name: draft.payer_name.trim() || undefined,
          cheque_number: draft.cheque_number.trim() || undefined,
          drawer_bank: draft.drawer_bank.trim() || undefined,
          deposit_reference: draft.deposit_reference.trim() || undefined,
          asset_account_code: draft.asset_account_code.trim() || undefined,
          fee_control_account_code: draft.fee_control_account_code.trim() || undefined,
          notes: draft.notes.trim() || undefined,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | ManualReceiptResponse
        | { message?: string }
        | null;

      if (!response.ok || !payload || !("id" in payload)) {
        throw new Error(
          payload && "message" in payload && payload.message
            ? payload.message
            : "Manual receipt could not be saved.",
        );
      }

      setReceipts((current) => [payload, ...current.filter((row) => row.id !== payload.id)]);
      setMessage(
        payload.status === "cleared"
          ? `${payload.receipt_number} cleared and posted.`
          : `${payload.receipt_number} recorded pending clearance.`,
      );
      setDraft((current) => ({
        ...current,
        amount: "",
        payer_name: "",
        cheque_number: "",
        drawer_bank: "",
        deposit_reference: "",
        notes: "",
      }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Manual receipt could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function runReceiptAction(receipt: ManualReceiptResponse, action: "deposit" | "clear" | "bounce" | "reverse") {
    setError(null);
    setMessage(null);

    try {
      const csrfToken = await getCsrfToken();
      const response = await fetch(
        buildBillingApiPath(`/api/billing/manual-fee-payments/${receipt.id}/${action}`, tenantSlug),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-shulehub-csrf": csrfToken,
          },
          body: JSON.stringify({
            occurred_at: new Date().toISOString(),
            notes:
              action === "bounce"
                ? "Cheque returned unpaid"
                : action === "reverse"
                  ? "Manual receipt reversed by accountant"
                  : undefined,
          }),
        },
      );
      const payload = (await response.json().catch(() => null)) as
        | ManualReceiptResponse
        | { message?: string }
        | null;

      if (!response.ok || !payload || !("id" in payload)) {
        throw new Error(
          payload && "message" in payload && payload.message
            ? payload.message
            : "Receipt action failed.",
        );
      }

      setReceipts((current) => current.map((row) => (row.id === payload.id ? payload : row)));
      setMessage(`${payload.receipt_number} is now ${payload.status.replace("_", " ")}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Receipt action failed.");
    }
  }

  return (
    <section className="space-y-5 rounded-xl border border-border bg-surface px-5 py-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Manual receipts</p>
          <h3 className="mt-1 text-lg font-semibold text-foreground">Cheque, cash, bank deposit, and EFT</h3>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <select
            aria-label="Payment method"
            className="input-base"
            value={draft.payment_method}
            onChange={(event) => {
              const method = event.target.value as ManualReceiptMethod;
              setDraft((current) => ({
                ...current,
                payment_method: method,
                asset_account_code: method === "cash" ? "1010-CASH-ON-HAND" : "1120-BANK-CLEARING",
              }));
            }}
          >
            {manualReceiptSelectableMethods.map((method) => (
              <option key={method} value={method}>
                {manualReceiptMethodLabels[method]}
              </option>
            ))}
          </select>
          <input
            aria-label="Manual receipt amount"
            className="input-base"
            inputMode="decimal"
            placeholder="Amount"
            value={draft.amount}
            onChange={(event) => setDraft((current) => ({ ...current, amount: event.target.value }))}
          />
          <Button onClick={submitReceipt} disabled={saving}>
            {saving ? "Saving..." : "Record receipt"}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <input
          aria-label="Student ID"
          className="input-base"
          placeholder="Student UUID"
          value={draft.student_id}
          onChange={(event) => setDraft((current) => ({ ...current, student_id: event.target.value }))}
        />
        <input
          aria-label="Invoice ID"
          className="input-base"
          placeholder="Invoice UUID"
          value={draft.invoice_id}
          onChange={(event) => setDraft((current) => ({ ...current, invoice_id: event.target.value }))}
        />
        <input
          aria-label="Payer name"
          className="input-base"
          placeholder="Payer name"
          value={draft.payer_name}
          onChange={(event) => setDraft((current) => ({ ...current, payer_name: event.target.value }))}
        />
        <input
          aria-label="Deposit reference"
          className="input-base"
          placeholder="Deposit/reference"
          value={draft.deposit_reference}
          onChange={(event) => setDraft((current) => ({ ...current, deposit_reference: event.target.value }))}
        />
        {draft.payment_method === "cheque" ? (
          <>
            <input
              aria-label="Cheque number"
              className="input-base"
              placeholder="Cheque number"
              value={draft.cheque_number}
              onChange={(event) => setDraft((current) => ({ ...current, cheque_number: event.target.value }))}
            />
            <input
              aria-label="Drawer bank"
              className="input-base"
              placeholder="Drawer bank"
              value={draft.drawer_bank}
              onChange={(event) => setDraft((current) => ({ ...current, drawer_bank: event.target.value }))}
            />
          </>
        ) : null}
        <input
          aria-label="Asset account code"
          className="input-base"
          placeholder="Asset account"
          value={draft.asset_account_code}
          onChange={(event) => setDraft((current) => ({ ...current, asset_account_code: event.target.value }))}
        />
        <input
          aria-label="Fee control account code"
          className="input-base"
          placeholder="Fee control account"
          value={draft.fee_control_account_code}
          onChange={(event) => setDraft((current) => ({ ...current, fee_control_account_code: event.target.value }))}
        />
      </div>

      {message ? (
        <div aria-live="polite" className="mt-4 rounded-xl border border-success/20 bg-success/10 px-4 py-3 text-sm text-foreground">
          {message}
        </div>
      ) : null}
      {error ? (
        <div role="alert" className="mt-4 rounded-xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-foreground">
          {error}
        </div>
      ) : null}

      <div>
        <DataTable
          title="Manual receipt register"
          subtitle={loading ? "Loading accountant receipts..." : "Receipts, clearance state, and ledger posting references."}
          columns={[
            { id: "receipt", header: "Receipt", render: (row) => row.receipt_number },
            { id: "method", header: "Method", render: (row) => manualReceiptMethodLabels[row.payment_method] },
            { id: "amount", header: "Amount", render: (row) => formatMinorKes(row.amount_minor), className: "text-right font-semibold", headerClassName: "text-right" },
            { id: "status", header: "Status", render: (row) => <StatusPill label={row.status.replace("_", " ")} tone={manualReceiptStatusTone[row.status]} /> },
            { id: "target", header: "Target", render: (row) => row.invoice_id ?? row.student_id ?? "Unassigned" },
            { id: "reference", header: "Reference", render: (row) => row.cheque_number ?? row.deposit_reference ?? row.ledger_transaction_id ?? "Pending" },
            {
              id: "actions",
              header: "Actions",
              render: (row) => (
                <div className="flex flex-wrap gap-2">
                  {row.payment_method === "cheque" && row.status === "received" ? (
                    <Button variant="secondary" onClick={() => void runReceiptAction(row, "deposit")}>
                      Deposit
                    </Button>
                  ) : null}
                  {["received", "deposited"].includes(row.status) ? (
                    <Button variant="secondary" onClick={() => void runReceiptAction(row, "clear")}>
                      Clear
                    </Button>
                  ) : null}
                  {row.payment_method === "cheque" && ["received", "deposited"].includes(row.status) ? (
                    <Button variant="secondary" onClick={() => void runReceiptAction(row, "bounce")}>
                      Bounce
                    </Button>
                  ) : null}
                  {row.status === "cleared" ? (
                    <Button variant="secondary" onClick={() => void runReceiptAction(row, "reverse")}>
                      Reverse
                    </Button>
                  ) : null}
                </div>
              ),
            },
          ]}
          rows={receipts}
          getRowKey={(row) => row.id}
          emptyMessage={loading ? "Loading manual receipts..." : "No manual receipts have been recorded yet."}
        />
      </div>
    </section>
  );
}

function buildBillingApiPath(path: string, tenantSlug?: string | null) {
  if (!tenantSlug) {
    return path;
  }

  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}tenantSlug=${encodeURIComponent(tenantSlug)}`;
}

function buildPaymentsApiPath(path: string, tenantSlug?: string | null) {
  if (!tenantSlug) {
    return path;
  }

  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}tenantSlug=${encodeURIComponent(tenantSlug)}`;
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
        description="Print fee statements, payment summaries, report cards, and operational exports without hunting through the system."
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
  const [recipient, setRecipient] = useState("");
  const [message, setMessage] = useState("");
  const [smsError, setSmsError] = useState<string | null>(null);
  const [smsMessage, setSmsMessage] = useState<string | null>(null);
  const [smsWallet, setSmsWallet] = useState<{
    sms_balance: number;
    monthly_used: number;
    monthly_limit: number | null;
    sms_plan: string;
    low_balance: boolean;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSmsWallet() {
      try {
        const response = await fetch("/api/school/sms/wallet", {
          method: "GET",
          credentials: "same-origin",
        });

        if (!response.ok) return;
        const payload = (await response.json()) as typeof smsWallet;

        if (!cancelled) {
          setSmsWallet(payload);
        }
      } catch {
        if (!cancelled) {
          setSmsWallet(null);
        }
      }
    }

    void loadSmsWallet();

    return () => {
      cancelled = true;
    };
  }, []);

  function openSmsModal() {
    setAudience("All parents");
    setRecipient("");
    setMessage("");
    setSmsError(null);
    setShowSmsModal(true);
  }

  function closeSmsModal() {
    setShowSmsModal(false);
    setSmsError(null);
  }

  async function sendSms() {
    const validationError = getMissingFieldError([
      { label: "Audience", value: audience },
      { label: "Recipient phone", value: recipient },
      { label: "Message", value: message },
    ]);

    if (validationError) {
      setSmsError(validationError);
      return;
    }

    const trimmedAudience = audience.trim();
    const trimmedRecipient = recipient.trim();
    const trimmedMessage = message.trim();

    try {
      const response = await fetch("/api/sms/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-shulehub-csrf": await getCsrfToken(),
        },
        credentials: "same-origin",
        body: JSON.stringify({
          recipient: trimmedRecipient,
          message: trimmedMessage,
          message_type: "school_communication",
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { balance_after?: number; credit_cost?: number; message?: string }
        | null;

      if (!response.ok) {
        setSmsError(payload?.message ?? "SMS balance exhausted");
        return;
      }

      if (typeof payload?.balance_after === "number") {
        const balanceAfter = payload.balance_after;
        const creditCost = payload.credit_cost ?? 1;
        setSmsWallet((current) =>
          current
            ? {
                ...current,
                sms_balance: balanceAfter,
                monthly_used: current.monthly_used + creditCost,
                low_balance: balanceAfter <= 100,
              }
            : current,
        );
      }
    } catch (error) {
      setSmsError(error instanceof Error ? error.message : "Unable to send SMS right now.");
      return;
    }

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
        items={(smsWallet
          ? [
              {
                id: "sms-balance",
                label: "SMS balance",
                value: smsWallet.sms_balance.toLocaleString(),
                helper: smsWallet.low_balance ? "Low balance threshold reached" : `${smsWallet.sms_plan} plan`,
              },
              {
                id: "sms-used",
                label: "Sent this month",
                value: smsWallet.monthly_used.toLocaleString(),
                helper: smsWallet.monthly_limit ? `${smsWallet.monthly_limit.toLocaleString()} monthly limit` : "No monthly limit",
              },
            ]
          : model.communication.summary
        ).map((item) => ({
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
            <span className="font-medium">Recipient phone</span>
            <input
              aria-label="Recipient phone"
              value={recipient}
              onChange={(event) => {
                setRecipient(event.target.value);
                setSmsError(null);
              }}
              className="input-base"
              placeholder="+254700000000"
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

function DarajaIntegrationSettings() {
  const [form, setForm] = useState({
    paybill_number: "",
    till_number: "",
    shortcode: "",
    consumer_key: "",
    consumer_secret: "",
    passkey: "",
    environment: "sandbox",
  });
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [masked, setMasked] = useState<{
    consumer_key_masked?: string | null;
    consumer_secret_masked?: string | null;
    passkey_masked?: string | null;
    callback_url?: string | null;
    last_test_status?: string | null;
    is_active?: boolean;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadDaraja() {
      try {
        const response = await fetch("/api/integrations/daraja", {
          method: "GET",
          credentials: "same-origin",
        });

        if (!response.ok) return;
        const payload = (await response.json()) as typeof masked & {
          paybill_number?: string | null;
          till_number?: string | null;
          shortcode?: string | null;
          environment?: string;
        };

        if (!cancelled && payload) {
          setMasked(payload);
          setForm((current) => ({
            ...current,
            paybill_number: payload.paybill_number ?? "",
            till_number: payload.till_number ?? "",
            shortcode: payload.shortcode ?? "",
            environment: payload.environment ?? current.environment,
          }));
        }
      } catch {
        if (!cancelled) setMasked(null);
      }
    }

    void loadDaraja();

    return () => {
      cancelled = true;
    };
  }, []);

  async function saveDaraja() {
    setError(null);
    setStatus(null);

    try {
      const response = await fetch("/api/integrations/daraja", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-shulehub-csrf": await getCsrfToken(),
        },
        credentials: "same-origin",
        body: JSON.stringify({
          ...form,
          is_active: false,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | (typeof masked & { message?: string })
        | null;

      if (!response.ok) {
        setError(payload?.message ?? "Unable to save Daraja settings.");
        return;
      }

      setMasked(payload);
      setStatus("Daraja credentials saved securely. Secrets are masked after save.");
      setForm((current) => ({
        ...current,
        consumer_key: "",
        consumer_secret: "",
        passkey: "",
      }));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save Daraja settings.");
    }
  }

  async function testDaraja() {
    setError(null);
    setStatus(null);

    try {
      const response = await fetch(`/api/integrations/daraja/test?environment=${encodeURIComponent(form.environment)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-shulehub-csrf": await getCsrfToken(),
        },
        credentials: "same-origin",
      });
      const payload = (await response.json().catch(() => null)) as { message?: string; status?: string } | null;

      if (!response.ok) {
        setError(payload?.message ?? "Daraja test failed.");
        return;
      }

      setStatus("Daraja connection test passed.");
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : "Daraja test failed.");
    }
  }

  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.14em] text-muted">M-PESA Daraja</p>
          <h3 className="mt-1 text-lg font-semibold text-foreground">School-owned payment integration</h3>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Schools keep their own paybill or till credentials. ShuleHub only reconciles callbacks and receipts.
          </p>
        </div>
        <StatusPill
          label={masked?.is_active ? "Active" : masked?.last_test_status === "ok" ? "Tested" : "Setup pending"}
          tone={masked?.is_active || masked?.last_test_status === "ok" ? "ok" : "warning"}
        />
      </div>
      {status ? <AuthLikeNotice tone="success" message={status} /> : null}
      {error ? <AuthLikeNotice tone="error" message={error} /> : null}
      <div className="grid gap-3 md:grid-cols-3">
        {[
          ["Paybill number", "paybill_number"],
          ["Till number", "till_number"],
          ["Shortcode", "shortcode"],
          ["Consumer key", "consumer_key"],
          ["Consumer secret", "consumer_secret"],
          ["Passkey", "passkey"],
        ].map(([label, key]) => (
          <label key={key} className="space-y-2 text-sm text-foreground">
            <span className="font-medium">{label}</span>
            <input
              aria-label={label}
              className="input-base"
              value={form[key as keyof typeof form]}
              placeholder={
                key === "consumer_key"
                  ? masked?.consumer_key_masked ?? ""
                  : key === "consumer_secret"
                    ? masked?.consumer_secret_masked ?? ""
                    : key === "passkey"
                      ? masked?.passkey_masked ?? ""
                      : ""
              }
              type={key.includes("secret") || key === "passkey" ? "password" : "text"}
              onChange={(event) =>
                setForm((current) => ({ ...current, [key]: event.target.value }))
              }
            />
          </label>
        ))}
        <label className="space-y-2 text-sm text-foreground">
          <span className="font-medium">Environment</span>
          <select
            aria-label="Daraja environment"
            className="input-base"
            value={form.environment}
            onChange={(event) => setForm((current) => ({ ...current, environment: event.target.value }))}
          >
            <option value="sandbox">Sandbox</option>
            <option value="production">Production</option>
          </select>
        </label>
      </div>
      {masked?.callback_url ? (
        <div className="rounded-xl border border-border bg-surface-muted px-4 py-3 text-sm text-muted">
          Callback URL: <span className="font-mono text-foreground">{masked.callback_url}</span>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button onClick={saveDaraja}>Save credentials</Button>
        <Button variant="secondary" onClick={testDaraja}>Test Daraja connection</Button>
      </div>
    </Card>
  );
}

function AuthLikeNotice({ tone, message }: { tone: "success" | "error"; message: string }) {
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
  const subscriptionNotifications: ExperienceNotificationItem[] =
    workspace.subscription.state === "ACTIVE"
      ? []
      : [
          {
            id: "subscription-renewal",
            title: workspace.subscription.statusLabel,
            detail: workspace.subscription.detail,
            timeLabel: "billing",
            tone: workspace.subscription.tone,
            href: mapSchoolHref(role, workspace.subscription.primaryActionHref, routeMode),
          },
        ];
  const notifications: ExperienceNotificationItem[] = [
    ...subscriptionNotifications,
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
      {!studentId && section === "academics" ? <SchoolAcademicsPage role={role} tenantSlug={tenantSlug} /> : null}
      {!studentId && section === "reports" ? <SchoolReportsPage role={role} tenantSlug={tenantSlug} /> : null}
      {!studentId && section === "communication" ? <SchoolCommunicationPage role={role} tenantSlug={tenantSlug} /> : null}
      {!studentId && (
        section === "support-new-ticket"
        || section === "support-my-tickets"
        || section === "support-knowledge-base"
        || section === "support-system-status"
      ) ? (
        <SupportCenterWorkspace
          tenantSlug={tenantSlug}
          defaultView={section as "support-new-ticket" | "support-my-tickets" | "support-knowledge-base" | "support-system-status"}
        />
      ) : null}
      {!studentId && section === "exams" ? (
        <ExamsModuleScreen
          role={role}
          schoolName={workspace.branding.name}
        />
      ) : null}
      {!studentId && section === "timetable" ? (
        <SchoolBasicCardPage
          eyebrow="Timetable"
          title="Timetable coordination"
          description="Class streams, teacher cover, and room availability without clutter."
          items={[
            { id: "time-1", title: "No timetable periods published", subtitle: "Class streams and rooms appear after the timetable is configured.", value: "0" },
            { id: "time-2", title: "No teacher cover requests", subtitle: "Cover requests appear only when staff availability changes.", value: "0" },
            { id: "time-3", title: "No room conflicts", subtitle: "Room availability checks appear after timetable data is imported.", value: "0" },
          ]}
        />
      ) : null}
      {!studentId && section === "staff" ? (
        <SchoolBasicCardPage
          eyebrow="Staff"
          title="Staff operations"
          description="Teachers, office staff, and operational ownership at a glance."
          items={[
            { id: "staff-1", title: "No staff accounts yet", subtitle: "Staff records appear after school administrators send real invitations.", value: "0" },
            { id: "staff-2", title: "No coverage schedule", subtitle: "Office coverage appears after staff shifts are configured.", value: "0" },
            { id: "staff-3", title: "No leave requests", subtitle: "Leave approvals appear after staff begin using the workspace.", value: "0" },
          ]}
        />
      ) : null}
      {!studentId && section === "admissions" ? (
        <AdmissionsModuleScreen role={workspace.dashboardRole} snapshot={workspace.snapshot} online />
      ) : null}
      {!studentId && section === "inventory" ? (
        <InventoryModuleScreen role={workspace.dashboardRole} snapshot={workspace.snapshot} online />
      ) : null}
      {!studentId && section === "settings" ? (
        <div className="space-y-6">
          <SchoolPageHeader
            eyebrow="Settings"
            title="School settings"
            description="School profile, fee structure, and user management in one trusted admin area."
          />
          <div className="grid gap-6 lg:grid-cols-2">
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
          </div>
          <DarajaIntegrationSettings />
          <UserManagementPanel />
        </div>
      ) : null}
    </ErpShell>
  );
}

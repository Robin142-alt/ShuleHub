import {
  CreditCard,
  Users,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { formatCurrency } from "./format";
import type {
  DashboardRole,
  KpiCard,
  StatusTone,
  TenantOption,
} from "./types";
import { isProductionReadyHref } from "@/lib/features/module-readiness";

export interface SchoolSelectorOption {
  id: string;
  label: string;
}

export interface DashboardMetricCard {
  id: string;
  label: string;
  value: string;
  helper: string;
}

export interface DashboardMpesaRow {
  id: string;
  student: string;
  amount: string;
  phone: string;
  code: string;
  status: string;
  statusTone: StatusTone;
}

export interface DashboardDefaulterRow {
  id: string;
  student: string;
  className: string;
  balance: string;
}

export interface TrendPoint {
  label: string;
  value: number;
}

export interface StudentRow {
  id: string;
  name: string;
  admissionNumber: string;
  className: string;
  parent: string;
  balance: string;
  balanceTone: StatusTone;
}

export interface StudentProfileMetric {
  id: string;
  label: string;
  value: string;
  helper: string;
}

export interface StudentPaymentRow {
  id: string;
  amount: string;
  method: string;
  date: string;
  reference: string;
  status: string;
  statusTone: StatusTone;
}

export interface FeeStructureRow {
  id: string;
  item: string;
  amount: string;
  frequency: string;
}

export interface StudentAcademicRow {
  id: string;
  subject: string;
  teacher: string;
  average: string;
  grade: string;
}

export interface StudentProfileData {
  id: string;
  name: string;
  admissionNumber: string;
  className: string;
  parentName: string;
  parentPhone: string;
  balance: string;
  balanceTone: StatusTone;
  metrics: StudentProfileMetric[];
  feeStructure: FeeStructureRow[];
  paymentHistory: StudentPaymentRow[];
  academics: StudentAcademicRow[];
}

export interface FinancePaymentRow {
  id: string;
  student: string;
  amount: string;
  method: string;
  date: string;
  reference: string;
  status: string;
  statusTone: StatusTone;
}

export interface MpesaTransactionRow {
  id: string;
  phone: string;
  amount: string;
  code: string;
  status: string;
  statusTone: StatusTone;
  matchedStudent: string;
  receivedAt: string;
}

export interface AcademicSubjectRow {
  id: string;
  subject: string;
  teacher: string;
  className: string;
  average: string;
}

export interface MarksEntryRow {
  id: string;
  student: string;
  english: string;
  maths: string;
  science: string;
  socialStudies: string;
}

export interface ReportCardRow {
  id: string;
  learner: string;
  className: string;
  reportType: string;
  status: string;
  statusTone: StatusTone;
}

export interface SmsHistoryRow {
  id: string;
  audience: string;
  message: string;
  sentAt: string;
  status: string;
  statusTone: StatusTone;
}

export interface ReportActionCard {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
}

export interface SettingField {
  id: string;
  label: string;
  value: string;
}

export interface UserManagementRow {
  id: string;
  name: string;
  role: string;
  phone: string;
  status: string;
  statusTone: StatusTone;
}

export interface PaymentChannelView {
  id: string;
  type: string;
  name: string;
  identifier: string;
  accountInstruction: string;
  settlement: string;
  status: string;
  statusTone: StatusTone;
}

export interface BankAccountView {
  id: string;
  bankName: string;
  branchName: string;
  accountName: string;
  accountNumber: string;
  currency: string;
  status: string;
  statusTone: StatusTone;
}

export interface TenantFinanceConfigView {
  paybillNumber: string;
  tillNumber: string;
  accountReferenceExample: string;
  mpesaStatus: string;
  mpesaStatusTone: StatusTone;
  reconciliationStatus: string;
  reconciliationStatusTone: StatusTone;
  darajaEnvironment: string;
  callbackUrl: string;
  todayCollections: string;
  pendingReconciliations: string;
  failedCallbacks: string;
  unmatchedPayments: string;
  channels: PaymentChannelView[];
  bankAccounts: BankAccountView[];
}

export interface DashboardHomeData {
  kpis: KpiCard[];
  mpesaFeed: DashboardMpesaRow[];
  feeTrend: TrendPoint[];
  defaulters: DashboardDefaulterRow[];
}

export interface StudentsPageData {
  metrics: DashboardMetricCard[];
  rows: StudentRow[];
}

export interface FinancePageData {
  summary: DashboardMetricCard[];
  rows: FinancePaymentRow[];
}

export interface MpesaPageData {
  summary: DashboardMetricCard[];
  rows: MpesaTransactionRow[];
}

export interface AcademicsPageData {
  summary: DashboardMetricCard[];
  subjects: AcademicSubjectRow[];
  marks: MarksEntryRow[];
  reports: ReportCardRow[];
}

export interface CommunicationPageData {
  summary: DashboardMetricCard[];
  history: SmsHistoryRow[];
}

export interface ReportsPageData {
  summary: DashboardMetricCard[];
  reports: ReportActionCard[];
}

export interface SettingsPageData {
  schoolProfile: SettingField[];
  feeStructure: FeeStructureRow[];
  users: UserManagementRow[];
}

export interface SchoolErpModel {
  schoolName: string;
  currentTerm: string;
  academicYear: string;
  termOptions: SchoolSelectorOption[];
  yearOptions: SchoolSelectorOption[];
  dashboard: DashboardHomeData;
  students: StudentsPageData;
  studentProfiles: StudentProfileData[];
  finance: FinancePageData;
  mpesa: MpesaPageData;
  academics: AcademicsPageData;
  communication: CommunicationPageData;
  reports: ReportsPageData;
  settings: SettingsPageData;
  tenantFinance: TenantFinanceConfigView;
}

type BaseStudent = {
  id: string;
  name: string;
  admissionNumber: string;
  className: string;
  parentName: string;
  parentPhone: string;
  balance: number;
  totalExpected: number;
  paidThisTerm: number;
  mostRecentPaymentDate: string;
};

const termOptions: SchoolSelectorOption[] = [
  { id: "term-1", label: "Term 1" },
  { id: "term-2", label: "Term 2" },
  { id: "term-3", label: "Term 3" },
];

const yearOptions: SchoolSelectorOption[] = [
  { id: "2025", label: "2025" },
  { id: "2026", label: "2026" },
  { id: "2027", label: "2027" },
];

const feeStructureBase: Array<{ id: string; item: string; amount: number; frequency: string }> = [];
const baseStudents: BaseStudent[] = [];
const paymentRowsBase: Array<{
  id: string;
  studentId: string;
  amount: number;
  method: string;
  date: string;
  reference: string;
  status: string;
  statusTone: StatusTone;
}> = [];
const mpesaRowsBase: Array<{
  id: string;
  studentId: string;
  phone: string;
  amount: number;
  code: string;
  status: string;
  statusTone: StatusTone;
  receivedAt: string;
}> = [];
const subjectRowsBase: AcademicSubjectRow[] = [];
const marksRowsBase: Array<{
  id: string;
  studentId: string;
  english: string;
  maths: string;
  science: string;
  socialStudies: string;
}> = [];
const reportRowsBase: Array<{
  id: string;
  studentId: string;
  reportType: string;
  status: string;
  statusTone: StatusTone;
}> = [];
const smsHistoryBase: SmsHistoryRow[] = [];
const systemUsersBase: Array<{
  id: string;
  name: string;
  role: string;
  phone: string;
  status: string;
  statusTone: StatusTone;
}> = [];

function buildTenantFinanceConfig(tenant: TenantOption): TenantFinanceConfigView {
  const primarySettlement = `${tenant.name} Main Fees - KCB Westlands`;

  return {
    paybillNumber: "247247",
    tillNumber: "837492",
    accountReferenceExample: "ADM-2025-001",
    mpesaStatus: "Live",
    mpesaStatusTone: "ok",
    reconciliationStatus: "Balanced to 09:00",
    reconciliationStatusTone: "ok",
    darajaEnvironment: "Production",
    callbackUrl: "https://api.shulehub.co.ke/mpesa/callback/barakaacademy",
    todayCollections: formatCurrency(248_500),
    pendingReconciliations: "3",
    failedCallbacks: "1",
    unmatchedPayments: "2",
    channels: [
      {
        id: "channel-paybill",
        type: "MPESA Paybill",
        name: "School fees paybill",
        identifier: "247247",
        accountInstruction: "Use learner admission number, e.g. ADM-2025-001",
        settlement: primarySettlement,
        status: "Active",
        statusTone: "ok",
      },
      {
        id: "channel-till",
        type: "MPESA Till",
        name: "Onsite bursar till",
        identifier: "837492",
        accountInstruction: "Use receipt reference from bursar desk",
        settlement: primarySettlement,
        status: "Active",
        statusTone: "ok",
      },
      {
        id: "channel-bank",
        type: "Bank deposit",
        name: "Direct bank transfer",
        identifier: "KCB 0134 5221 9087",
        accountInstruction: "Narration must include admission number",
        settlement: primarySettlement,
        status: "Active",
        statusTone: "ok",
      },
    ],
    bankAccounts: [
      {
        id: "bank-main-fees",
        bankName: "KCB Bank Kenya",
        branchName: "Westlands",
        accountName: `${tenant.name} Main Fees Account`,
        accountNumber: "0134 5221 9087",
        currency: "KES",
        status: "Active",
        statusTone: "ok",
      },
      {
        id: "bank-development",
        bankName: "Co-operative Bank",
        branchName: "Nairobi CBD",
        accountName: `${tenant.name} Development Fund`,
        accountNumber: "0112 8840 7752",
        currency: "KES",
        status: "Review",
        statusTone: "warning",
      },
    ],
  };
}

function roleVisibleStudentIds(role: DashboardRole) {
  void role;
  return baseStudents.map((student) => student.id);
}

function toneFromBalance(balance: number): StatusTone {
  if (balance === 0) {
    return "ok";
  }

  if (balance >= 10_000) {
    return "critical";
  }

  return "warning";
}

function buildStudentRows(role: DashboardRole) {
  const visibleIds = new Set(roleVisibleStudentIds(role));

  return baseStudents
    .filter((student) => visibleIds.has(student.id))
    .map<StudentRow>((student) => ({
      id: student.id,
      name: student.name,
      admissionNumber: student.admissionNumber,
      className: student.className,
      parent: student.parentName,
      balance: formatCurrency(student.balance),
      balanceTone: toneFromBalance(student.balance),
    }));
}

function buildStudentProfiles(role: DashboardRole) {
  const visibleIds = new Set(roleVisibleStudentIds(role));

  return baseStudents
    .filter((student) => visibleIds.has(student.id))
    .map<StudentProfileData>((student) => {
      const paymentHistory = paymentRowsBase
        .filter((payment) => payment.studentId === student.id)
        .map<StudentPaymentRow>((payment) => ({
          id: payment.id,
          amount: formatCurrency(payment.amount),
          method: payment.method,
          date: payment.date,
          reference: payment.reference,
          status: payment.status,
          statusTone: payment.statusTone,
        }));

      const academics = subjectRowsBase.slice(0, 4).map<StudentAcademicRow>((entry) => ({
        id: `${student.id}-${entry.id}`,
        subject: entry.subject,
        teacher: entry.teacher,
        average:
          student.id === "learner-daniel-mutua"
            ? "68%"
            : student.id === "learner-brian-otieno"
              ? "72%"
              : "79%",
        grade:
          student.id === "learner-daniel-mutua"
            ? "Developing"
            : student.id === "learner-brian-otieno"
              ? "Meeting"
              : "Exceeding",
      }));

      return {
        id: student.id,
        name: student.name,
        admissionNumber: student.admissionNumber,
        className: student.className,
        parentName: student.parentName,
        parentPhone: student.parentPhone,
        balance: formatCurrency(student.balance),
        balanceTone: toneFromBalance(student.balance),
        metrics: [
          {
            id: "balance",
            label: "Current balance",
            value: formatCurrency(student.balance),
            helper: "Outstanding fee position",
          },
          {
            id: "paid",
            label: "Paid this term",
            value: formatCurrency(student.paidThisTerm),
            helper: "All posted collections",
          },
          {
            id: "payment-date",
            label: "Last payment",
            value: student.mostRecentPaymentDate,
            helper: "Most recent receipt date",
          },
        ],
        feeStructure: feeStructureBase.map((row) => ({
          id: `${student.id}-${row.id}`,
          item: row.item,
          amount: formatCurrency(row.amount),
          frequency: row.frequency,
        })),
        paymentHistory,
        academics,
      };
    });
}

function buildFinanceSummary(role: DashboardRole, visibleStudents: BaseStudent[]): DashboardMetricCard[] {
  const totalExpected = visibleStudents.reduce((sum, student) => sum + student.totalExpected, 0);
  const totalCollected = visibleStudents.reduce((sum, student) => sum + student.paidThisTerm, 0);
  const totalBalance = visibleStudents.reduce((sum, student) => sum + student.balance, 0);

  return [
    {
      id: "expected",
      label: "Total Expected",
      value: formatCurrency(totalExpected, role === "teacher"),
      helper: "Current term invoice expectation",
    },
    {
      id: "collected",
      label: "Total Collected",
      value: formatCurrency(totalCollected, role === "teacher"),
      helper: "Receipts posted to the ledger",
    },
    {
      id: "balance",
      label: "Total Balance",
      value: formatCurrency(totalBalance, role === "teacher"),
      helper: "Still outstanding this term",
    },
  ];
}

function buildHomeKpis(role: DashboardRole, visibleStudents: BaseStudent[]): KpiCard[] {
  const todayCollections = paymentRowsBase
    .filter((payment) => payment.date === "26 Apr 2026" || payment.date === "22 Apr 2026")
    .reduce((sum, payment) => sum + payment.amount, 0);
  const totalFees = visibleStudents.reduce((sum, student) => sum + student.totalExpected, 0);
  const outstanding = visibleStudents.reduce((sum, student) => sum + student.balance, 0);
  const withBalance = visibleStudents.filter((student) => student.balance > 0).length;

  const makeCard = (
    id: string,
    label: string,
    value: string,
    helper: string,
    href: string,
    trendValue: string,
    trendDirection: "up" | "down",
    sparkline: number[],
  ): KpiCard => ({
    id,
    label,
    value,
    helper,
    href,
    trendValue,
    trendDirection,
    sparkline,
  });

  if (role === "teacher") {
    return [
      makeCard("class-planner", "Class Planner", "0", "No live timetable sessions have been created yet.", "/dashboard/teacher/academics", "0", "up", []),
      makeCard("classes-active", "Active Classes", "0", "No class assignments exist yet.", "/dashboard/teacher/academics", "0", "down", []),
      makeCard("marks-pending", "Marks Pending", "0", "No assessment records exist yet.", "/dashboard/teacher/academics", "0", "down", []),
      makeCard("reports-ready", "Report Cards Ready", "0", "No report cards exist yet.", "/dashboard/teacher/reports", "0", "up", []),
    ].filter((card) => isProductionReadyHref(card.href));
  }

  if (role === "parent") {
    return [
      makeCard("home-balance", "Current Balance", formatCurrency(0), "No linked learner fee records yet.", "/dashboard/parent/finance", "0", "down", []),
      makeCard("home-academics", "Academic Progress", "0", "No linked learner academic records yet.", "/dashboard/parent/academics", "0", "up", []),
      makeCard("home-next-fee", "Next Due", "None", "No billing schedule exists yet.", "/dashboard/parent/finance", "0", "down", []),
      makeCard("home-messages", "Unread Notices", "0", "No school notices yet.", "/dashboard/parent/communication", "0", "up", []),
    ].filter((card) => isProductionReadyHref(card.href));
  }

  return [
    makeCard("fees-collected-today", "Fees Collected Today", formatCurrency(todayCollections), "No live receipts have been posted yet.", `/dashboard/${role}/finance`, "0", "up", []),
    makeCard("total-fees-term", "Total Fees This Term", formatCurrency(totalFees), "No live invoices have been created yet.", `/dashboard/${role}/finance`, "0", "up", []),
    makeCard("outstanding-balance", "Outstanding Balance", formatCurrency(outstanding), "No outstanding balances exist yet.", `/dashboard/${role}/finance`, "0", "down", []),
    makeCard("students-with-balance", "Students with Balance", `${withBalance}`, "No students have been onboarded yet.", `/dashboard/${role}/students`, "0", "down", []),
  ].filter((card) => isProductionReadyHref(card.href));
}

function reportActionCards(): ReportActionCard[] {
  return [
    {
      id: "report-fee-statement",
      title: "Fee statement per student",
      description: "Open, print, or export an up-to-date balance and payment history statement.",
      icon: Wallet,
    },
    {
      id: "report-class-summary",
      title: "Class summary",
      description: "See enrolment and balances grouped by class and stream.",
      icon: Users,
    },
    {
      id: "report-payment-report",
      title: "Payment report",
      description: "Review posted payments by method, date, and reference for reconciliation.",
      icon: CreditCard,
    },
  ];
}

export function buildSchoolErpModel({
  role,
  tenant,
  online,
}: {
  role: DashboardRole;
  tenant: TenantOption;
  online: boolean;
}): SchoolErpModel {
  void online;
  const visibleStudents = baseStudents.filter((student) =>
    roleVisibleStudentIds(role).includes(student.id),
  );
  const studentRows = buildStudentRows(role);
  const studentProfiles = buildStudentProfiles(role);
  const tenantFinance = buildTenantFinanceConfig(tenant);

  const defaulters = visibleStudents
    .filter((student) => student.balance > 0)
    .sort((left, right) => right.balance - left.balance)
    .slice(0, 5)
    .map<DashboardDefaulterRow>((student) => ({
      id: `defaulter-${student.id}`,
      student: student.name,
      className: student.className,
      balance: formatCurrency(student.balance),
    }));

  const paymentRows = paymentRowsBase
    .filter((payment) => roleVisibleStudentIds(role).includes(payment.studentId))
    .map<FinancePaymentRow>((payment) => {
      const student = baseStudents.find((entry) => entry.id === payment.studentId)!;
      return {
        id: payment.id,
        student: student.name,
        amount: formatCurrency(payment.amount),
        method: payment.method,
        date: payment.date,
        reference: payment.reference,
        status: payment.status,
        statusTone: payment.statusTone,
      };
    });

  const mpesaRows = mpesaRowsBase
    .filter((entry) => roleVisibleStudentIds(role).includes(entry.studentId))
    .map<MpesaTransactionRow>((entry) => {
      const student = baseStudents.find((item) => item.id === entry.studentId)!;

      return {
        id: entry.id,
        phone: entry.phone,
        amount: formatCurrency(entry.amount),
        code: entry.code,
        status: entry.status,
        statusTone: entry.statusTone,
        matchedStudent: student.name,
        receivedAt: entry.receivedAt,
      };
    });

  const marksRows = marksRowsBase
    .filter((row) => roleVisibleStudentIds(role).includes(row.studentId))
    .map<MarksEntryRow>((row) => {
      const student = baseStudents.find((item) => item.id === row.studentId)!;

      return {
        id: row.id,
        student: student.name,
        english: row.english,
        maths: row.maths,
        science: row.science,
        socialStudies: row.socialStudies,
      };
    });

  const reportRows = reportRowsBase
    .filter((entry) => roleVisibleStudentIds(role).includes(entry.studentId))
    .map<ReportCardRow>((entry) => {
      const student = baseStudents.find((item) => item.id === entry.studentId)!;

      return {
        id: entry.id,
        learner: student.name,
        className: student.className,
        reportType: entry.reportType,
        status: entry.status,
        statusTone: entry.statusTone,
      };
    });

  return {
    schoolName: tenant.name,
    currentTerm: "Not configured",
    academicYear: "Not configured",
    termOptions,
    yearOptions,
    dashboard: {
      kpis: buildHomeKpis(role, visibleStudents),
      mpesaFeed: mpesaRows.slice(0, 5).map((entry) => ({
        id: entry.id,
        student: entry.matchedStudent,
        amount: entry.amount,
        phone: entry.phone,
        code: entry.code,
        status: entry.status,
        statusTone: entry.statusTone,
      })),
      feeTrend: [
      ],
      defaulters,
    },
    students: {
      metrics: [
        {
          id: "students-count",
          label: role === "parent" ? "Linked learners" : "Students on roll",
          value: `${studentRows.length}`,
          helper: role === "parent" ? "Children linked to this account" : "Active learners visible in this role",
        },
        {
          id: "students-balances",
          label: "With balances",
          value: `${studentRows.filter((row) => row.balanceTone !== "ok").length}`,
          helper: "Students needing fee follow-up",
        },
        {
          id: "students-clear",
          label: "Fee cleared",
          value: `${studentRows.filter((row) => row.balanceTone === "ok").length}`,
          helper: "Students fully settled this term",
        },
      ],
      rows: studentRows,
    },
    studentProfiles,
    finance: {
      summary: buildFinanceSummary(role, visibleStudents),
      rows: paymentRows,
    },
    mpesa: {
      summary: [
        {
          id: "matched-today",
          label: "Matched today",
          value: `${mpesaRows.filter((row) => row.statusTone === "ok").length}`,
          helper: "Transactions automatically linked to learners",
        },
        {
          id: "pending-match",
          label: "Pending match",
          value: `${mpesaRows.filter((row) => row.statusTone === "warning").length}`,
          helper: "Need manual review or student confirmation",
        },
        {
          id: "failed-callbacks",
          label: "Failed callbacks",
          value: `${mpesaRows.filter((row) => row.statusTone === "critical").length}`,
          helper: "Require retry or callback inspection",
        },
      ],
      rows: mpesaRows,
    },
    academics: {
      summary: [
        {
          id: "subjects",
          label: "Active subjects",
          value: `${subjectRowsBase.length}`,
          helper: "CBC subjects actively tracked",
        },
        {
          id: "marks-pending",
          label: "Marks pending",
          value: `${marksRows.length}`,
          helper: "Learners with recent marks to review",
        },
        {
          id: "reports-ready",
          label: "Report cards ready",
          value: `${reportRows.filter((row) => row.statusTone === "ok").length}`,
          helper: "Reports ready to print or share",
        },
      ],
      subjects: subjectRowsBase,
      marks: marksRows,
      reports: reportRows,
    },
    communication: {
      summary: [
        {
          id: "sms-sent",
          label: "SMS sent today",
          value: "0",
          helper: "No communication campaigns have been sent yet",
        },
        {
          id: "delivery-rate",
          label: "Delivery rate",
          value: "0%",
          helper: "Delivery analytics appear after live messages are sent",
        },
        {
          id: "defaulters-targeted",
          label: "Defaulters targeted",
          value: `${defaulters.length}`,
          helper: "Families queued for payment follow-up",
        },
      ],
      history: smsHistoryBase,
    },
    reports: {
      summary: [
        {
          id: "reports-generated",
          label: "Reports today",
          value: "0",
          helper: "No reports have been generated yet",
        },
        {
          id: "fee-statements",
          label: "Fee statements",
          value: `${studentRows.length}`,
          helper: "Available per student instantly",
        },
        {
          id: "payment-audit",
          label: "Payment lines",
          value: `${paymentRows.length}`,
          helper: "Posted items ready for reconciliation",
        },
      ],
      reports: reportActionCards(),
    },
    settings: {
      schoolProfile: [
        { id: "school-name", label: "School name", value: tenant.name },
        { id: "county", label: "County", value: tenant.county },
        { id: "term", label: "Current term", value: "Not configured" },
        { id: "year", label: "Academic year", value: "Not configured" },
      ],
      feeStructure: feeStructureBase.map((row) => ({
        id: row.id,
        item: row.item,
        amount: formatCurrency(row.amount),
        frequency: row.frequency,
      })),
      users: systemUsersBase,
    },
    tenantFinance,
  };
}

export function findStudentProfile(
  role: DashboardRole,
  tenant: TenantOption,
  online: boolean,
  studentId: string,
) {
  return buildSchoolErpModel({ role, tenant, online }).studentProfiles.find(
    (profile) => profile.id === studentId,
  );
}

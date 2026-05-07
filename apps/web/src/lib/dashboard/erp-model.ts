import {
  CreditCard,
  Users,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { formatCurrency, formatPercent } from "./format";
import type {
  DashboardRole,
  KpiCard,
  StatusTone,
  SyncState,
  TenantOption,
} from "./types";

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

export interface StudentAttendanceRow {
  id: string;
  date: string;
  status: string;
  statusTone: StatusTone;
  note: string;
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
  attendance: StudentAttendanceRow[];
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

export interface AttendanceMarkRow {
  id: string;
  student: string;
  className: string;
  state: "present" | "absent";
  synced: SyncState;
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

export interface AttendancePageData {
  summary: DashboardMetricCard[];
  rows: AttendanceMarkRow[];
  dateLabel: string;
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
  attendance: AttendancePageData;
  academics: AcademicsPageData;
  communication: CommunicationPageData;
  reports: ReportsPageData;
  settings: SettingsPageData;
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
  attendanceRate: number;
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

const feeStructureBase = [
  { id: "tuition", item: "Tuition", amount: 32_000, frequency: "Per term" },
  { id: "transport", item: "Transport", amount: 8_500, frequency: "Per term" },
  { id: "lunch", item: "Lunch", amount: 6_200, frequency: "Per term" },
];

const baseStudents: BaseStudent[] = [
  {
    id: "learner-aisha-njeri",
    name: "Aisha Njeri",
    admissionNumber: "SH-24011",
    className: "Grade 7 Hope",
    parentName: "Grace Njeri",
    parentPhone: "254712345801",
    balance: 0,
    totalExpected: 46_700,
    paidThisTerm: 46_700,
    attendanceRate: 97.2,
    mostRecentPaymentDate: "22 Apr 2026",
  },
  {
    id: "learner-brian-otieno",
    name: "Brian Otieno",
    admissionNumber: "SH-24012",
    className: "Grade 8 Unity",
    parentName: "Linet Achieng",
    parentPhone: "254723456810",
    balance: 12_000,
    totalExpected: 46_700,
    paidThisTerm: 34_700,
    attendanceRate: 92.1,
    mostRecentPaymentDate: "18 Apr 2026",
  },
  {
    id: "learner-carol-wanjiku",
    name: "Carol Wanjiku",
    admissionNumber: "SH-24013",
    className: "Grade 6 Peace",
    parentName: "Peter Wanjiku",
    parentPhone: "254734567821",
    balance: 4_500,
    totalExpected: 46_700,
    paidThisTerm: 42_200,
    attendanceRate: 95.6,
    mostRecentPaymentDate: "26 Apr 2026",
  },
  {
    id: "learner-daniel-mutua",
    name: "Daniel Mutua",
    admissionNumber: "SH-24014",
    className: "Grade 9 Courage",
    parentName: "Loise Mutua",
    parentPhone: "254745678832",
    balance: 18_200,
    totalExpected: 46_700,
    paidThisTerm: 28_500,
    attendanceRate: 90.4,
    mostRecentPaymentDate: "12 Apr 2026",
  },
  {
    id: "learner-esther-chebet",
    name: "Esther Chebet",
    admissionNumber: "SH-24015",
    className: "Grade 5 Joy",
    parentName: "Jane Chebet",
    parentPhone: "254756789843",
    balance: 0,
    totalExpected: 46_700,
    paidThisTerm: 46_700,
    attendanceRate: 98.4,
    mostRecentPaymentDate: "20 Apr 2026",
  },
  {
    id: "learner-faith-ndungu",
    name: "Faith Ndungu",
    admissionNumber: "SH-24016",
    className: "Grade 4 Light",
    parentName: "Joseph Ndungu",
    parentPhone: "254767890854",
    balance: 6_800,
    totalExpected: 46_700,
    paidThisTerm: 39_900,
    attendanceRate: 94.3,
    mostRecentPaymentDate: "15 Apr 2026",
  },
  {
    id: "learner-george-ochieng",
    name: "George Ochieng",
    admissionNumber: "SH-24017",
    className: "Grade 3 Star",
    parentName: "Janet Ochieng",
    parentPhone: "254778901865",
    balance: 0,
    totalExpected: 46_700,
    paidThisTerm: 46_700,
    attendanceRate: 96.1,
    mostRecentPaymentDate: "24 Apr 2026",
  },
  {
    id: "learner-hassan-abdi",
    name: "Hassan Abdi",
    admissionNumber: "SH-24018",
    className: "Grade 2 Joy",
    parentName: "Sahra Abdi",
    parentPhone: "254789012876",
    balance: 9_500,
    totalExpected: 46_700,
    paidThisTerm: 37_200,
    attendanceRate: 93.8,
    mostRecentPaymentDate: "10 Apr 2026",
  },
];

const paymentRowsBase = [
  {
    id: "payment-01",
    studentId: "learner-aisha-njeri",
    amount: 18_500,
    method: "M-PESA",
    date: "22 Apr 2026",
    reference: "QJT8M4P21",
    status: "Posted",
    statusTone: "ok" as const,
  },
  {
    id: "payment-02",
    studentId: "learner-brian-otieno",
    amount: 10_000,
    method: "M-PESA",
    date: "18 Apr 2026",
    reference: "QJT8L1R31",
    status: "Posted",
    statusTone: "ok" as const,
  },
  {
    id: "payment-03",
    studentId: "learner-carol-wanjiku",
    amount: 12_500,
    method: "Bank",
    date: "26 Apr 2026",
    reference: "BNK-440182",
    status: "Posted",
    statusTone: "ok" as const,
  },
  {
    id: "payment-04",
    studentId: "learner-daniel-mutua",
    amount: 8_500,
    method: "Cash",
    date: "12 Apr 2026",
    reference: "CSH-1184",
    status: "Posted",
    statusTone: "ok" as const,
  },
  {
    id: "payment-05",
    studentId: "learner-faith-ndungu",
    amount: 6_000,
    method: "M-PESA",
    date: "15 Apr 2026",
    reference: "QJT7W8P10",
    status: "Posted",
    statusTone: "ok" as const,
  },
  {
    id: "payment-06",
    studentId: "learner-hassan-abdi",
    amount: 4_200,
    method: "M-PESA",
    date: "10 Apr 2026",
    reference: "QJT6A2P02",
    status: "Reversed",
    statusTone: "critical" as const,
  },
];

const mpesaRowsBase = [
  {
    id: "mpesa-01",
    studentId: "learner-aisha-njeri",
    phone: "254712345801",
    amount: 18_500,
    code: "QJT8M4P21",
    status: "Matched",
    statusTone: "ok" as const,
    receivedAt: "08:11 AM",
  },
  {
    id: "mpesa-02",
    studentId: "learner-brian-otieno",
    phone: "254723456810",
    amount: 10_000,
    code: "QJT8L1R31",
    status: "Matched",
    statusTone: "ok" as const,
    receivedAt: "08:42 AM",
  },
  {
    id: "mpesa-03",
    studentId: "learner-daniel-mutua",
    phone: "254745678832",
    amount: 6_000,
    code: "QJT8V9H33",
    status: "Pending match",
    statusTone: "warning" as const,
    receivedAt: "09:15 AM",
  },
  {
    id: "mpesa-04",
    studentId: "learner-faith-ndungu",
    phone: "254767890854",
    amount: 6_000,
    code: "QJT7W8P10",
    status: "Failed",
    statusTone: "critical" as const,
    receivedAt: "09:58 AM",
  },
  {
    id: "mpesa-05",
    studentId: "learner-hassan-abdi",
    phone: "254789012876",
    amount: 9_000,
    code: "QJT8Z3P55",
    status: "Matched",
    statusTone: "ok" as const,
    receivedAt: "10:22 AM",
  },
];

const attendanceRowsBase = [
  {
    id: "attendance-01",
    studentId: "learner-aisha-njeri",
    state: "present" as const,
    synced: "synced" as const,
  },
  {
    id: "attendance-02",
    studentId: "learner-brian-otieno",
    state: "present" as const,
    synced: "synced" as const,
  },
  {
    id: "attendance-03",
    studentId: "learner-carol-wanjiku",
    state: "absent" as const,
    synced: "pending" as const,
  },
  {
    id: "attendance-04",
    studentId: "learner-daniel-mutua",
    state: "present" as const,
    synced: "synced" as const,
  },
  {
    id: "attendance-05",
    studentId: "learner-esther-chebet",
    state: "present" as const,
    synced: "synced" as const,
  },
];

const subjectRowsBase = [
  { id: "subject-01", subject: "Mathematics", teacher: "Mr. Kiptoo", className: "Grade 8 Unity", average: "74%" },
  { id: "subject-02", subject: "English", teacher: "Ms. Mwende", className: "Grade 7 Hope", average: "76%" },
  { id: "subject-03", subject: "Integrated Science", teacher: "Ms. Naliaka", className: "Grade 9 Courage", average: "71%" },
  { id: "subject-04", subject: "Social Studies", teacher: "Mr. Ouma", className: "Grade 6 Peace", average: "69%" },
];

const marksRowsBase = [
  { id: "marks-01", studentId: "learner-aisha-njeri", english: "81", maths: "85", science: "79", socialStudies: "74" },
  { id: "marks-02", studentId: "learner-brian-otieno", english: "73", maths: "69", science: "71", socialStudies: "66" },
  { id: "marks-03", studentId: "learner-carol-wanjiku", english: "84", maths: "78", science: "82", socialStudies: "75" },
  { id: "marks-04", studentId: "learner-daniel-mutua", english: "70", maths: "72", science: "68", socialStudies: "65" },
];

const reportRowsBase = [
  { id: "report-01", studentId: "learner-aisha-njeri", reportType: "Mid-term report", status: "Ready", statusTone: "ok" as const },
  { id: "report-02", studentId: "learner-brian-otieno", reportType: "Fee statement", status: "Ready", statusTone: "ok" as const },
  { id: "report-03", studentId: "learner-daniel-mutua", reportType: "Progress report", status: "Draft", statusTone: "warning" as const },
];

const smsHistoryBase = [
  {
    id: "sms-01",
    audience: "Defaulters",
    message: "Fee reminder sent for balances above KES 10,000.",
    sentAt: "Today, 07:40 AM",
    status: "Delivered",
    statusTone: "ok" as const,
  },
  {
    id: "sms-02",
    audience: "Grade 7 Hope",
    message: "Parents reminded about Thursday CBC exhibition.",
    sentAt: "Yesterday, 04:12 PM",
    status: "Delivered",
    statusTone: "ok" as const,
  },
  {
    id: "sms-03",
    audience: "All parents",
    message: "School transport route change shared before opening bell.",
    sentAt: "Yesterday, 06:35 AM",
    status: "Queued",
    statusTone: "warning" as const,
  },
];

const systemUsersBase = [
  {
    id: "user-01",
    name: "Mercy Wairimu",
    role: "Principal",
    phone: "254711223344",
    status: "Active",
    statusTone: "ok" as const,
  },
  {
    id: "user-02",
    name: "John Kiptoo",
    role: "Bursar",
    phone: "254722334455",
    status: "Active",
    statusTone: "ok" as const,
  },
  {
    id: "user-03",
    name: "Lucy Atieno",
    role: "School Admin",
    phone: "254733445566",
    status: "Pending reset",
    statusTone: "warning" as const,
  },
];

function roleVisibleStudentIds(role: DashboardRole) {
  if (role === "parent") {
    return ["learner-aisha-njeri", "learner-brian-otieno"];
  }

  if (role === "teacher") {
    return [
      "learner-aisha-njeri",
      "learner-brian-otieno",
      "learner-carol-wanjiku",
      "learner-daniel-mutua",
    ];
  }

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

      const attendance = [
        {
          id: `${student.id}-att-01`,
          date: "28 Apr 2026",
          status: student.attendanceRate > 95 ? "Present" : "Late",
          statusTone: student.attendanceRate > 95 ? "ok" : "warning",
          note: "Morning roll call captured before 7:30 a.m.",
        },
        {
          id: `${student.id}-att-02`,
          date: "27 Apr 2026",
          status: "Present",
          statusTone: "ok",
          note: "All lessons attended.",
        },
        {
          id: `${student.id}-att-03`,
          date: "25 Apr 2026",
          status: student.balance > 15_000 ? "Absent" : "Present",
          statusTone: student.balance > 15_000 ? "critical" : "ok",
          note: student.balance > 15_000 ? "Parent contacted by class teacher." : "Normal attendance day.",
        },
      ] satisfies StudentAttendanceRow[];

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
            id: "attendance",
            label: "Attendance",
            value: formatPercent(student.attendanceRate),
            helper: "Current term roll-call rate",
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
        attendance,
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
      makeCard("class-attendance", "Attendance Today", "95.2%", "Morning roll call completion", "/dashboard/teacher/attendance", "+1.2%", "up", [88, 91, 92, 93, 94, 95, 95]),
      makeCard("classes-unmarked", "Unmarked Classes", "1", "Still pending morning mark", "/dashboard/teacher/attendance", "-1", "down", [4, 3, 3, 2, 2, 2, 1]),
      makeCard("marks-pending", "Marks Pending", "18", "CBC entry queue waiting review", "/dashboard/teacher/academics", "-3", "down", [28, 24, 23, 22, 20, 19, 18]),
      makeCard("reports-ready", "Report Cards Ready", "24", "Ready for family sharing", "/dashboard/teacher/reports", "+6", "up", [8, 10, 13, 15, 18, 21, 24]),
    ];
  }

  if (role === "parent") {
    return [
      makeCard("home-balance", "Current Balance", formatCurrency(12_000), "Family fee position this term", "/dashboard/parent/finance", "-8.0%", "down", [26, 24, 22, 19, 18, 15, 12]),
      makeCard("home-attendance", "Attendance", "97.2%", "Current learner attendance", "/dashboard/parent/attendance", "+1.0%", "up", [93, 94, 95, 95, 96, 97, 97]),
      makeCard("home-next-fee", "Next Due", "Transport", "Next charge awaiting payment", "/dashboard/parent/finance", "Due", "down", [22, 22, 21, 20, 18, 16, 15]),
      makeCard("home-messages", "Unread Notices", "3", "Recent school updates", "/dashboard/parent/communication", "+1", "up", [1, 1, 2, 2, 2, 3, 3]),
    ];
  }

  return [
    makeCard("fees-collected-today", "Fees Collected Today", formatCurrency(todayCollections), "Posted by cash office and M-PESA today", `/dashboard/${role}/finance`, "+7.4%", "up", [18, 22, 24, 29, 31, 35, 39]),
    makeCard("total-fees-term", "Total Fees This Term", formatCurrency(totalFees), "All billed lines across tuition, lunch, and transport", `/dashboard/${role}/finance`, "+4.2%", "up", [62, 65, 66, 69, 71, 74, 76]),
    makeCard("outstanding-balance", "Outstanding Balance", formatCurrency(outstanding), "Still awaiting follow-up and collection", `/dashboard/${role}/finance`, "-3.1%", "down", [48, 46, 44, 42, 40, 39, 36]),
    makeCard("students-with-balance", "Students with Balance", `${withBalance}`, "Learners still carrying arrears", `/dashboard/${role}/students`, "-2", "down", [14, 13, 12, 12, 11, 10, 9]),
  ];
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
      description: "See enrolment, attendance, and balances grouped by class and stream.",
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
  const visibleStudents = baseStudents.filter((student) =>
    roleVisibleStudentIds(role).includes(student.id),
  );
  const studentRows = buildStudentRows(role);
  const studentProfiles = buildStudentProfiles(role);

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

  const attendanceRows = attendanceRowsBase
    .filter((entry) => roleVisibleStudentIds(role).includes(entry.studentId))
    .map<AttendanceMarkRow>((entry) => {
      const student = baseStudents.find((item) => item.id === entry.studentId)!;

      return {
        id: entry.id,
        student: student.name,
        className: student.className,
        state: entry.state,
        synced: online ? "synced" : entry.synced,
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
    currentTerm: "Term 2",
    academicYear: "2026",
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
        { label: "Mon", value: 160_000 },
        { label: "Tue", value: 185_000 },
        { label: "Wed", value: 198_000 },
        { label: "Thu", value: 232_000 },
        { label: "Fri", value: 248_000 },
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
    attendance: {
      summary: [
        {
          id: "attendance-present",
          label: "Present",
          value: `${attendanceRows.filter((row) => row.state === "present").length}`,
          helper: "Students marked present today",
        },
        {
          id: "attendance-absent",
          label: "Absent",
          value: `${attendanceRows.filter((row) => row.state === "absent").length}`,
          helper: "Students absent this morning",
        },
        {
          id: "attendance-sync",
          label: "Sync posture",
          value: online ? "Live" : "Offline queue",
          helper: online ? "Daily save goes straight to school records" : "Attendance remains safe and will sync later",
        },
      ],
      rows: attendanceRows,
      dateLabel: "Tuesday, 28 April 2026",
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
          value: "148",
          helper: "Delivery bursts sent before and after school",
        },
        {
          id: "delivery-rate",
          label: "Delivery rate",
          value: "97.8%",
          helper: "Successful delivery across current campaigns",
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
          value: "12",
          helper: "Printed or exported during the day",
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
        { id: "term", label: "Current term", value: "Term 2" },
        { id: "year", label: "Academic year", value: "2026" },
      ],
      feeStructure: feeStructureBase.map((row) => ({
        id: row.id,
        item: row.item,
        amount: formatCurrency(row.amount),
        frequency: row.frequency,
      })),
      users: systemUsersBase,
    },
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

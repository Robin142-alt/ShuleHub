import {
  BellRing,
  BookOpenCheck,
  Download,
  LayoutGrid,
  MessageSquareText,
  ReceiptText,
  ShieldCheck,
} from "lucide-react";

import { formatCurrency, formatPercent } from "@/lib/dashboard/format";
import type {
  ExperienceActivityItem,
  ExperienceChartPoint,
  ExperienceMetric,
  ExperienceNavItem,
  ExperienceProfile,
  PortalViewer,
} from "@/lib/experiences/types";
export type { PortalViewer } from "@/lib/experiences/types";
import { toPortalPath } from "@/lib/routing/experience-routes";

const portalNavBase = {
  parent: [
    { id: "dashboard", label: "Dashboard", href: toPortalPath("dashboard"), icon: LayoutGrid, group: "Home" },
    { id: "fees", label: "Fees", href: toPortalPath("fees"), icon: ReceiptText, group: "Learner record" },
    { id: "academics", label: "Academics", href: toPortalPath("academics"), icon: BookOpenCheck, group: "Learner record" },
    { id: "attendance", label: "Attendance", href: toPortalPath("attendance"), icon: ShieldCheck, group: "Learner record" },
    { id: "messages", label: "Messages", href: toPortalPath("messages"), icon: MessageSquareText, group: "School contact" },
    { id: "downloads", label: "Downloads", href: toPortalPath("downloads"), icon: Download, group: "School contact" },
    { id: "notifications", label: "Notifications", href: toPortalPath("notifications"), icon: BellRing, badge: "4", group: "School contact" },
  ],
  student: [
    { id: "dashboard", label: "Dashboard", href: toPortalPath("dashboard"), icon: LayoutGrid, group: "Home" },
    { id: "fees", label: "Fees", href: toPortalPath("fees"), icon: ReceiptText, group: "Learner record" },
    { id: "academics", label: "Academics", href: toPortalPath("academics"), icon: BookOpenCheck, group: "Learner record" },
    { id: "attendance", label: "Attendance", href: toPortalPath("attendance"), icon: ShieldCheck, group: "Learner record" },
    { id: "messages", label: "Messages", href: toPortalPath("messages"), icon: MessageSquareText, group: "School contact" },
    { id: "downloads", label: "Downloads", href: toPortalPath("downloads"), icon: Download, group: "School contact" },
    { id: "notifications", label: "Notifications", href: toPortalPath("notifications"), icon: BellRing, badge: "2", group: "School contact" },
  ],
} satisfies Record<PortalViewer, ExperienceNavItem[]>;

const portalProfiles: Record<PortalViewer, ExperienceProfile> = {
  parent: {
    name: "Naomi Wambui",
    roleLabel: "Parent account",
    contextLabel: "Linked to Aisha Njeri and Brian Kamau",
  },
  student: {
    name: "Aisha Njeri",
    roleLabel: "Student account",
    contextLabel: "Grade 7 Amani stream",
  },
};

const portalMetrics: Record<PortalViewer, ExperienceMetric[]> = {
  parent: [
    {
      id: "balance",
      label: "Current balance",
      value: formatCurrency(18_500),
      helper: "Due before Friday fee deadline",
      trend: "2 learners",
    },
    {
      id: "recent-payments",
      label: "Recent payments",
      value: formatCurrency(42_000),
      helper: "Paid this term through M-PESA",
      trend: "3 payments",
    },
    {
      id: "attendance",
      label: "Attendance",
      value: formatPercent(95.4),
      helper: "Combined monthly attendance for linked learners",
      trend: "+1.2%",
    },
    {
      id: "upcoming-exams",
      label: "Upcoming exams",
      value: "2",
      helper: "CBC assessments scheduled this month",
      trend: "5 days",
    },
  ],
  student: [
    {
      id: "attendance",
      label: "Attendance",
      value: formatPercent(96.8),
      helper: "You have attended 22 of 23 learning days",
      trend: "+0.8%",
    },
    {
      id: "average",
      label: "Average score",
      value: "78%",
      helper: "Across Maths, English, Science, and SST",
      trend: "+6 pts",
    },
    {
      id: "balance",
      label: "Fee balance",
      value: formatCurrency(9_000),
      helper: "Visible for awareness only",
      trend: "Family account",
    },
    {
      id: "announcements",
      label: "New announcements",
      value: "4",
      helper: "Unread school notices and classroom updates",
      trend: "Today",
    },
  ],
};

export const portalFeeHistory = [
  { id: "fee-1", date: "2026-04-26", amount: formatCurrency(12_000), method: "M-PESA", reference: "SMX82KQ4", status: "Matched" },
  { id: "fee-2", date: "2026-04-08", amount: formatCurrency(18_000), method: "M-PESA", reference: "SLQ72MZ2", status: "Matched" },
  { id: "fee-3", date: "2026-03-15", amount: formatCurrency(12_000), method: "Bank", reference: "BNK-84721", status: "Posted" },
];

export const portalAcademicRows = [
  { id: "result-1", subject: "Mathematics", score: "82%", grade: "EE", teacher: "Mr. Otieno" },
  { id: "result-2", subject: "English", score: "75%", grade: "ME", teacher: "Ms. Njoroge" },
  { id: "result-3", subject: "Science & Tech", score: "80%", grade: "EE", teacher: "Ms. Kendi" },
  { id: "result-4", subject: "Kiswahili", score: "73%", grade: "ME", teacher: "Mr. Mwangi" },
];

export const portalAttendanceRows = [
  { id: "att-1", date: "2026-04-29", state: "Present", note: "On time" },
  { id: "att-2", date: "2026-04-28", state: "Present", note: "On time" },
  { id: "att-3", date: "2026-04-27", state: "Absent", note: "Sick leave communicated" },
  { id: "att-4", date: "2026-04-24", state: "Present", note: "On time" },
];

export const portalAttendanceTrend: ExperienceChartPoint[] = [
  { label: "Week 1", value: 93 },
  { label: "Week 2", value: 95 },
  { label: "Week 3", value: 96 },
  { label: "Week 4", value: 97 },
];

export const portalMessages: ExperienceActivityItem[] = [
  {
    id: "msg-1",
    title: "Fee reminder",
    detail: "Transport fee top-up is due before Friday to keep the term balance clear.",
    timeLabel: "12 min",
    tone: "warning",
  },
  {
    id: "msg-2",
    title: "Grade 7 CAT schedule",
    detail: "Mid-term CAT begins on Monday. Revision packs are available in downloads.",
    timeLabel: "2 hrs",
    tone: "ok",
  },
  {
    id: "msg-3",
    title: "Attendance note acknowledged",
    detail: "The class teacher marked your sick-leave note as received.",
    timeLabel: "Yesterday",
    tone: "ok",
  },
];

export function getPortalWorkspace(viewer: PortalViewer) {
  return {
    viewer,
    navItems: portalNavBase[viewer],
    profile: portalProfiles[viewer],
    metrics: portalMetrics[viewer],
  };
}

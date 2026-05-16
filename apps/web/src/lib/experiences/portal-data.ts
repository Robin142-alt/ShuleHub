import {
  BellRing,
  BookOpenCheck,
  Download,
  LayoutGrid,
  MessageSquareText,
  ReceiptText,
  ShieldAlert,
} from "lucide-react";

import { formatCurrency } from "@/lib/dashboard/format";
import type {
  ExperienceActivityItem,
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
    { id: "discipline", label: "Behavior", href: toPortalPath("discipline"), icon: ShieldAlert, group: "Learner record" },
    { id: "messages", label: "Messages", href: toPortalPath("messages"), icon: MessageSquareText, group: "School contact" },
    { id: "downloads", label: "Downloads", href: toPortalPath("downloads"), icon: Download, group: "School contact" },
    { id: "notifications", label: "Notifications", href: toPortalPath("notifications"), icon: BellRing, group: "School contact" },
  ],
  student: [
    { id: "dashboard", label: "Dashboard", href: toPortalPath("dashboard"), icon: LayoutGrid, group: "Home" },
    { id: "fees", label: "Fees", href: toPortalPath("fees"), icon: ReceiptText, group: "Learner record" },
    { id: "academics", label: "Academics", href: toPortalPath("academics"), icon: BookOpenCheck, group: "Learner record" },
    { id: "discipline", label: "Behavior", href: toPortalPath("discipline"), icon: ShieldAlert, group: "Learner record" },
    { id: "messages", label: "Messages", href: toPortalPath("messages"), icon: MessageSquareText, group: "School contact" },
    { id: "downloads", label: "Downloads", href: toPortalPath("downloads"), icon: Download, group: "School contact" },
    { id: "notifications", label: "Notifications", href: toPortalPath("notifications"), icon: BellRing, group: "School contact" },
  ],
} satisfies Record<PortalViewer, ExperienceNavItem[]>;

const portalProfiles: Record<PortalViewer, ExperienceProfile> = {
  parent: {
    name: "Parent portal",
    roleLabel: "Parent account",
    contextLabel: "No linked learners yet",
  },
  student: {
    name: "Student portal",
    roleLabel: "Student account",
    contextLabel: "No learner profile linked yet",
  },
};

const portalMetrics: Record<PortalViewer, ExperienceMetric[]> = {
  parent: [
    {
      id: "balance",
      label: "Current balance",
      value: formatCurrency(0),
      helper: "No linked learner fee records yet",
      trend: "0 learners",
    },
    {
      id: "recent-payments",
      label: "Recent payments",
      value: formatCurrency(0),
      helper: "No live payments posted yet",
      trend: "0 payments",
    },
    {
      id: "upcoming-exams",
      label: "Upcoming exams",
      value: "0",
      helper: "No assessment schedule published yet",
      trend: "0",
    },
  ],
  student: [
    {
      id: "average",
      label: "Average score",
      value: "0%",
      helper: "No assessment results published yet",
      trend: "0 pts",
    },
    {
      id: "balance",
      label: "Fee balance",
      value: formatCurrency(0),
      helper: "No linked family fee records yet",
      trend: "No account",
    },
    {
      id: "announcements",
      label: "New announcements",
      value: "0",
      helper: "No unread school notices yet",
      trend: "0",
    },
  ],
};

export const portalFeeHistory: Array<{
  id: string;
  date: string;
  amount: string;
  method: string;
  reference: string;
  status: string;
}> = [];

export const portalAcademicRows: Array<{
  id: string;
  subject: string;
  score: string;
  grade: string;
  teacher: string;
}> = [];

export const portalMessages: ExperienceActivityItem[] = [];

export function getPortalWorkspace(viewer: PortalViewer) {
  return {
    viewer,
    navItems: portalNavBase[viewer],
    profile: portalProfiles[viewer],
    metrics: portalMetrics[viewer],
  };
}

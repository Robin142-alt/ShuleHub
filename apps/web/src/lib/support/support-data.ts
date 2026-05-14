import {
  Activity,
  BarChart3,
  BookOpenCheck,
  Clock3,
  Inbox,
  LifeBuoy,
  MessageSquareText,
} from "lucide-react";

import type { ExperienceNavItem } from "@/lib/experiences/types";
import { toSchoolPath, toSuperadminPath } from "@/lib/routing/experience-routes";

export type SupportPriority = "Low" | "Medium" | "High" | "Critical";
export type SupportStatus =
  | "Open"
  | "In Progress"
  | "Waiting for School"
  | "Escalated"
  | "Resolved"
  | "Closed";

export interface SupportMessage {
  id: string;
  author: string;
  authorType: "school" | "support" | "system";
  body: string;
  createdAt: string;
}

export interface SupportAttachment {
  id: string;
  name: string;
  type: string;
  size: string;
  storedPath: string;
}

export interface SupportInternalNote {
  id: string;
  author: string;
  body: string;
  createdAt: string;
}

export interface SupportTicket {
  id: string;
  ticketNumber: string;
  tenantId: string;
  tenantSlug: string;
  schoolName: string;
  subject: string;
  category: string;
  priority: SupportPriority;
  moduleAffected: string;
  description: string;
  status: SupportStatus;
  owner: string;
  requester: string;
  updatedAt: string;
  firstResponseDue: string;
  resolutionDue: string;
  context: {
    requestId: string;
    browser: string;
    device: string;
    pageUrl: string;
    appVersion: string;
    errorLogs: string[];
  };
  attachments: SupportAttachment[];
  messages: SupportMessage[];
  internalNotes: SupportInternalNote[];
}

export const supportSidebarItems: ExperienceNavItem[] = [
  {
    id: "support-new-ticket",
    label: "New Ticket",
    href: toSchoolPath("support-new-ticket"),
    icon: LifeBuoy,
    group: "Support Center",
  },
  {
    id: "support-my-tickets",
    label: "My Tickets",
    href: toSchoolPath("support-my-tickets"),
    icon: Inbox,
    group: "Support Center",
  },
  {
    id: "support-knowledge-base",
    label: "Knowledge Base",
    href: toSchoolPath("support-knowledge-base"),
    icon: BookOpenCheck,
    group: "Support Center",
  },
  {
    id: "support-system-status",
    label: "System Status",
    href: toSchoolPath("support-system-status"),
    icon: Activity,
    group: "Support Center",
  },
];

export const adminSupportSidebarItems: ExperienceNavItem[] = [
  {
    id: "support-all",
    label: "All Tickets",
    href: toSuperadminPath("support"),
    icon: LifeBuoy,
    group: "Support",
  },
  {
    id: "support-open",
    label: "Open",
    href: toSuperadminPath("support-open"),
    icon: Inbox,
    group: "Support",
  },
  {
    id: "support-in-progress",
    label: "In Progress",
    href: toSuperadminPath("support-in-progress"),
    icon: MessageSquareText,
    group: "Support",
  },
  {
    id: "support-escalated",
    label: "Escalated",
    href: toSuperadminPath("support-escalated"),
    icon: Clock3,
    group: "Support",
  },
  {
    id: "support-resolved",
    label: "Resolved",
    href: toSuperadminPath("support-resolved"),
    icon: Activity,
    group: "Support",
  },
  {
    id: "support-sla",
    label: "SLA Monitoring",
    href: toSuperadminPath("support-sla"),
    icon: Clock3,
    group: "Support",
  },
  {
    id: "support-analytics",
    label: "Support Analytics",
    href: toSuperadminPath("support-analytics"),
    icon: BarChart3,
    group: "Support",
  },
];

export const supportCategories = [
  "Finance",
  "MPESA",
  "Exams",
  "Timetable",
  "Inventory",
  "Library",
  "Login Issues",
  "Subscription",
  "Reports",
  "Performance",
  "Bug Report",
  "Feature Request",
] as const;

export const supportModules = [
  "Finance",
  "MPESA",
  "Exams",
  "Timetable",
  "Inventory",
  "Library",
  "Login",
  "Subscription",
  "Reports",
  "Performance",
] as const;

export const knowledgeBaseArticles = [
  {
    id: "kb-mpesa",
    category: "MPESA",
    title: "MPESA receipts are paid but not matched",
    summary:
      "Check callback status, account reference format, and reconciliation queue before opening an escalation.",
    tags: ["mpesa", "payments", "reconciliation"],
  },
  {
    id: "kb-access",
    category: "Login Issues",
    title: "Reset a school administrator account",
    summary:
      "Recover access safely without sharing passwords over chat or SMS.",
    tags: ["login", "admin", "security"],
  },
  {
    id: "kb-performance",
    category: "Performance",
    title: "Dashboard feels slow after term opening",
    summary:
      "Term opening creates high SMS, payment, and reporting traffic. Confirm system status first.",
    tags: ["performance", "queues", "dashboard"],
  },
];

export const systemStatusComponents = [
  { id: "api", name: "API status", status: "Telemetry pending", uptime: "Connect status API", latency: "N/A" },
  { id: "payments", name: "Payment systems", status: "Telemetry pending", uptime: "Connect status API", latency: "N/A" },
  { id: "mpesa", name: "MPESA integrations", status: "Telemetry pending", uptime: "Connect status API", latency: "N/A" },
  { id: "queues", name: "Queues", status: "Telemetry pending", uptime: "Connect status API", latency: "N/A" },
  { id: "dashboards", name: "Uptime", status: "Telemetry pending", uptime: "Connect status API", latency: "N/A" },
];

export const supportAnalytics = {
  metrics: [
    { id: "unresolved", label: "Unresolved tickets", value: "0", helper: "No live support data loaded" },
    { id: "breach", label: "SLA breach risk", value: "0", helper: "No overdue live tickets" },
    { id: "critical", label: "Critical tickets", value: "0", helper: "Instant escalation and support visibility" },
    { id: "response", label: "Median first response", value: "N/A", helper: "Available after real tickets are created" },
  ],
  recurringIssues: [],
  heatmap: [],
};

export function createSupportTickets(): SupportTicket[] {
  return [];
}

export function priorityTone(priority: SupportPriority) {
  if (priority === "Critical") return "critical" as const;
  if (priority === "High") return "warning" as const;
  return "ok" as const;
}

export function statusTone(status: SupportStatus) {
  if (status === "Escalated") return "critical" as const;
  if (status === "Open" || status === "In Progress" || status === "Waiting for School") {
    return "warning" as const;
  }
  return "ok" as const;
}

export function buildAttachmentPath(tenantSlug: string, ticketNumber: string, fileName: string) {
  return `tenant/${tenantSlug}/support/${ticketNumber}/${fileName}`;
}

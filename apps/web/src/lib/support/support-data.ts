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
    badge: "3",
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
    badge: "12",
  },
  {
    id: "support-open",
    label: "Open",
    href: toSuperadminPath("support-open"),
    icon: Inbox,
    group: "Support",
    badge: "5",
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
    badge: "2",
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
  "Attendance",
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
  "Attendance",
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
      "Term opening creates high SMS, payment, and attendance traffic. Confirm system status first.",
    tags: ["performance", "queues", "dashboard"],
  },
];

export const systemStatusComponents = [
  { id: "api", name: "API status", status: "Operational", uptime: "99.98%", latency: "182ms" },
  { id: "payments", name: "Payment systems", status: "Operational", uptime: "99.96%", latency: "240ms" },
  { id: "mpesa", name: "MPESA integrations", status: "Degraded", uptime: "99.90%", latency: "410ms" },
  { id: "queues", name: "Queues", status: "Operational", uptime: "99.95%", latency: "95ms" },
  { id: "dashboards", name: "Uptime", status: "Operational", uptime: "99.99%", latency: "160ms" },
];

export const supportAnalytics = {
  metrics: [
    { id: "unresolved", label: "Unresolved tickets", value: "42", helper: "Open, in progress, waiting, and escalated" },
    { id: "breach", label: "SLA breach risk", value: "7", helper: "First response or resolution due inside 30 minutes" },
    { id: "critical", label: "Critical tickets", value: "2", helper: "Instant escalation and support visibility" },
    { id: "response", label: "Median first response", value: "18m", helper: "Across the last 7 days" },
  ],
  recurringIssues: [
    "Recurring MPESA callback failures",
    "Login resets after staff turnover",
    "Report export timeouts during term opening",
  ],
  heatmap: [
    { day: "Mon", tickets: 18 },
    { day: "Tue", tickets: 24 },
    { day: "Wed", tickets: 16 },
    { day: "Thu", tickets: 31 },
    { day: "Fri", tickets: 22 },
  ],
};

export function createSupportTickets(): SupportTicket[] {
  return [
    {
      id: "ticket-critical-mpesa",
      ticketNumber: "SUP-2026-000145",
      tenantId: "tenant-baraka",
      tenantSlug: "barakaacademy",
      schoolName: "Baraka Academy",
      subject: "MPESA callbacks are failing",
      category: "MPESA",
      priority: "Critical",
      moduleAffected: "MPESA",
      description:
        "Parents are paying, callbacks return intermittently, and receipts stay unmatched in the finance workspace.",
      status: "Escalated",
      owner: "Mercy Otieno",
      requester: "Joseph Kamau",
      updatedAt: "8 min ago",
      firstResponseDue: "08:15 EAT",
      resolutionDue: "10:00 EAT",
      context: {
        requestId: "req-support-1",
        browser: "Chrome 124",
        device: "Android phone",
        pageUrl: "/school/admin/mpesa",
        appVersion: "2026.05.08",
        errorLogs: ["POST /mpesa/callback 500", "receipt QJT8V9H33 unmatched"],
      },
      attachments: [
        {
          id: "att-callback-log",
          name: "mpesa-callback.log",
          type: "text/plain",
          size: "18 KB",
          storedPath: "tenant/barakaacademy/support/SUP-2026-000145/mpesa-callback.log",
        },
      ],
      messages: [
        {
          id: "msg-school-1",
          author: "Joseph Kamau",
          authorType: "school",
          body: "Parents are paying but several callbacks are not matching learners.",
          createdAt: "08:00 EAT",
        },
        {
          id: "msg-support-1",
          author: "Mercy Otieno",
          authorType: "support",
          body: "We have isolated the Daraja callback retry issue and are monitoring receipts.",
          createdAt: "08:08 EAT",
        },
      ],
      internalNotes: [
        {
          id: "note-1",
          author: "Mercy Otieno",
          body: "Bug confirmed. Deploying fix tonight.",
          createdAt: "08:11 EAT",
        },
      ],
    },
    {
      id: "ticket-login-reset",
      ticketNumber: "SUP-2026-000146",
      tenantId: "tenant-amani",
      tenantSlug: "amaniprep",
      schoolName: "Amani Prep School",
      subject: "Principal access reset needed",
      category: "Login Issues",
      priority: "High",
      moduleAffected: "Login",
      description: "The principal changed phones and cannot finish the password recovery challenge.",
      status: "In Progress",
      owner: "Kelvin Maina",
      requester: "Grace Njeri",
      updatedAt: "21 min ago",
      firstResponseDue: "09:30 EAT",
      resolutionDue: "12:30 EAT",
      context: {
        requestId: "req-support-2",
        browser: "Safari 17",
        device: "iPhone",
        pageUrl: "/school/principal/settings",
        appVersion: "2026.05.08",
        errorLogs: [],
      },
      attachments: [],
      messages: [
        {
          id: "msg-access",
          author: "Grace Njeri",
          authorType: "school",
          body: "We need a safe reset for the principal account.",
          createdAt: "07:44 EAT",
        },
      ],
      internalNotes: [],
    },
    {
      id: "ticket-timetable-import",
      ticketNumber: "SUP-2026-000147",
      tenantId: "tenant-mombasa",
      tenantSlug: "mombasacbc",
      schoolName: "Mombasa CBC Centre",
      subject: "Timetable import help",
      category: "Timetable",
      priority: "Medium",
      moduleAffected: "Timetable",
      description: "The deputy principal needs help importing next term's timetable.",
      status: "Waiting for School",
      owner: "Mercy Otieno",
      requester: "Daniel Ouma",
      updatedAt: "53 min ago",
      firstResponseDue: "11:00 EAT",
      resolutionDue: "Tomorrow",
      context: {
        requestId: "req-support-3",
        browser: "Edge 124",
        device: "Windows laptop",
        pageUrl: "/school/admin/timetable",
        appVersion: "2026.05.08",
        errorLogs: [],
      },
      attachments: [],
      messages: [
        {
          id: "msg-timetable",
          author: "Daniel Ouma",
          authorType: "school",
          body: "Can support review our timetable template before import?",
          createdAt: "07:09 EAT",
        },
      ],
      internalNotes: [],
    },
  ];
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

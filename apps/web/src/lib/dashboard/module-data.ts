import { roleLabels } from "./role-config";
import type {
  DashboardRole,
  DashboardSnapshot,
  ModuleWorkspace,
} from "./types";

function moduleHref(role: DashboardRole, moduleName: string) {
  return `/dashboard/${role}/${moduleName}`;
}

function buildFinanceWorkspace(
  role: DashboardRole,
  snapshot: DashboardSnapshot,
  online: boolean,
): ModuleWorkspace {
  const invoiceActionLabel = role === "parent" ? "View statement" : "Create invoice";

  return {
    title: role === "parent" ? "Family fee workspace" : "Finance workspace",
    description:
      role === "parent"
        ? "Track balances, recent payments, and the next fee step for your learner profile."
        : "Work the collection desk, close reconciliation gaps, and move exceptions before end of day.",
    badge: role === "parent" ? "Family Finance" : "Collections and reconciliation",
    sections: [
      {
        id: "collections",
        title: "Collections control",
        description: "Monitor today's inflow, open receivables, and M-PESA exceptions without leaving the finance lane.",
        metrics: [
          {
            id: "collections-today",
            label: "Today's collections",
            value: snapshot.finance.collectionsToday,
            helper: "Ledger-backed receipts",
            tone: "ok",
          },
          {
            id: "outstanding",
            label: "Outstanding invoices",
            value: snapshot.finance.outstandingInvoices,
            helper: "Still awaiting settlement",
            tone: "warning",
          },
          {
            id: "failed",
            label: "Failed payments",
            value: snapshot.finance.failedPayments,
            helper: "Require callback review",
            tone: snapshot.finance.failedPayments === "0" ? "ok" : "critical",
          },
        ],
        tasks: [
          {
            id: "finance-task-1",
            title: role === "parent" ? "Review the next invoice due" : "Resolve unpaid fee alerts",
            detail: snapshot.alerts[0]?.description ?? "No urgent finance tasks.",
            status: snapshot.alerts.length ? "todo" : "done",
          },
          {
            id: "finance-task-2",
            title: online ? "M-PESA queue connected" : "Finance locked while offline",
            detail: online
              ? "Realtime payment posting is available."
              : "Ledger-impacting actions remain online only.",
            status: online ? "done" : "blocked",
          },
        ],
        actions: [
          {
            id: "finance-action-1",
            label: role === "parent" ? "Open payments" : "Record payment",
            href: moduleHref(role, "finance"),
            tone: "accent",
          },
          {
            id: "finance-action-2",
            label: invoiceActionLabel,
            href: moduleHref(role, "finance"),
            tone: "neutral",
          },
        ],
        insights: [
          {
            id: "finance-insight-1",
            title: "Trend signal",
            description: snapshot.finance.trendLabel,
            value: snapshot.kpis.find((item) => item.id === "collection-rate")?.value ?? "0%",
          },
          {
            id: "finance-insight-2",
            title: "Mix shift",
            description: "Collection mix appears after live receipts are posted.",
            value: `${snapshot.finance.collectionMix[0]?.value ?? 0}%`,
          },
        ],
      },
    ],
  };
}

function buildAcademicsWorkspace(
  role: DashboardRole,
  snapshot: DashboardSnapshot,
): ModuleWorkspace {
  return {
    title: "Academics workspace",
    description:
      role === "parent"
        ? "Follow assessments, subject momentum, and the next academic milestone for your child."
        : "Track exam timing, grading queue pressure, and CBC subject performance in one lane.",
    badge: "CBC aligned",
    sections: [
      {
        id: "academics-core",
        title: "Learning operations",
        description: "Assessment readiness and subject movement are surfaced together so teachers and school leaders can act quickly.",
        metrics: [
          {
            id: "next-exam",
            label: "Next exam",
            value: snapshot.academics.nextExam,
            helper: "Closest academic deadline",
            tone: "warning",
          },
          {
            id: "grading-queue",
            label: "Grading queue",
            value: snapshot.academics.gradingQueue,
            helper: "Still awaiting completion",
            tone: "warning",
          },
          {
            id: "performance",
            label: "Trend",
            value: snapshot.academics.performanceTrend,
            helper: "Current learning movement",
            tone: "ok",
          },
        ],
        tasks: snapshot.academics.subjects.map((subject, index) => ({
          id: `academics-task-${index + 1}`,
          title: `${subject.subject} review`,
          detail: `Current subject performance is ${subject.value}% and ready for drill-down.`,
          status: subject.value >= 75 ? "done" : subject.value >= 70 ? "in-progress" : "todo",
        })),
        actions: [
          {
            id: "academics-action-1",
            label: role === "teacher" ? "Open grading queue" : "Review subject trends",
            href: moduleHref(role, "academics"),
            tone: "accent",
          },
          {
            id: "academics-action-2",
            label: role === "parent" ? "View child report" : "Schedule moderation",
            href: moduleHref(role, "academics"),
            tone: "neutral",
          },
        ],
        insights: [
          {
            id: "academics-insight-1",
            title: "Best performing subject",
            description: "Strongest current signal across published CBC subject results.",
            value: `${[...snapshot.academics.subjects].sort((a, b) => b.value - a.value)[0]?.subject ?? "No subject data"}`,
          },
          {
            id: "academics-insight-2",
            title: "Intervention lane",
            description: "Lowest subject should shape the next coaching or revision plan.",
            value: `${[...snapshot.academics.subjects].sort((a, b) => a.value - b.value)[0]?.subject ?? "No subject data"}`,
          },
        ],
      },
    ],
  };
}

function buildStudentsWorkspace(
  role: DashboardRole,
  snapshot: DashboardSnapshot,
): ModuleWorkspace {
  return {
    title: role === "parent" ? "Learner workspace" : "Students workspace",
    description:
      role === "parent"
        ? "See learner progress, balances, and the next family-facing actions from one place."
        : "Admission flow, guardian verification, and class placement decisions stay in the first operational layer here.",
    badge: role === "parent" ? "Family profile" : "Admissions and classing",
    sections: [
      {
        id: "students-core",
        title: "Learner operations",
        description: "Keep student records actionable by focusing on admissions, verification, and movement between classes.",
        metrics: [
          {
            id: "student-total",
            label: role === "parent" ? "Children linked" : "Total students",
            value: snapshot.kpis.find((item) => item.id === "students" || item.id === "children")?.value ?? "0",
            helper: role === "parent" ? "Active family links" : "Current active learners",
            tone: "ok",
          },
          {
            id: "recent-updates",
            label: "Recent updates",
            value: `${snapshot.activityFeed.filter((item) => item.category === "student").length}`,
            helper: "Student record events in the recent feed",
            tone: "warning",
          },
        ],
        tasks: [
          {
            id: "students-task-1",
            title: role === "parent" ? "Review learner academic note" : "Verify new admissions",
            detail:
              role === "parent"
                ? "Open the latest academic or classroom note before the day closes."
                : "Front office updates should be classed and guardian-verified today.",
            status: "todo",
          },
          {
            id: "students-task-2",
            title: "Open learner profile",
            detail: snapshot.activityFeed.find((item) => item.category === "student")?.detail ?? "Student activity will appear here.",
            status: "in-progress",
          },
        ],
        actions: [
          {
            id: "students-action-1",
            label: role === "parent" ? "Open child summary" : "Add student",
            href: moduleHref(role, "students"),
            tone: "accent",
          },
          {
            id: "students-action-2",
            label: "View student activity",
            href: moduleHref(role, "students"),
            tone: "neutral",
          },
        ],
        insights: [
          {
            id: "students-insight-1",
            title: "Attention now",
            description: "Student operations should always flow from alerts into class-level action.",
            value: snapshot.alerts[0]?.metricValue ?? "0",
          },
          {
            id: "students-insight-2",
            title: "Role scope",
            description: `${roleLabels[role]} access stays tenant-scoped and trimmed to this workspace.`,
            value: snapshot.tenant.name,
          },
        ],
      },
    ],
  };
}

function buildCommunicationWorkspace(
  role: DashboardRole,
  snapshot: DashboardSnapshot,
): ModuleWorkspace {
  return {
    title: "Communication workspace",
    description: "Track outbound notices, parent messaging, and queue health without losing the school-day thread.",
    badge: "SMS and notices",
    sections: [
      {
        id: "communication-core",
        title: "Message flow",
        description: "Operational messaging should stay lightweight, tenant-scoped, and tied to real school actions.",
        metrics: [
          {
            id: "unread-notices",
            label: role === "parent" ? "Unread notices" : "Queued notices",
            value: snapshot.kpis.find((item) => item.id === "messages" || item.id === "staff")?.value ?? "4",
            helper: role === "parent" ? "Still waiting for family review" : "Outbound communication still open",
            tone: "warning",
          },
          {
            id: "activity-count",
            label: "Recent communication",
            value: `${snapshot.activityFeed.filter((item) => item.category === "communication").length}`,
            helper: "Communication events in the feed",
            tone: "ok",
          },
          {
            id: "notifications",
            label: "Live notifications",
            value: `${snapshot.notifications.length}`,
            helper: "Items currently surfaced in topbar",
            tone: "warning",
          },
        ],
        tasks: [
          {
            id: "communication-task-1",
            title: "Review the next outbound message",
            detail: snapshot.notifications[0]?.title ?? "No communication alerts right now.",
            status: "todo",
          },
          {
            id: "communication-task-2",
            title: "Follow up communication activity",
            detail: snapshot.activityFeed.find((item) => item.category === "communication")?.detail ?? "Recent outbound messages will appear here.",
            status: "in-progress",
          },
        ],
        actions: [
          {
            id: "communication-action-1",
            label: "Send SMS",
            href: moduleHref(role, "communication"),
            tone: "accent",
          },
          {
            id: "communication-action-2",
            label: "Open notice history",
            href: moduleHref(role, "communication"),
            tone: "neutral",
          },
        ],
        insights: [
          {
            id: "communication-insight-1",
            title: "Message posture",
            description: "Fee reminders and classroom notices drive the heaviest daytime bursts.",
            value: `${snapshot.notifications.length} active`,
          },
          {
            id: "communication-insight-2",
            title: "Tenant scope",
            description: "All activity shown here stays inside the current school tenant boundary.",
            value: snapshot.tenant.county,
          },
        ],
      },
    ],
  };
}

function buildStaffWorkspace(
  role: DashboardRole,
  snapshot: DashboardSnapshot,
): ModuleWorkspace {
  return {
    title: "Staff workspace",
    description: "Keep teaching coverage, approvals, and staff-day execution visible in one screen.",
    badge: "Teaching operations",
    sections: [
      {
        id: "staff-core",
        title: "Staff posture",
        description: "This view concentrates on active staff, class coverage, and school-day delivery.",
        metrics: [
          {
            id: "active-staff",
            label: role === "teacher" ? "Active classes" : "Active staff",
            value: snapshot.kpis.find((item) => item.id === "classes" || item.id === "staff")?.value ?? "96",
            helper: role === "teacher" ? "Classes under your responsibility" : "Teachers and admin online today",
            tone: "ok",
          },
          {
            id: "approvals",
            label: "Pending approvals",
            value: `${snapshot.notifications.filter((item) => item.severity !== "ok").length}`,
            helper: "Needs admin or lead teacher review",
            tone: "warning",
          },
        ],
        tasks: [
          {
            id: "staff-task-1",
            title: "Review pending approvals",
            detail: snapshot.notifications.find((item) => item.severity === "critical")?.title ?? "No critical staff approvals right now.",
            status: "todo",
          },
          {
            id: "staff-task-2",
            title: "Confirm class coverage",
            detail: "Use staff schedules and academics to close any uncovered sessions.",
            status: "in-progress",
          },
        ],
        actions: [
          {
            id: "staff-action-1",
            label: "Open staff records",
            href: moduleHref(role, "staff"),
            tone: "accent",
          },
          {
            id: "staff-action-2",
            label: "Review timetable cover",
            href: moduleHref(role, "staff"),
            tone: "neutral",
          },
        ],
        insights: [
          {
            id: "staff-insight-1",
            title: "Operational handoff",
            description: "Staff issues often begin as timetable gaps or academic delays.",
            value: `${snapshot.notifications.length}`,
          },
          {
            id: "staff-insight-2",
            title: "Role lens",
            description: "This workspace shifts emphasis depending on whether the user leads or teaches.",
            value: roleLabels[role],
          },
        ],
      },
    ],
  };
}

function buildReportsWorkspace(
  role: DashboardRole,
  snapshot: DashboardSnapshot,
): ModuleWorkspace {
  return {
    title: "Reports workspace",
    description: "Use reports as decision tools, not archives: surface the current trend, pressure point, and next export.",
    badge: "Decision support",
    sections: [
      {
        id: "reports-core",
        title: "Reporting posture",
        description: "Cross-functional summary blocks keep finance, academics, and operations aligned on the same school state.",
        metrics: [
          {
            id: "alerts",
            label: "Open alerts",
            value: `${snapshot.alerts.length}`,
            helper: "Current actionable issues",
            tone: snapshot.alerts.length > 2 ? "critical" : "warning",
          },
          {
            id: "feed",
            label: "Recent events",
            value: `${snapshot.activityFeed.length}`,
            helper: "Tenant events in scope",
            tone: "ok",
          },
          {
            id: "sync",
            label: "Sync posture",
            value: snapshot.sync.label,
            helper: "Realtime or queued state",
            tone: snapshot.sync.state === "failed" ? "critical" : snapshot.sync.state === "pending" ? "warning" : "ok",
          },
        ],
        tasks: [
          {
            id: "reports-task-1",
            title: "Open the next trend view",
            detail: snapshot.contextSections[0]?.description ?? "Trend data is ready for review.",
            status: "todo",
          },
          {
            id: "reports-task-2",
            title: "Review operational drift",
            detail: snapshot.contextSections[1]?.footer ?? "No major drift surfaced yet.",
            status: "in-progress",
          },
        ],
        actions: [
          {
            id: "reports-action-1",
            label: "Open report builder",
            href: moduleHref(role, "reports"),
            tone: "accent",
          },
          {
            id: "reports-action-2",
            label: "Export current view",
            href: moduleHref(role, "reports"),
            tone: "neutral",
          },
        ],
        insights: snapshot.contextSections.slice(0, 2).map((section, index) => ({
          id: `reports-insight-${index + 1}`,
          title: section.title,
          description: section.footer,
          value: `${section.points.at(-1)?.value ?? 0}`,
        })),
      },
    ],
  };
}

function buildSettingsWorkspace(
  role: DashboardRole,
  snapshot: DashboardSnapshot,
  online: boolean,
): ModuleWorkspace {
  return {
    title: "Settings workspace",
    description: "Keep tenant controls, sync posture, and role visibility explicit so operations stay predictable.",
    badge: "Tenant controls",
    sections: [
      {
        id: "settings-core",
        title: "Operational controls",
        description: "This view keeps configuration adjacent to the school-day state it affects.",
        metrics: [
          {
            id: "tenant",
            label: "Tenant",
            value: snapshot.tenant.name,
            helper: snapshot.tenant.county,
            tone: "ok",
          },
          {
            id: "role",
            label: "Role scope",
            value: roleLabels[role],
            helper: "Current access boundary",
            tone: "ok",
          },
          {
            id: "sync",
            label: "Sync state",
            value: online ? "Live" : "Offline queued",
            helper: snapshot.sync.label,
            tone: online ? "ok" : "warning",
          },
        ],
        tasks: [
          {
            id: "settings-task-1",
            title: "Review role visibility",
            detail: "Unauthorized modules stay hidden and route-blocked.",
            status: "done",
          },
          {
            id: "settings-task-2",
            title: "Confirm sync readiness",
            detail: online
              ? "The device is online and ready for realtime updates."
              : "Offline queue remains active until connectivity returns.",
            status: online ? "done" : "blocked",
          },
        ],
        actions: [
          {
            id: "settings-action-1",
            label: "Open tenant settings",
            href: moduleHref(role, "settings"),
            tone: "accent",
          },
          {
            id: "settings-action-2",
            label: "Review access policy",
            href: moduleHref(role, "settings"),
            tone: "neutral",
          },
        ],
        insights: [
          {
            id: "settings-insight-1",
            title: "Isolation",
            description: "All dashboard content remains tenant-scoped for the active school.",
            value: snapshot.tenant.id,
          },
          {
            id: "settings-insight-2",
            title: "Reliability",
            description: "Settings should be reviewed alongside sync and alert posture.",
            value: snapshot.sync.state,
          },
        ],
      },
    ],
  };
}

export function buildModuleWorkspace(
  role: DashboardRole,
  moduleName: string,
  snapshot: DashboardSnapshot,
  online: boolean,
): ModuleWorkspace {
  if (moduleName === "finance") {
    return buildFinanceWorkspace(role, snapshot, online);
  }

  if (moduleName === "academics") {
    return buildAcademicsWorkspace(role, snapshot);
  }

  if (moduleName === "students") {
    return buildStudentsWorkspace(role, snapshot);
  }

  if (moduleName === "communication") {
    return buildCommunicationWorkspace(role, snapshot);
  }

  if (moduleName === "staff") {
    return buildStaffWorkspace(role, snapshot);
  }

  if (moduleName === "reports") {
    return buildReportsWorkspace(role, snapshot);
  }

  return buildSettingsWorkspace(role, snapshot, online);
}

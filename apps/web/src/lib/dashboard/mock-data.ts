import {
  formatCurrency,
  formatPercent,
} from "./format";
import {
  type AlertItem,
  type KpiCard,
  type DashboardRole,
  type DashboardSnapshot,
  type TenantOption,
} from "./types";
import { getRoleCapabilities, getRoleQuickActions } from "./role-config";

const tenants: TenantOption[] = [
  { id: "amani-prep", name: "Amani Preparatory", county: "Nairobi" },
  { id: "mwangaza-junior", name: "Mwangaza Junior School", county: "Kisumu" },
  { id: "baraka-academy", name: "Baraka Academy", county: "Kiambu" },
];

const roleNarratives: Record<DashboardRole, { title: string; description: string }> = {
  admin: {
    title: "School command center",
    description: "Track fee pressure, attendance posture, staffing health, and tenant operations in one place.",
  },
  bursar: {
    title: "Collections and reconciliation desk",
    description: "Focus on receipts, failed M-PESA flows, open invoices, and reconciled ledger truth.",
  },
  teacher: {
    title: "Teaching day planner",
    description: "Spot unmarked classes, pending grading, and student performance trends before lessons begin.",
  },
  parent: {
    title: "Family school hub",
    description: "Stay current on your child, fee balance, attendance, and school communication from one view.",
  },
  storekeeper: {
    title: "Inventory control desk",
    description: "Manage stock, supplier flow, low-stock pressure, and request fulfillment without finance blind spots.",
  },
  admissions: {
    title: "Admissions office",
    description: "Track applications, document gaps, approvals, and final registration into the student directory.",
  },
};

const roleAlerts: Record<DashboardRole, AlertItem[]> = {
  admin: [
    {
      id: "alert-admin-1",
      title: "Outstanding fees need follow-up",
      description: "34 invoices are over 14 days late across Grade 7 to Grade 9.",
      severity: "critical",
      href: "/dashboard/admin/finance",
      actionLabel: "Open receivables",
      metricLabel: "Outstanding",
      metricValue: "KES 1.24M",
    },
    {
      id: "alert-admin-2",
      title: "Three sync conflicts need resolution",
      description: "Offline attendance submissions for Grade 4 Umoja collided after morning roll call.",
      severity: "warning",
      href: "/dashboard/admin/attendance",
      actionLabel: "Resolve sync",
      metricLabel: "Conflicts",
      metricValue: "3",
    },
    {
      id: "alert-admin-3",
      title: "Two M-PESA callbacks failed validation",
      description: "Payment intents are waiting for verification before posting to the ledger.",
      severity: "critical",
      href: "/dashboard/admin/finance",
      actionLabel: "Review failures",
      metricLabel: "Failed",
      metricValue: "2",
    },
  ],
  bursar: [
    {
      id: "alert-bursar-1",
      title: "Reconciliation drift detected",
      description: "Yesterday's cashbook and M-PESA clearing differ by KES 12,400.",
      severity: "critical",
      href: "/dashboard/bursar/finance",
      actionLabel: "Reconcile now",
      metricLabel: "Variance",
      metricValue: "KES 12.4K",
    },
    {
      id: "alert-bursar-2",
      title: "Nine invoices are due today",
      description: "Transport and lunch bundles mature before close of business.",
      severity: "warning",
      href: "/dashboard/bursar/finance",
      actionLabel: "Review invoices",
      metricLabel: "Due today",
      metricValue: "9",
    },
  ],
  teacher: [
    {
      id: "alert-teacher-1",
      title: "Attendance missing for one class",
      description: "Grade 5 Amani has not been marked for the morning session.",
      severity: "critical",
      href: "/dashboard/teacher/attendance",
      actionLabel: "Mark now",
      metricLabel: "Unmarked",
      metricValue: "1",
    },
    {
      id: "alert-teacher-2",
      title: "CBC results await approval",
      description: "Science rubric moderation is pending for 18 learners.",
      severity: "warning",
      href: "/dashboard/teacher/academics",
      actionLabel: "Open grading",
      metricLabel: "Awaiting",
      metricValue: "18",
    },
  ],
  parent: [
    {
      id: "alert-parent-1",
      title: "Fee balance is due this week",
      description: "Transport top-up is due before Friday to avoid service interruption.",
      severity: "warning",
      href: "/dashboard/parent/finance",
      actionLabel: "View invoice",
      metricLabel: "Balance",
      metricValue: "KES 8,500",
    },
    {
      id: "alert-parent-2",
      title: "Attendance slip recorded today",
      description: "Your learner was marked late for the 7:20 a.m. roll call.",
      severity: "critical",
      href: "/dashboard/parent/attendance",
      actionLabel: "View details",
      metricLabel: "Status",
      metricValue: "Late",
    },
  ],
  storekeeper: [
    {
      id: "alert-storekeeper-1",
      title: "Seven items are below reorder level",
      description: "Stationery, cleaning chemicals, and lab reagents need action before the next issue cycle.",
      severity: "critical",
      href: "/dashboard/storekeeper/inventory",
      actionLabel: "Open low stock",
      metricLabel: "Low stock",
      metricValue: "7",
    },
    {
      id: "alert-storekeeper-2",
      title: "Two purchase orders are awaiting receipt",
      description: "Suppliers delivered this morning but stock has not yet been received into stores.",
      severity: "warning",
      href: "/dashboard/storekeeper/inventory",
      actionLabel: "Receive stock",
      metricLabel: "Pending receipt",
      metricValue: "2",
    },
  ],
  admissions: [
    {
      id: "alert-admissions-1",
      title: "Five applications are missing documents",
      description: "Birth certificates and previous report forms are still outstanding before approval.",
      severity: "critical",
      href: "/dashboard/admissions/admissions",
      actionLabel: "Review files",
      metricLabel: "Missing docs",
      metricValue: "5",
    },
    {
      id: "alert-admissions-2",
      title: "Three approved learners still need class allocation",
      description: "Registration is complete but final streaming and transport assignment remain open.",
      severity: "warning",
      href: "/dashboard/admissions/admissions",
      actionLabel: "Assign class",
      metricLabel: "Unallocated",
      metricValue: "3",
    },
  ],
};

export function getTenantOptions() {
  return tenants;
}

function buildRoleKpis(role: DashboardRole, maskFinance: boolean): KpiCard[] {
  if (role === "bursar") {
    return [
      {
        id: "collections-today",
        label: "Today's collections",
        value: formatCurrency(426_300, false),
        helper: "Posted through M-PESA and cash office today",
        trendValue: "+8.4%",
        trendDirection: "up",
        href: "/dashboard/bursar/finance",
        sparkline: [38, 44, 50, 56, 61, 67, 74],
      },
      {
        id: "collection-rate",
        label: "Fee collection rate",
        value: "87.4%",
        helper: "Against this month's collection target",
        trendValue: "+6.1%",
        trendDirection: "up",
        href: "/dashboard/bursar/finance",
        sparkline: [62, 67, 71, 74, 79, 83, 87],
      },
      {
        id: "outstanding",
        label: "Outstanding fees",
        value: formatCurrency(1_240_000, false),
        helper: "Receivables still open across active invoices",
        trendValue: "-4.4%",
        trendDirection: "down",
        href: "/dashboard/bursar/finance",
        sparkline: [86, 78, 74, 70, 66, 61, 58],
      },
      {
        id: "failed-payments",
        label: "Failed M-PESA",
        value: "2",
        helper: "Callbacks waiting for validation or retry",
        trendValue: "-1",
        trendDirection: "down",
        href: "/dashboard/bursar/finance",
        sparkline: [6, 6, 5, 5, 4, 3, 2],
      },
      {
        id: "reconciled",
        label: "Reconciled today",
        value: "91%",
        helper: "Collections matched to ledger truth today",
        trendValue: "+3.0%",
        trendDirection: "up",
        href: "/dashboard/bursar/reports",
        sparkline: [72, 75, 79, 82, 85, 88, 91],
      },
    ];
  }

  if (role === "teacher") {
    return [
      {
        id: "learners",
        label: "Assigned learners",
        value: "214",
        helper: "Across six CBC streams",
        trendValue: "+2",
        trendDirection: "up",
        href: "/dashboard/teacher/students",
        sparkline: [198, 201, 204, 207, 209, 211, 214],
      },
      {
        id: "attendance",
        label: "Attendance rate",
        value: "94.8%",
        helper: "Morning session across assigned classes",
        trendValue: "+1.6%",
        trendDirection: "up",
        href: "/dashboard/teacher/attendance",
        sparkline: [88, 90, 91, 92, 93, 94, 95],
      },
      {
        id: "grading-queue",
        label: "Grading queue",
        value: "18",
        helper: "CBC rubric submissions awaiting review",
        trendValue: "-5",
        trendDirection: "down",
        href: "/dashboard/teacher/academics",
        sparkline: [31, 28, 26, 24, 22, 20, 18],
      },
      {
        id: "approved-results",
        label: "Approved results",
        value: "82%",
        helper: "This assessment window",
        trendValue: "+4.0%",
        trendDirection: "up",
        href: "/dashboard/teacher/academics",
        sparkline: [50, 58, 63, 66, 71, 76, 82],
      },
      {
        id: "classes",
        label: "Active classes",
        value: "6",
        helper: "Sessions assigned for today",
        trendValue: "+1",
        trendDirection: "up",
        href: "/dashboard/teacher/attendance",
        sparkline: [4, 4, 5, 5, 5, 6, 6],
      },
    ];
  }

  if (role === "parent") {
    return [
      {
        id: "children",
        label: "Children linked",
        value: "2",
        helper: "Across two active school profiles",
        trendValue: "+0",
        trendDirection: "up",
        href: "/dashboard/parent/students",
        sparkline: [2, 2, 2, 2, 2, 2, 2],
      },
      {
        id: "attendance",
        label: "Attendance rate",
        value: "95.0%",
        helper: "This week for your learner profile",
        trendValue: "+1.2%",
        trendDirection: "up",
        href: "/dashboard/parent/attendance",
        sparkline: [91, 92, 93, 93, 94, 95, 95],
      },
      {
        id: "outstanding",
        label: "Outstanding fees",
        value: formatCurrency(8_500, false),
        helper: "Across tuition and transport",
        trendValue: "-12%",
        trendDirection: "down",
        href: "/dashboard/parent/finance",
        sparkline: [25, 23, 19, 16, 14, 11, 8],
      },
      {
        id: "messages",
        label: "Unread notices",
        value: "4",
        helper: "School communication still needs review",
        trendValue: "+2",
        trendDirection: "up",
        href: "/dashboard/parent/communication",
        sparkline: [1, 1, 2, 2, 3, 3, 4],
      },
      {
        id: "next-exam",
        label: "Next exam",
        value: "5 days",
        helper: "Mid-term CAT countdown",
        trendValue: "-2 days",
        trendDirection: "down",
        href: "/dashboard/parent/academics",
        sparkline: [9, 8, 8, 7, 6, 6, 5],
      },
    ];
  }

  if (role === "storekeeper") {
    return [
      {
        id: "inventory-value",
        label: "Inventory value",
        value: formatCurrency(6_840_500, false),
        helper: "Current stock valuation across active stores",
        trendValue: "+4.8%",
        trendDirection: "up",
        href: "/dashboard/storekeeper/inventory",
        sparkline: [48, 49, 51, 53, 54, 56, 58],
      },
      {
        id: "low-stock-items",
        label: "Low stock items",
        value: "7",
        helper: "Need reordering before the next issue cycle",
        trendValue: "-2",
        trendDirection: "down",
        href: "/dashboard/storekeeper/inventory",
        sparkline: [12, 11, 11, 10, 10, 8, 7],
      },
      {
        id: "pending-requests",
        label: "Pending requests",
        value: "11",
        helper: "Department requests still awaiting stores action",
        trendValue: "+3",
        trendDirection: "up",
        href: "/dashboard/storekeeper/inventory",
        sparkline: [4, 5, 6, 7, 8, 9, 11],
      },
      {
        id: "recent-purchases",
        label: "Recent purchases",
        value: "14",
        helper: "Purchase orders raised in the past 30 days",
        trendValue: "+5",
        trendDirection: "up",
        href: "/dashboard/storekeeper/inventory",
        sparkline: [5, 6, 7, 8, 9, 11, 14],
      },
    ];
  }

  if (role === "admissions") {
    return [
      {
        id: "new-applications",
        label: "New applications",
        value: "18",
        helper: "Applications received this month",
        trendValue: "+6",
        trendDirection: "up",
        href: "/dashboard/admissions/admissions",
        sparkline: [4, 6, 7, 9, 12, 15, 18],
      },
      {
        id: "approved-students",
        label: "Approved students",
        value: "9",
        helper: "Ready for registration into the student directory",
        trendValue: "+2",
        trendDirection: "up",
        href: "/dashboard/admissions/admissions",
        sparkline: [1, 2, 3, 4, 5, 7, 9],
      },
      {
        id: "pending-review",
        label: "Pending review",
        value: "5",
        helper: "Files waiting interview or document completion",
        trendValue: "-1",
        trendDirection: "down",
        href: "/dashboard/admissions/admissions",
        sparkline: [8, 8, 7, 7, 6, 6, 5],
      },
      {
        id: "registered-total",
        label: "Total registered",
        value: "12",
        helper: "Learners fully registered this cycle",
        trendValue: "+4",
        trendDirection: "up",
        href: "/dashboard/admissions/admissions",
        sparkline: [2, 3, 4, 5, 7, 9, 12],
      },
    ];
  }

  return [
    {
      id: "students",
      label: "Total students",
      value: "1,148",
      helper: "CBC learners across Grade 1-9",
      trendValue: "+3.2%",
      trendDirection: "up",
      href: "/dashboard/admin/students",
      sparkline: [38, 42, 45, 46, 47, 49, 51],
    },
    {
      id: "attendance",
      label: "Attendance rate",
      value: "94.8%",
      helper: "Morning session across the school",
      trendValue: "+1.6%",
      trendDirection: "up",
      href: "/dashboard/admin/attendance",
      sparkline: [88, 90, 91, 92, 93, 94, 95],
    },
    {
      id: "collection",
      label: "Fee collection rate",
      value: "87.4%",
      helper: "Against this month's target",
      trendValue: "+6.1%",
      trendDirection: "up",
      href: "/dashboard/admin/finance",
      sparkline: [50, 58, 63, 66, 71, 76, 82],
    },
    {
      id: "outstanding",
      label: "Outstanding fees",
      value: formatCurrency(1_240_000, maskFinance),
      helper: "Receivables still open",
      trendValue: "-4.4%",
      trendDirection: "down",
      href: "/dashboard/admin/finance",
      sparkline: [86, 78, 74, 70, 66, 61, 58],
      masked: maskFinance,
    },
    {
      id: "staff",
      label: "Active staff",
      value: "96",
      helper: "Teachers and admins online today",
      trendValue: "+5",
      trendDirection: "up",
      href: "/dashboard/admin/staff",
      sparkline: [44, 45, 45, 46, 47, 48, 49],
    },
  ];
}

export function buildDashboardSnapshot(
  role: DashboardRole,
  tenantId: string,
  online: boolean,
): DashboardSnapshot {
  const tenant = tenants.find((entry) => entry.id === tenantId) ?? tenants[0];
  const maskFinance = role === "teacher";
  const nowLabel = online ? "Synced 2 min ago" : "Queued for sync";

  return {
    tenant,
    role,
    pageTitle: roleNarratives[role].title,
    pageDescription: roleNarratives[role].description,
    alerts: roleAlerts[role],
    kpis: buildRoleKpis(role, maskFinance),
    finance: {
      collectionsToday: formatCurrency(role === "parent" ? 18_500 : 426_300, maskFinance),
      outstandingInvoices: formatCurrency(role === "parent" ? 8_500 : 1_240_000, maskFinance),
      failedPayments: role === "parent" ? "0" : "2",
      trendLabel: role === "bursar" ? "Ledger and M-PESA reconciled for 91% of today's receipts" : "Collections are tracking 8% above the weekly baseline",
      collectionMix: [
        { label: "Tuition", value: 62 },
        { label: "Transport", value: 21 },
        { label: "Lunch", value: 17 },
      ],
    },
    attendance: {
      attendanceRate: formatPercent(role === "parent" ? 95 : 94.8),
      unmarkedClasses: role === "teacher" ? "1" : "3",
      absentees: role === "parent" ? "0" : "57",
      classStatus: [
        { className: "Grade 5 Amani", status: online ? "synced" : "pending", value: "97%" },
        { className: "Grade 7 Umoja", status: "failed", value: "92%" },
        { className: "Grade 2 Amani", status: "synced", value: "96%" },
      ],
    },
    academics: {
      nextExam: role === "parent" ? "Mid-term CAT in 5 days" : "Mid-term CAT starts Friday",
      gradingQueue: role === "teacher" ? "18 submissions" : "42 scripts awaiting moderation",
      performanceTrend: role === "parent" ? "Math improved by 6 points this month" : "Science and Maths continue to outperform the term baseline",
      subjects: [
        { subject: "Math", value: 78 },
        { subject: "English", value: 71 },
        { subject: "Science", value: 81 },
        { subject: "Social Studies", value: 69 },
      ],
    },
    contextSections: [
      {
        id: "collections-trend",
        title: role === "teacher" ? "Attendance trend" : "Collections trend",
        description: role === "teacher"
          ? "Weekly roll-call completion by class stream."
          : "Seven-day fee collection trend across tuition, transport, and lunch.",
        points: role === "teacher"
          ? [
              { label: "Mon", value: 92 },
              { label: "Tue", value: 93 },
              { label: "Wed", value: 95 },
              { label: "Thu", value: 96 },
              { label: "Fri", value: 95 },
              { label: "Sat", value: 89 },
              { label: "Sun", value: 0 },
            ]
          : [
              { label: "Mon", value: 46 },
              { label: "Tue", value: 62 },
              { label: "Wed", value: 58 },
              { label: "Thu", value: 71 },
              { label: "Fri", value: 78 },
              { label: "Sat", value: 54 },
              { label: "Sun", value: 22 },
            ],
        footer: role === "teacher" ? "Late classes are concentrated in upper primary." : "M-PESA spikes cluster around fee deadline reminders.",
      },
      {
        id: "cbc-readiness",
        title: role === "parent" ? "Child performance snapshot" : "CBC readiness",
        description: role === "parent"
          ? "Recent learning momentum by subject."
          : "Teacher moderation, exam readiness, and competency evidence coverage.",
        points: [
          { label: "Math", value: 84 },
          { label: "English", value: 73 },
          { label: "Science", value: 80 },
          { label: "Creative Arts", value: 68 },
          { label: "Kiswahili", value: 75 },
        ],
        footer: role === "parent" ? "English comprehension is the next coaching area." : "Creative Arts evidence needs review in three streams.",
      },
    ],
    activityFeed: [
      {
        id: "activity-1",
        title: "M-PESA payment posted",
        detail: "KES 24,500 received for Grade 8 transport bundle and pushed to the ledger.",
        actor: "Bursar Desk",
        href: `/dashboard/${role}/finance`,
        timeLabel: "2 min ago",
        category: "payment",
      },
      {
        id: "activity-2",
        title: "Attendance queued offline",
        detail: "Grade 4 Umoja attendance captured on tablet and awaiting sync.",
        actor: "Teacher Device",
        href: `/dashboard/${role}/attendance`,
        timeLabel: "7 min ago",
        category: "attendance",
      },
      {
        id: "activity-3",
        title: "Student admission updated",
        detail: "New learner admitted into Grade 2 Amani with guardian contacts verified.",
        actor: "Front Office",
        href: `/dashboard/${role}/students`,
        timeLabel: "18 min ago",
        category: "student",
      },
      {
        id: "activity-4",
        title: "SMS reminder sent",
        detail: "Fee reminder delivered to 48 guardians with overdue invoices.",
      actor: "Communication Queue",
      href: `/dashboard/${role}/communication`,
      timeLabel: "26 min ago",
      category: "communication",
    },
    ...(role === "storekeeper"
      ? [
          {
            id: "activity-storekeeper-1",
            title: "Issue voucher fulfilled",
            detail: "Grade 8 science lab request for reagents was issued from Main Store.",
            actor: "Main Store",
            href: `/dashboard/${role}/inventory`,
            timeLabel: "12 min ago",
            category: "student" as const,
          },
        ]
      : []),
    ...(role === "admissions"
      ? [
          {
            id: "activity-admissions-1",
            title: "Application approved",
            detail: "Brenda Atieno was approved for Grade 7 after guardian verification.",
            actor: "Admissions Desk",
            href: `/dashboard/${role}/admissions`,
            timeLabel: "9 min ago",
            category: "student" as const,
          },
        ]
      : []),
    ],
    quickActions: getRoleQuickActions(role),
    notifications: [
      {
        id: "notification-1",
        title: "Fee deadline reminder scheduled for 4:30 p.m.",
        timeLabel: "in 25 min",
        severity: "warning",
        href: `/dashboard/${role}/finance`,
      },
      {
        id: "notification-2",
        title: role === "teacher" ? "Grade 7 rubric moderation complete" : "Attendance sync succeeded for 12 class sessions",
        timeLabel: "5 min ago",
        severity: "ok",
        href: `/dashboard/${role}/${role === "teacher" ? "academics" : "attendance"}`,
      },
      {
        id: "notification-3",
        title:
          role === "parent"
            ? "New message from class teacher"
            : role === "storekeeper"
              ? "One stock request still needs fulfillment"
              : role === "admissions"
                ? "One admission file is waiting approval"
                : "One approval is still pending",
        timeLabel: "11 min ago",
        severity: "critical",
        href: `/dashboard/${role}/${role === "parent" ? "communication" : role === "storekeeper" ? "inventory" : role === "admissions" ? "admissions" : "reports"}`,
      },
    ],
    capabilities: getRoleCapabilities(role),
    sync: {
      state: online ? "synced" : "pending",
      label: online ? nowLabel : "Offline attendance queued",
      pendingCount: online ? 1 : 4,
      failedCount: online ? 0 : 1,
      lastSyncedAt: online ? "2 min ago" : "13 min ago",
    },
  };
}

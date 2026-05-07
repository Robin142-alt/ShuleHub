import type {
  CapabilityItem,
  DashboardRole,
  DashboardWidgetKey,
  QuickActionItem,
  SidebarItem,
} from "./types";
import { DASHBOARD_ROLES } from "./types";

export const roleLabels: Record<DashboardRole, string> = {
  admin: "Admin",
  bursar: "Bursar",
  teacher: "Teacher",
  parent: "Parent",
  storekeeper: "Storekeeper",
  admissions: "Admissions",
};

export const sidebarItems: SidebarItem[] = [
  { id: "dashboard", label: "Dashboard", href: "dashboard", roles: [...DASHBOARD_ROLES] },
  { id: "students", label: "Students", href: "students", roles: ["admin", "bursar", "teacher", "parent"] },
  { id: "inventory", label: "Inventory", href: "inventory", roles: ["admin", "bursar", "storekeeper"] },
  { id: "admissions", label: "Admissions", href: "admissions", roles: ["admin", "admissions"] },
  { id: "finance", label: "Fees / Payments", href: "finance", roles: ["admin", "bursar", "parent"] },
  { id: "mpesa", label: "MPESA Transactions", href: "mpesa", roles: ["admin", "bursar"] },
  { id: "attendance", label: "Attendance", href: "attendance", roles: ["admin", "teacher", "parent"] },
  { id: "academics", label: "Academics", href: "academics", roles: ["admin", "teacher", "parent"] },
  { id: "reports", label: "Reports", href: "reports", roles: ["admin", "bursar", "teacher", "parent"] },
  { id: "communication", label: "Communication (SMS)", href: "communication", roles: ["admin", "bursar", "teacher", "parent"] },
  { id: "settings", label: "Settings", href: "settings", roles: ["admin", "bursar"] },
];

export const quickActionsCatalog: QuickActionItem[] = [
  {
    id: "add-student",
    label: "Add Student",
    description: "Admit a new learner and assign a class instantly.",
    href: "students",
    roles: ["admin"],
    offlineAllowed: false,
  },
  {
    id: "record-payment",
    label: "Record Payment",
    description: "Capture fee payments or verify M-PESA receipts.",
    href: "finance",
    roles: ["admin", "bursar"],
    offlineAllowed: false,
    sensitive: true,
  },
  {
    id: "send-sms",
    label: "Send SMS",
    description: "Notify families about attendance, fees, or timetable changes.",
    href: "communication",
    roles: ["admin", "bursar", "teacher"],
    offlineAllowed: false,
  },
  {
    id: "mark-attendance",
    label: "Mark Attendance",
    description: "Open the daily class register and save the roll call quickly.",
    href: "attendance",
    roles: ["teacher"],
    offlineAllowed: true,
  },
  {
    id: "print-report",
    label: "Print Report",
    description: "Open the report center and print a school-ready summary fast.",
    href: "reports",
    roles: ["admin", "bursar"],
    offlineAllowed: false,
  },
  {
    id: "view-child",
    label: "View Child Summary",
    description: "Open attendance, fee balance, and communication history.",
    href: "students",
    roles: ["parent"],
    offlineAllowed: true,
  },
  {
    id: "adjust-stock",
    label: "Adjust Stock",
    description: "Record stock issues, receipts, and urgent quantity corrections.",
    href: "inventory",
    roles: ["storekeeper", "admin"],
    offlineAllowed: false,
  },
  {
    id: "create-po",
    label: "Create PO",
    description: "Prepare a supplier purchase order and route it for approval.",
    href: "inventory",
    roles: ["storekeeper", "admin", "bursar"],
    offlineAllowed: false,
  },
  {
    id: "new-registration",
    label: "New Registration",
    description: "Start a full learner admission and registration workflow.",
    href: "admissions",
    roles: ["admissions", "admin"],
    offlineAllowed: false,
  },
  {
    id: "review-application",
    label: "Review Application",
    description: "Open pending files, missing documents, and approval queues.",
    href: "admissions",
    roles: ["admissions", "admin"],
    offlineAllowed: false,
  },
];

export const capabilityCatalog: CapabilityItem[] = [
  {
    id: "cap-students",
    label: "Student records",
    description: "Admissions, guardian links, learner history, and class placement.",
    href: "students",
    roles: ["admin", "teacher", "parent"],
    status: "ok",
    category: "students",
  },
  {
    id: "cap-guardians",
    label: "Family profiles",
    description: "Parent contacts, notices, fee visibility, and household-facing views.",
    href: "students",
    roles: ["admin", "parent"],
    status: "ok",
    category: "students",
  },
  {
    id: "cap-cbc",
    label: "CBC academics",
    description: "Subjects, exams, grading queue, and competency performance trends.",
    href: "academics",
    roles: ["admin", "teacher", "parent"],
    status: "ok",
    category: "academics",
  },
  {
    id: "cap-attendance",
    label: "Offline attendance",
    description: "Class roll call with pending, failed, and synced device states.",
    href: "attendance",
    roles: ["admin", "teacher", "parent"],
    status: "warning",
    category: "attendance",
  },
  {
    id: "cap-sync",
    label: "Sync engine",
    description: "Conflict tracking, device queues, and offline-first operational recovery.",
    href: "attendance",
    roles: ["admin", "teacher"],
    status: "warning",
    category: "attendance",
  },
  {
    id: "cap-billing",
    label: "Billing and invoices",
    description: "Fee structures, invoice pressure, and subscription-aware collection control.",
    href: "finance",
    roles: ["admin", "bursar", "parent"],
    status: "warning",
    category: "finance",
  },
  {
    id: "cap-inventory-stock",
    label: "Inventory control",
    description: "Stock cards, reorder pressure, storage locations, and issue history.",
    href: "inventory",
    roles: ["admin", "bursar", "storekeeper"],
    status: "warning",
    category: "inventory",
  },
  {
    id: "cap-procurement",
    label: "Procurement workflow",
    description: "Suppliers, purchase orders, approvals, receiving, and cost exposure.",
    href: "inventory",
    roles: ["admin", "bursar", "storekeeper"],
    status: "ok",
    category: "inventory",
  },
  {
    id: "cap-admissions",
    label: "Admissions office",
    description: "Applications, interviews, approvals, registration, and classing.",
    href: "admissions",
    roles: ["admin", "admissions"],
    status: "ok",
    category: "admissions",
  },
  {
    id: "cap-documents",
    label: "Student documents",
    description: "Birth certificates, report forms, verification, and missing file follow-up.",
    href: "admissions",
    roles: ["admin", "admissions"],
    status: "warning",
    category: "admissions",
  },
  {
    id: "cap-mpesa",
    label: "M-PESA payments",
    description: "STK callbacks, failed transactions, retries, and payment lifecycle monitoring.",
    href: "mpesa",
    roles: ["admin", "bursar"],
    status: "critical",
    category: "finance",
  },
  {
    id: "cap-ledger",
    label: "Ledger and reconciliation",
    description: "Double-entry truth, collections reconciliation, and finance audit posture.",
    href: "finance",
    roles: ["admin", "bursar"],
    status: "ok",
    category: "finance",
  },
  {
    id: "cap-communication",
    label: "Communication",
    description: "SMS bursts, notices, reminders, and parent outreach queues.",
    href: "communication",
    roles: ["admin", "bursar", "teacher", "parent"],
    status: "ok",
    category: "communication",
  },
  {
    id: "cap-reports",
    label: "Reports and analytics",
    description: "Cross-functional drill-downs for attendance, finance, and academic trend reading.",
    href: "reports",
    roles: ["admin", "bursar", "teacher", "parent"],
    status: "ok",
    category: "reports",
  },
  {
    id: "cap-observability",
    label: "Observability",
    description: "Realtime health, queue lag, alerts, and production SLO visibility.",
    href: "reports",
    roles: ["admin", "bursar"],
    status: "warning",
    category: "reports",
  },
  {
    id: "cap-security",
    label: "Security and compliance",
    description: "Tenant controls, role scope, consent, export, and operational safeguards.",
    href: "settings",
    roles: ["admin", "bursar"],
    status: "ok",
    category: "settings",
  },
];

const roleWidgetOrder: Record<DashboardRole, DashboardWidgetKey[]> = {
  admin: ["finance", "attendance", "academics"],
  bursar: ["finance", "attendance"],
  teacher: ["attendance", "academics"],
  parent: ["attendance", "finance", "academics"],
  storekeeper: ["inventory"],
  admissions: ["admissions", "students"],
};

export function isDashboardRole(value: string): value is DashboardRole {
  return DASHBOARD_ROLES.includes(value as DashboardRole);
}

export function getRoleSidebar(role: DashboardRole): SidebarItem[] {
  return sidebarItems.filter((item) => item.roles.includes(role));
}

export function getRoleQuickActions(role: DashboardRole) {
  return quickActionsCatalog.filter((item) => item.roles.includes(role));
}

export function getRoleWidgetOrder(role: DashboardRole) {
  return roleWidgetOrder[role];
}

export function getRoleCapabilities(role: DashboardRole) {
  return capabilityCatalog.filter((item) => item.roles.includes(role));
}

export function canRoleAccessModule(role: DashboardRole, moduleName: string) {
  const moduleItem = sidebarItems.find(
    (item) => item.id === moduleName || item.href === moduleName,
  );

  return Boolean(moduleItem && moduleItem.roles.includes(role));
}

export function doesModuleExist(moduleName: string) {
  return sidebarItems.some(
    (item) => item.id === moduleName || item.href === moduleName,
  );
}

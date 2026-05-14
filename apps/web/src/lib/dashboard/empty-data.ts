import { formatCurrency } from "./format";
import {
  type DashboardRole,
  type DashboardSnapshot,
  type KpiCard,
  type TenantOption,
} from "./types";
import { getRoleCapabilities, getRoleQuickActions } from "./role-config";
import { isProductionReadyHref } from "@/lib/features/module-readiness";

const roleNarratives: Record<DashboardRole, { title: string; description: string }> = {
  admin: {
    title: "School command center",
    description: "Live tenant operations will appear after the system owner onboards a real school.",
  },
  bursar: {
    title: "Collections and reconciliation desk",
    description: "Live finance activity will appear after real invoices and payments are created.",
  },
  teacher: {
    title: "Teaching day planner",
    description: "Class, timetable, and grading data will appear after staff onboarding.",
  },
  parent: {
    title: "Family school hub",
    description: "Student progress, balances, and school updates will appear after a real invitation is accepted.",
  },
  storekeeper: {
    title: "Inventory control desk",
    description: "Stock levels and supplier activity will appear after inventory records are created.",
  },
  librarian: {
    title: "Library operations desk",
    description: "Catalog, borrowing, returns, and fine activity will appear after library records are created.",
  },
  admissions: {
    title: "Admissions office",
    description: "Applications and registration activity will appear after real admissions work begins.",
  },
};

export function getTenantOptions(): TenantOption[] {
  return [];
}

function emptyTenant(tenantId: string): TenantOption {
  return {
    id: tenantId || "unconfigured",
    name: tenantId ? "Configured workspace" : "No school onboarded",
    county: tenantId ? "Tenant metadata pending" : "Awaiting system owner setup",
  };
}

function buildRoleKpis(role: DashboardRole): KpiCard[] {
  if (role === "librarian") {
    const cards: KpiCard[] = [
      {
        id: "library-catalog",
        label: "Catalog records",
        value: "0",
        helper: "No live library resources have been registered yet.",
        trendValue: "0",
        trendDirection: "up",
        href: "/dashboard/librarian/library",
        sparkline: [],
      },
      {
        id: "library-loans",
        label: "Active loans",
        value: "0",
        helper: "Borrowing activity will appear after the first live issue.",
        trendValue: "0",
        trendDirection: "up",
        href: "/dashboard/librarian/library",
        sparkline: [],
      },
      {
        id: "library-overdue",
        label: "Overdue items",
        value: "0",
        helper: "No live overdue records exist.",
        trendValue: "0",
        trendDirection: "up",
        href: "/dashboard/librarian/library",
        sparkline: [],
      },
    ];

    return cards.filter((card) => isProductionReadyHref(card.href));
  }

  const cards: KpiCard[] = [
    {
      id: `${role}-primary-volume`,
      label: "Live records",
      value: "0",
      helper: "No production records have been created for this workspace.",
      trendValue: "0%",
      trendDirection: "up",
      href: `/dashboard/${role}/students`,
      sparkline: [],
    },
    {
      id: `${role}-finance-volume`,
      label: "Financial activity",
      value: formatCurrency(0, false),
      helper: "Invoices, receipts, and ledger activity are empty after cleanup.",
      trendValue: "0%",
      trendDirection: "up",
      href: `/dashboard/${role}/finance`,
      sparkline: [],
      masked: role === "parent",
    },
    {
      id: `${role}-attention`,
      label: "Items needing attention",
      value: "0",
      helper: "No real alerts are open.",
      trendValue: "0",
      trendDirection: "up",
      href: `/dashboard/${role}`,
      sparkline: [],
    },
  ];

  return cards.filter((card) => isProductionReadyHref(card.href));
}

export function buildDashboardSnapshot(
  role: DashboardRole,
  tenantId: string,
  online: boolean,
): DashboardSnapshot {
  const narrative = roleNarratives[role];

  return {
    tenant: emptyTenant(tenantId),
    role,
    pageTitle: narrative.title,
    pageDescription: narrative.description,
    alerts: [],
    kpis: buildRoleKpis(role),
    finance: {
      collectionsToday: formatCurrency(0, false),
      outstandingInvoices: formatCurrency(0, false),
      failedPayments: "0",
      trendLabel: "No live finance data yet",
      collectionMix: [],
    },
    academics: {
      nextExam: "Not scheduled",
      gradingQueue: "0",
      performanceTrend: "No live academic data yet",
      subjects: [],
    },
    contextSections: [],
    activityFeed: [],
    quickActions: getRoleQuickActions(role),
    notifications: [],
    capabilities: getRoleCapabilities(role),
    sync: {
      state: online ? "synced" : "pending",
      label: online ? "No pending offline work" : "Offline",
      pendingCount: 0,
      failedCount: 0,
      lastSyncedAt: "No live sync activity",
    },
  };
}

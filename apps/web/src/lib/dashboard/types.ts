export const DASHBOARD_ROLES = [
  "admin",
  "bursar",
  "teacher",
  "parent",
  "storekeeper",
  "admissions",
] as const;

export type DashboardRole = (typeof DASHBOARD_ROLES)[number];

export type StatusTone = "critical" | "warning" | "ok";
export type SyncState = "synced" | "pending" | "failed";

export interface TenantOption {
  id: string;
  name: string;
  county: string;
  transportEnabled?: boolean;
}

export interface SidebarItem {
  id: string;
  label: string;
  href: string;
  roles: DashboardRole[];
}

export type DashboardWidgetKey =
  | "finance"
  | "academics"
  | "students"
  | "inventory"
  | "admissions";

export interface NotificationItem {
  id: string;
  title: string;
  timeLabel: string;
  severity: StatusTone;
  href: string;
}

export interface AlertItem {
  id: string;
  title: string;
  description: string;
  severity: StatusTone;
  href: string;
  actionLabel: string;
  metricLabel: string;
  metricValue: string;
}

export interface KpiCard {
  id: string;
  label: string;
  value: string;
  helper: string;
  trendValue: string;
  trendDirection: "up" | "down";
  href: string;
  sparkline: number[];
  masked?: boolean;
}

export interface FinanceWidgetData {
  collectionsToday: string;
  outstandingInvoices: string;
  failedPayments: string;
  trendLabel: string;
  collectionMix: Array<{ label: string; value: number }>;
}

export interface AcademicsWidgetData {
  nextExam: string;
  gradingQueue: string;
  performanceTrend: string;
  subjects: Array<{ subject: string; value: number }>;
}

export interface ContextChartPoint {
  label: string;
  value: number;
}

export interface ContextSection {
  id: string;
  title: string;
  description: string;
  points: ContextChartPoint[];
  footer: string;
}

export interface ActivityItem {
  id: string;
  title: string;
  detail: string;
  actor: string;
  href: string;
  timeLabel: string;
  category: "payment" | "student" | "communication";
}

export interface QuickActionItem {
  id: string;
  label: string;
  description: string;
  href: string;
  roles: DashboardRole[];
  offlineAllowed: boolean;
  sensitive?: boolean;
}

export interface CapabilityItem {
  id: string;
  label: string;
  description: string;
  href: string;
  roles: DashboardRole[];
  status: StatusTone;
  category:
    | "students"
    | "academics"
    | "finance"
    | "inventory"
    | "admissions"
    | "communication"
    | "staff"
    | "reports"
    | "settings";
}

export interface SyncIndicator {
  state: SyncState;
  label: string;
  pendingCount: number;
  failedCount: number;
  lastSyncedAt: string;
}

export interface DashboardSnapshot {
  tenant: TenantOption;
  role: DashboardRole;
  pageTitle: string;
  pageDescription: string;
  alerts: AlertItem[];
  kpis: KpiCard[];
  finance: FinanceWidgetData;
  academics: AcademicsWidgetData;
  contextSections: ContextSection[];
  activityFeed: ActivityItem[];
  quickActions: QuickActionItem[];
  notifications: NotificationItem[];
  capabilities: CapabilityItem[];
  sync: SyncIndicator;
}

export interface ModuleMetric {
  id: string;
  label: string;
  value: string;
  helper: string;
  tone?: StatusTone;
}

export interface ModuleTask {
  id: string;
  title: string;
  detail: string;
  status: "todo" | "in-progress" | "blocked" | "done";
}

export interface ModuleActionLink {
  id: string;
  label: string;
  href: string;
  tone?: "accent" | "neutral";
}

export interface ModuleInsight {
  id: string;
  title: string;
  description: string;
  value: string;
}

export interface ModuleSection {
  id: string;
  title: string;
  description: string;
  metrics: ModuleMetric[];
  tasks: ModuleTask[];
  actions: ModuleActionLink[];
  insights: ModuleInsight[];
}

export interface ModuleWorkspace {
  title: string;
  description: string;
  badge: string;
  sections: ModuleSection[];
}

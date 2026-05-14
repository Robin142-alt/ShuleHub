"use client";

import type { ComponentType } from "react";

import { DashboardHome } from "@/components/dashboard/erp-pages";
import type {
  AcademicsWidgetData,
  DashboardWidgetKey,
  DashboardRole,
  DashboardSnapshot,
  FinanceWidgetData,
} from "@/lib/dashboard/types";

type FinanceWidgetComponent = ComponentType<{
  data: FinanceWidgetData;
  href: string;
  online: boolean;
  actionLabel: string;
}>;

type AcademicsWidgetComponent = ComponentType<{
  data: AcademicsWidgetData;
  href: string;
}>;

export function DashboardView({
  role,
  snapshot,
  online,
  onAction,
}: {
  role: DashboardRole;
  snapshot: DashboardSnapshot;
  online: boolean;
  widgetOrder: DashboardWidgetKey[];
  onAction: (action: DashboardSnapshot["quickActions"][number]) => void;
  FinanceWidgetComponent: FinanceWidgetComponent;
  AcademicsWidgetComponent: AcademicsWidgetComponent;
}) {
  return (
    <DashboardHome
      role={role}
      snapshot={snapshot}
      online={online}
      onAction={onAction}
    />
  );
}

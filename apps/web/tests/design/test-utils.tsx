import { render } from "@testing-library/react";
import type { ReactElement } from "react";

import { DashboardView } from "@/components/dashboard/dashboard-view";
import { Topbar } from "@/components/dashboard/topbar";
import { AcademicsWidget } from "@/components/dashboard/academics-widget";
import { FinanceWidget } from "@/components/dashboard/finance-widget";
import { AppProviders } from "@/components/providers/app-providers";
import { buildSchoolErpModel } from "@/lib/dashboard/erp-model";
import { buildDashboardSnapshot } from "@/lib/dashboard/empty-data";
import { getRoleWidgetOrder } from "@/lib/dashboard/role-config";
import type { DashboardRole, DashboardSnapshot } from "@/lib/dashboard/types";
import { buildAdmissionsSearchItems } from "@/lib/modules/admissions-data";

function Providers({ children }: { children: React.ReactNode }) {
  return <AppProviders>{children}</AppProviders>;
}

export function renderWithProviders(ui: ReactElement) {
  return render(ui, {
    wrapper: Providers,
  });
}

function mergeSnapshot(
  snapshot: DashboardSnapshot,
  override?: Partial<DashboardSnapshot>,
): DashboardSnapshot {
  if (!override) {
    return snapshot;
  }

  return {
    ...snapshot,
    ...override,
  };
}

export function createDashboardSnapshot(
  role: DashboardRole,
  online = true,
  override?: Partial<DashboardSnapshot>,
) {
  return mergeSnapshot(
    buildDashboardSnapshot(role, "amani-prep", online),
    override,
  );
}

export function renderDashboardScreen(options?: {
  role?: DashboardRole;
  online?: boolean;
  snapshotOverride?: Partial<DashboardSnapshot>;
  onAction?: jest.Mock;
}) {
  const role = options?.role ?? "admin";
  const online = options?.online ?? true;
  const snapshot = createDashboardSnapshot(
    role,
    online,
    options?.snapshotOverride,
  );
  const schoolModel = buildSchoolErpModel({
    role,
    tenant: snapshot.tenant,
    online,
  });
  const onAction = options?.onAction ?? jest.fn();

  const result = renderWithProviders(
    <div className="space-y-6">
      <Topbar
        role={role}
        tenantId={snapshot.tenant.id}
        tenants={[snapshot.tenant]}
        notifications={snapshot.notifications}
        alerts={snapshot.alerts}
        quickActions={snapshot.quickActions}
        capabilities={snapshot.capabilities}
        sync={snapshot.sync}
        online={online}
        pageTitle={snapshot.pageTitle}
        pageDescription={snapshot.pageDescription}
        tenantName={snapshot.tenant.name}
        tenantCounty={snapshot.tenant.county}
        onTenantChange={jest.fn()}
        currentTerm={schoolModel.currentTerm}
        academicYear={schoolModel.academicYear}
        termOptions={schoolModel.termOptions}
        yearOptions={schoolModel.yearOptions}
        liveApiConfigured={false}
        liveUser={null}
        liveSessionLoading={false}
        liveSessionSubmitting={false}
        liveSessionError={null}
        onLiveLogin={jest.fn().mockResolvedValue(undefined)}
        onLiveLogout={jest.fn()}
        onOpenSidebar={jest.fn()}
        supplementalSearchItems={buildAdmissionsSearchItems(role)}
      />
      <DashboardView
        role={role}
        snapshot={snapshot}
        online={online}
        widgetOrder={getRoleWidgetOrder(role)}
        onAction={onAction}
        FinanceWidgetComponent={FinanceWidget}
        AcademicsWidgetComponent={AcademicsWidget}
      />
    </div>,
  );

  return {
    ...result,
    role,
    snapshot,
    onAction,
  };
}

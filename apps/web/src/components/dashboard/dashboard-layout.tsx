"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { AcademicsWidget } from "@/components/dashboard/academics-widget";
import { AttendanceWidget } from "@/components/dashboard/attendance-widget";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { FinanceWidget } from "@/components/dashboard/finance-widget";
import { ModuleView } from "@/components/dashboard/module-view";
import { SkeletonCard } from "@/components/ui/skeleton-card";
import { useDashboardState } from "@/hooks/use-dashboard-state";
import { useLiveTenantSession } from "@/hooks/use-live-tenant-session";
import { buildSchoolErpModel } from "@/lib/dashboard/erp-model";
import { getRoleWidgetOrder } from "@/lib/dashboard/role-config";
import type { DashboardRole } from "@/lib/dashboard/types";
import { buildAdmissionsSearchItems } from "@/lib/modules/admissions-data";
import {
  fetchAdmissionsStudentSearchLive,
  mapAdmissionsSearchItemsFromLive,
} from "@/lib/modules/admissions-live";

export function DashboardLayout({
  role,
  moduleName = "dashboard",
  studentId,
}: {
  role: DashboardRole;
  moduleName?: string;
  studentId?: string;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const {
    online,
    tenantId,
    setTenantId,
    tenantOptionsQuery,
    dashboardQuery,
    actionMutation,
  } = useDashboardState(role);

  const snapshot = dashboardQuery.data;
  const tenants = tenantOptionsQuery.data ?? [];
  const loading = tenantOptionsQuery.isLoading || dashboardQuery.isLoading || !snapshot;
  const widgetOrder = getRoleWidgetOrder(role);
  const schoolModel = snapshot
    ? buildSchoolErpModel({ role, tenant: snapshot.tenant, online })
    : null;
  const liveSession = useLiveTenantSession(tenantId);
  const liveStudentSearchQuery = useQuery({
    queryKey: ["dashboard-admissions-search", liveSession.session?.tenantId, role],
    queryFn: async () =>
      mapAdmissionsSearchItemsFromLive(
        role,
        await fetchAdmissionsStudentSearchLive(liveSession.session!),
      ),
    enabled: Boolean(liveSession.session && role !== "storekeeper"),
    retry: false,
    staleTime: 60_000,
    placeholderData: (previous) => previous,
  });
  const supplementalSearchItems =
    liveStudentSearchQuery.data ?? buildAdmissionsSearchItems(role);

  return (
    <main className="min-h-screen bg-background">
      {/* Desktop sidebar — fixed position */}
      <Sidebar
        role={role}
        mobileOpen={sidebarOpen}
        onMobileClose={() => setSidebarOpen(false)}
      />

      {/* Main content area — offset by sidebar on desktop */}
      <div className="md:pl-[var(--sidebar-width)]">
        {/* Content container with proper max-width */}
        <div className="mx-auto max-w-[var(--content-max-width)] px-4 py-4 md:px-6 md:py-5 lg:px-8">
          {/* Topbar */}
          <div className="mb-5">
            {snapshot ? (
              <Topbar
                role={role}
                tenantId={tenantId}
                tenants={tenants}
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
                onTenantChange={setTenantId}
                currentTerm={schoolModel?.currentTerm ?? "Term 2"}
                academicYear={schoolModel?.academicYear ?? "2026"}
                termOptions={schoolModel?.termOptions ?? []}
                yearOptions={schoolModel?.yearOptions ?? []}
                liveApiConfigured={liveSession.apiConfigured}
                liveUser={liveSession.user}
                liveSessionLoading={liveSession.isLoading}
                liveSessionSubmitting={liveSession.isSubmitting}
                liveSessionError={liveSession.error}
                onLiveLogin={liveSession.login}
                onLiveLogout={liveSession.logout}
                onOpenSidebar={() => setSidebarOpen(true)}
                supplementalSearchItems={supplementalSearchItems}
              />
            ) : (
              <SkeletonCard className="h-14" />
            )}
          </div>

          {/* Page content with entrance animation */}
          <div className="page-enter">
            {moduleName === "dashboard" && snapshot ? (
              <DashboardView
                role={role}
                snapshot={snapshot}
                online={online}
                widgetOrder={widgetOrder}
                onAction={(action) => actionMutation.mutate(action)}
                FinanceWidgetComponent={FinanceWidget}
                AttendanceWidgetComponent={AttendanceWidget}
                AcademicsWidgetComponent={AcademicsWidget}
              />
            ) : loading ? (
              <div className="space-y-5">
                <SkeletonCard className="h-14" />
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <SkeletonCard key={index} className="h-28" />
                  ))}
                </div>
                <SkeletonCard className="h-[360px]" />
              </div>
            ) : (
              <ModuleView
                role={role}
                moduleName={moduleName}
                snapshot={snapshot}
                online={online}
                studentId={studentId}
              />
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

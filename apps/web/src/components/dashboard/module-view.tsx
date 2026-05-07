"use client";

import {
  ModuleScreen,
  StudentProfilePage,
} from "@/components/dashboard/erp-pages";
import type { DashboardRole, DashboardSnapshot } from "@/lib/dashboard/types";

export function ModuleView({
  role,
  moduleName,
  snapshot,
  online,
  studentId,
}: {
  role: DashboardRole;
  moduleName: string;
  snapshot: DashboardSnapshot;
  online: boolean;
  studentId?: string;
}) {
  if (moduleName === "students" && studentId) {
    return (
      <StudentProfilePage
        role={role}
        snapshot={snapshot}
        online={online}
        studentId={studentId}
      />
    );
  }

  return (
    <ModuleScreen
      role={role}
      moduleName={moduleName}
      snapshot={snapshot}
      online={online}
    />
  );
}

import {
  canRoleAccessModule,
  doesModuleExist,
  getRoleCapabilities,
  getRoleQuickActions,
  getRoleSidebar,
} from "@/lib/dashboard/role-config";
import { buildSchoolErpModel } from "@/lib/dashboard/erp-model";
import { getSchoolWorkspace, type SchoolExperienceRole } from "@/lib/experiences/school-data";
import { isProductionReadyHref, isProductionReadyModule } from "@/lib/features/module-readiness";

const incompleteModules = new Set([
  "academics",
  "attendance",
  "communication",
  "reports",
  "staff",
  "timetable",
]);

const dashboardRoles = ["admin", "teacher", "parent", "bursar", "storekeeper", "admissions"] as const;
const schoolRoles: SchoolExperienceRole[] = ["principal", "bursar", "teacher", "admin", "storekeeper", "admissions"];

function moduleFromDashboardHref(href: string) {
  const segments = href.split(/[?#]/)[0].split("/").filter(Boolean);

  if (segments[0] !== "dashboard") {
    return segments[0] ?? "dashboard";
  }

  return segments.length > 2 ? segments[2] : "dashboard";
}

describe("production module readiness", () => {
  it("hides incomplete modules from role sidebar navigation", () => {
    for (const role of dashboardRoles) {
      const sidebarIds = getRoleSidebar(role).map((item) => item.id);
      expect(sidebarIds.filter((id) => incompleteModules.has(id))).toEqual([]);
    }
  });

  it("hides incomplete modules from school workspace navigation", () => {
    for (const role of schoolRoles) {
      const workspaceIds = getSchoolWorkspace(role).navItems.map((item) => item.id);
      expect(workspaceIds.filter((id) => incompleteModules.has(id))).toEqual([]);
    }
  });

  it("removes quick actions and capabilities that point to inactive workflows", () => {
    for (const role of dashboardRoles) {
      const actionModules = getRoleQuickActions(role).map((action) => action.href);
      const capabilityCategories = getRoleCapabilities(role).map((capability) => capability.category);

      expect(actionModules.filter((module) => incompleteModules.has(module))).toEqual([]);
      expect(capabilityCategories.filter((category) => incompleteModules.has(category))).toEqual([]);
    }
  });

  it("prevents direct access checks from treating incomplete modules as available", () => {
    expect(doesModuleExist("communication")).toBe(false);
    expect(doesModuleExist("reports")).toBe(false);
    expect(canRoleAccessModule("teacher", "academics")).toBe(false);
    expect(canRoleAccessModule("admin", "attendance")).toBe(false);
  });

  it("keeps the implemented exams module available while attendance stays retired", () => {
    expect(isProductionReadyModule("exams")).toBe(true);
    expect(isProductionReadyHref("/school/teacher/exams")).toBe(true);
    expect(isProductionReadyModule("attendance")).toBe(false);

    expect(getSchoolWorkspace("principal").navItems.map((item) => item.id)).toContain("exams");
    expect(getSchoolWorkspace("teacher").navItems.map((item) => item.id)).toContain("exams");
  });

  it("does not generate dashboard KPI links into inactive workflows", () => {
    for (const role of dashboardRoles) {
      const model = buildSchoolErpModel({
        role,
        tenant: { id: "tenant-1", name: "Configured workspace", county: "Nairobi" },
        online: true,
      });
      const kpiModules = model.dashboard.kpis.map((kpi) => moduleFromDashboardHref(kpi.href));

      expect(kpiModules.filter((module) => incompleteModules.has(module))).toEqual([]);
    }
  });
});

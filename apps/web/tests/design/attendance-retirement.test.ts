import { getPortalWorkspace } from "@/lib/experiences/portal-data";
import { getSchoolWorkspace } from "@/lib/experiences/school-data";
import { PORTAL_SECTIONS, SCHOOL_SECTIONS } from "@/lib/routing/experience-routes";
import { canRoleAccessModule, getRoleSidebar } from "@/lib/dashboard/role-config";
import { createAdmissionsDataset } from "@/lib/modules/admissions-data";
import { mapAdmissionsStudentProfileFromLive } from "@/lib/modules/admissions-live";

describe("attendance retirement", () => {
  test("removes attendance from school and portal route catalogs", () => {
    expect(SCHOOL_SECTIONS).not.toContain("attendance");
    expect(PORTAL_SECTIONS).not.toContain("attendance");
  });

  test("removes attendance navigation for every school and portal role", () => {
    for (const role of ["principal", "bursar", "teacher", "admin", "storekeeper", "admissions"] as const) {
      const navIds = getSchoolWorkspace(role).navItems.map((item) => item.id);
      expect(navIds).not.toContain("attendance");
    }

    for (const viewer of ["parent", "student"] as const) {
      const workspace = getPortalWorkspace(viewer);
      expect(workspace.navItems.map((item) => item.id)).not.toContain("attendance");
      expect(workspace.metrics.map((metric) => metric.id)).not.toContain("attendance");
    }
  });

  test("removes attendance from legacy dashboard access helpers", () => {
    expect(getRoleSidebar("teacher").map((item) => item.id)).not.toContain("attendance");
    expect(getRoleSidebar("parent").map((item) => item.id)).not.toContain("attendance");
    expect(canRoleAccessModule("teacher", "attendance")).toBe(false);
    expect(canRoleAccessModule("parent", "attendance")).toBe(false);
  });

  test("removes attendance from admissions profile contracts", () => {
    const dataset = createAdmissionsDataset();
    expect("attendance" in dataset).toBe(false);

    const profile = mapAdmissionsStudentProfileFromLive({
      student: {
        id: "student-1",
        admission_number: "ADM-001",
        first_name: "Retired",
        last_name: "Surface",
        metadata: null,
      },
      allocation: undefined,
      documents: [],
    });

    expect("attendance" in profile).toBe(false);
  });
});

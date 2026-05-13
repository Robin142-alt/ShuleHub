import { getRoleHomePath } from "@/lib/auth/role-routing";

describe("SaaS identity role routing", () => {
  test("routes users directly to the required role dashboard", () => {
    expect(getRoleHomePath("superadmin")).toBe("/superadmin/dashboard");
    expect(getRoleHomePath("platform_owner")).toBe("/superadmin/dashboard");
    expect(getRoleHomePath("principal")).toBe("/dashboard");
    expect(getRoleHomePath("bursar")).toBe("/finance/dashboard");
    expect(getRoleHomePath("teacher")).toBe("/academics/dashboard");
    expect(getRoleHomePath("storekeeper")).toBe("/inventory/dashboard");
    expect(getRoleHomePath("librarian")).toBe("/library/dashboard");
    expect(getRoleHomePath("parent")).toBe("/portal/dashboard");
  });
});

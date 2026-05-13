import { createServerAuthClient } from "@/lib/auth/server-auth-client";
import { schoolDemoCredentials, superadminDemoCredentials, portalDemoCredentials } from "@/lib/auth/demo-credentials";

function buildRequest(host: string) {
  return {
    headers: {
      get(name: string) {
        return name.toLowerCase() === "host" ? host : null;
      },
    },
  } as unknown as Request;
}

describe("server auth client redirect targets", () => {
  const originalApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  const originalApiBaseDomain = process.env.NEXT_PUBLIC_API_BASE_DOMAIN;

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
    delete process.env.NEXT_PUBLIC_API_BASE_DOMAIN;
  });

  afterAll(() => {
    if (originalApiBaseUrl === undefined) {
      delete process.env.NEXT_PUBLIC_API_BASE_URL;
    } else {
      process.env.NEXT_PUBLIC_API_BASE_URL = originalApiBaseUrl;
    }

    if (originalApiBaseDomain === undefined) {
      delete process.env.NEXT_PUBLIC_API_BASE_DOMAIN;
    } else {
      process.env.NEXT_PUBLIC_API_BASE_DOMAIN = originalApiBaseDomain;
    }
  });

  it("routes superadmin logins to the platform dashboard", async () => {
    const client = createServerAuthClient(buildRequest("shule-hub-erp.vercel.app"));

    const session = await client.login({
      audience: "superadmin",
      identifier: superadminDemoCredentials.email,
      password: superadminDemoCredentials.password,
      verificationCode: superadminDemoCredentials.verificationCode,
    });

    expect(session.homePath).toBe("/superadmin/dashboard");
    expect(session.redirectTo).toBe("/superadmin/dashboard");
  });

  it("routes school logins to the required role dashboard", async () => {
    const client = createServerAuthClient(buildRequest("shule-hub-erp.vercel.app"));

    const session = await client.login({
      audience: "school",
      identifier: schoolDemoCredentials.bursar.identifier,
      password: schoolDemoCredentials.bursar.password,
      tenantSlug: "barakaacademy",
    });

    expect(session.homePath).toBe("/finance/dashboard");
    expect(session.redirectTo).toBe("/finance/dashboard");
  });

  it("routes documented storekeeper and admissions credentials to their workspaces", async () => {
    const client = createServerAuthClient(buildRequest("shule-hub-erp.vercel.app"));

    const storekeeperSession = await client.login({
      audience: "school",
      identifier: schoolDemoCredentials.storekeeper.identifier,
      password: schoolDemoCredentials.storekeeper.password,
      tenantSlug: "amani-prep",
    });
    const admissionsSession = await client.login({
      audience: "school",
      identifier: schoolDemoCredentials.admissions.identifier,
      password: schoolDemoCredentials.admissions.password,
      tenantSlug: "barakaacademy",
    });

    expect(storekeeperSession.homePath).toBe("/inventory/dashboard");
    expect(storekeeperSession.role).toBe("storekeeper");
    expect(admissionsSession.homePath).toBe("/dashboard");
    expect(admissionsSession.role).toBe("admissions");
  });

  it("routes seeded storekeeper accounts to the dedicated inventory workspace", async () => {
    const client = createServerAuthClient(buildRequest("shule-hub-erp.vercel.app"));

    const session = await client.login({
      audience: "school",
      identifier: "storekeeper@amani-prep.demo.shulehub.ke",
      password: "Demo@12345",
      tenantSlug: "amani-prep",
    });

    expect(session.homePath).toBe("/inventory/dashboard");
    expect(session.redirectTo).toBe("/inventory/dashboard");
    expect(session.role).toBe("storekeeper");
    expect(session.tenantSlug).toBe("amani-prep");
    expect(session.user.display_name).toBe("Storekeeper Amani Prep");
    expect(session.user.permissions).toEqual([
      "inventory.view",
      "inventory.issue",
      "inventory.receive",
      "inventory.adjust",
      "inventory.transfer",
      "inventory.reports",
    ]);
  });

  it("keeps seeded school staff accounts scoped to their tenant code", async () => {
    const client = createServerAuthClient(buildRequest("shule-hub-erp.vercel.app"));

    await expect(
      client.login({
        audience: "school",
        identifier: "admissions@amani-prep.demo.shulehub.ke",
        password: "Demo@12345",
        tenantSlug: "baraka-academy",
      }),
    ).rejects.toThrow("Use one of the listed staff review accounts");
  });

  it("routes portal logins to the portal dashboard", async () => {
    const client = createServerAuthClient(buildRequest("shule-hub-erp.vercel.app"));

    const session = await client.login({
      audience: "portal",
      identifier: portalDemoCredentials.student.identifier,
      password: portalDemoCredentials.student.password,
    });

    expect(session.homePath).toBe("/portal/dashboard");
    expect(session.redirectTo).toBe("/portal/dashboard");
  });
});

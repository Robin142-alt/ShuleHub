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

  it("routes superadmin logins to the superadmin compatibility home", async () => {
    const client = createServerAuthClient(buildRequest("shule-hub-erp.vercel.app"));

    const session = await client.login({
      audience: "superadmin",
      identifier: superadminDemoCredentials.email,
      password: superadminDemoCredentials.password,
      verificationCode: superadminDemoCredentials.verificationCode,
    });

    expect(session.homePath).toBe("/superadmin");
    expect(session.redirectTo).toBe("/superadmin");
  });

  it("routes school logins to the role-specific school compatibility home", async () => {
    const client = createServerAuthClient(buildRequest("shule-hub-erp.vercel.app"));

    const session = await client.login({
      audience: "school",
      identifier: schoolDemoCredentials.bursar.identifier,
      password: schoolDemoCredentials.bursar.password,
      tenantSlug: "barakaacademy",
    });

    expect(session.homePath).toBe("/school/bursar");
    expect(session.redirectTo).toBe("/school/bursar");
  });

  it("accepts seeded school staff accounts when live auth is unavailable", async () => {
    const client = createServerAuthClient(buildRequest("shule-hub-erp.vercel.app"));

    const session = await client.login({
      audience: "school",
      identifier: "storekeeper@amani-prep.demo.shulehub.ke",
      password: "Demo@12345",
      tenantSlug: "amani-prep",
    });

    expect(session.homePath).toBe("/school/storekeeper");
    expect(session.redirectTo).toBe("/school/storekeeper");
    expect(session.role).toBe("storekeeper");
    expect(session.tenantSlug).toBe("amani-prep");
    expect(session.user.display_name).toBe("Storekeeper Amani Prep");
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

  it("routes portal logins to the viewer-specific portal compatibility home", async () => {
    const client = createServerAuthClient(buildRequest("shule-hub-erp.vercel.app"));

    const session = await client.login({
      audience: "portal",
      identifier: portalDemoCredentials.student.identifier,
      password: portalDemoCredentials.student.password,
    });

    expect(session.homePath).toBe("/portal/student");
    expect(session.redirectTo).toBe("/portal/student");
  });
});

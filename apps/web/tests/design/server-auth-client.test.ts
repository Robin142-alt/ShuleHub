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

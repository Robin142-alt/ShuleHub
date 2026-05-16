import { createServerAuthClient } from "@/lib/auth/server-auth-client";

function buildRequest(host: string) {
  return {
    headers: {
      get(name: string) {
        return name.toLowerCase() === "host" ? host : null;
      },
    },
  } as unknown as Request;
}

function jsonResponse(body: unknown, init?: ResponseInit) {
  return {
    status: init?.status ?? 200,
    ok: (init?.status ?? 200) >= 200 && (init?.status ?? 200) < 300,
    json: async () => body,
  } as Response;
}

describe("server auth client production gateway", () => {
  const originalApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  const originalApiBaseDomain = process.env.NEXT_PUBLIC_API_BASE_DOMAIN;

  beforeEach(() => {
    jest.restoreAllMocks();
    Object.assign(global, { fetch: jest.fn() });
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

  it("rejects sign-in when the live backend is unavailable", async () => {
    const client = createServerAuthClient(buildRequest("localhost:3000"));

    await expect(
      client.login({
        audience: "superadmin",
        identifier: "system.owner@example.invalid",
        password: "ManagedByPasswordVault!42",
      }),
    ).rejects.toThrow("Authentication service is temporarily unavailable.");
  });

  it("routes superadmin sign-in through the backend instead of local credentials", async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = "https://api.example.invalid";
    const fetchMock = jest.mocked(global.fetch).mockResolvedValue(
      jsonResponse({
        tokens: {
          access_token: "access-token",
          refresh_token: "refresh-token",
        },
        user: {
          user_id: "user-platform-owner",
          tenant_id: null,
          role: "platform_owner",
          audience: "superadmin",
          email: "system.owner@example.invalid",
          display_name: "System Owner",
          permissions: ["*:*"],
          session_id: "session-platform-owner",
        },
      }),
    );
    const client = createServerAuthClient(buildRequest("localhost:3000"));

    const session = await client.login({
      audience: "superadmin",
      identifier: "system.owner@example.invalid",
      password: "ManagedByPasswordVault!42",
      verificationCode: "provided-by-email",
    });

    expect(session.homePath).toBe("/superadmin");
    expect(session.redirectTo).toBe("/superadmin");
    expect(session.user.tenant_id).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.invalid/auth/login",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-auth-audience": "superadmin",
        }),
        body: JSON.stringify({
          email: "system.owner@example.invalid",
          password: "ManagedByPasswordVault!42",
          audience: "superadmin",
          verification_code: "provided-by-email",
        }),
      }),
    );
  });

  it("lets the backend resolve the school tenant during sign-in", async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = "https://api.example.invalid";
    const fetchMock = jest.mocked(global.fetch).mockResolvedValue(
      jsonResponse({
        tokens: {
          access_token: "access-token",
          refresh_token: "refresh-token",
        },
        user: {
          user_id: "user-school-admin",
          tenant_id: "school-alpha",
          role: "admin",
          audience: "school",
          email: "admin@example.invalid",
          display_name: "School Admin",
          permissions: ["students:read"],
          session_id: "session-school-admin",
        },
      }),
    );
    const client = createServerAuthClient(buildRequest("localhost:3000"));

    const session = await client.login({
      audience: "school",
      identifier: "admin@example.invalid",
      password: "ManagedByPasswordVault!42",
    });

    expect(session.tenantSlug).toBe("school-alpha");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.invalid/auth/login",
      expect.objectContaining({
        headers: expect.not.objectContaining({
          "x-tenant-id": expect.any(String),
        }),
      }),
    );
  });

  it("routes school staff to the backend tenant context and role home", async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = "https://api.example.invalid";
    const fetchMock = jest.mocked(global.fetch).mockResolvedValue(
      jsonResponse({
        tokens: {
          access_token: "access-token",
          refresh_token: "refresh-token",
        },
        user: {
          user_id: "user-school-admin",
          tenant_id: "school-alpha",
          role: "admin",
          audience: "school",
          email: "admin@example.invalid",
          display_name: "School Admin",
          permissions: ["students:read"],
          session_id: "session-school-admin",
        },
      }),
    );
    const client = createServerAuthClient(buildRequest("shule-hub-erp.vercel.app"));

    const session = await client.login({
      audience: "school",
      identifier: "admin@example.invalid",
      password: "ManagedByPasswordVault!42",
      tenantSlug: "school-alpha",
    });

    expect(session.homePath).toBe("/school/admin");
    expect(session.redirectTo).toBe("/school/admin");
    expect(session.tenantSlug).toBe("school-alpha");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.invalid/auth/login",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-auth-audience": "school",
          "x-tenant-id": "school-alpha",
        }),
      }),
    );
  });

  it("routes portal sign-in through the backend and keeps viewer-specific destinations", async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = "https://api.example.invalid";
    jest.mocked(global.fetch).mockResolvedValue(
      jsonResponse({
        tokens: {
          access_token: "access-token",
          refresh_token: "refresh-token",
        },
        user: {
          user_id: "user-student",
          tenant_id: "school-alpha",
          role: "student",
          audience: "portal",
          email: "student@example.invalid",
          display_name: "Student",
          permissions: ["portal:read"],
          session_id: "session-student",
        },
      }),
    );
    const client = createServerAuthClient(buildRequest("shule-hub-erp.vercel.app"));

    const session = await client.login({
      audience: "portal",
      identifier: "student@example.invalid",
      password: "ManagedByPasswordVault!42",
      tenantSlug: "school-alpha",
    });

    expect(session.homePath).toBe("/portal/student");
    expect(session.redirectTo).toBe("/portal/student");
  });
});

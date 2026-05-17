import fs from "node:fs";
import path from "node:path";

import { toPublicExperienceGatewaySession } from "@/lib/auth/server-session";
import type { ExperienceGatewaySession } from "@/lib/auth/server-session";

describe("auth token containment", () => {
  test("public auth session payloads never include bearer or refresh tokens", () => {
    const publicSession = toPublicExperienceGatewaySession({
      audience: "school",
      homePath: "/school/admin",
      redirectTo: "/school/admin",
      tenantSlug: "tenant-a",
      userLabel: "School Admin",
      accessToken: "access-token",
      refreshToken: "refresh-token",
      role: "admin",
      user: {
        user_id: "user-1",
        tenant_id: "tenant-a",
        role: "admin",
        email: "admin@example.test",
        display_name: "School Admin",
        permissions: ["students:read"],
        session_id: "session-1",
      },
    } satisfies ExperienceGatewaySession);

    expect(publicSession).not.toHaveProperty("accessToken");
    expect(publicSession).not.toHaveProperty("refreshToken");
    expect(JSON.stringify(publicSession)).not.toContain("access-token");
    expect(JSON.stringify(publicSession)).not.toContain("refresh-token");
  });

  test("browser-facing auth routes return sanitized sessions after setting HttpOnly cookies", () => {
    const authRoutes = [
      "src/app/api/auth/login/route.ts",
      "src/app/api/auth/refresh/route.ts",
      "src/app/api/auth/me/route.ts",
      "src/app/api/auth/parent/otp/verify/route.ts",
    ].map((filePath) => path.join(process.cwd(), filePath));

    for (const routePath of authRoutes) {
      const source = fs.readFileSync(routePath, "utf8");

      expect(source).toContain("toPublicExperienceGatewaySession");
      expect(source).not.toMatch(/session:\s*session\b/);
    }
  });

  test("legacy browser password routes enforce csrf and use modern recovery endpoints", () => {
    const legacyRoutes = [
      {
        filePath: "src/app/api/auth/password/forgot/route.ts",
        legacyBackendPath: "/auth/password/forgot",
        modernBackendPath: "/auth/password-recovery/request",
      },
      {
        filePath: "src/app/api/auth/password/reset/route.ts",
        legacyBackendPath: "/auth/password/reset",
        modernBackendPath: "/auth/password-recovery/reset",
      },
    ].map((route) => ({
      ...route,
      routePath: path.join(process.cwd(), route.filePath),
    }));

    for (const route of legacyRoutes) {
      const source = fs.readFileSync(route.routePath, "utf8");

      expect(source).toContain("validateCsrfRequest");
      expect(source).toContain(route.modernBackendPath);
      expect(source).not.toContain(route.legacyBackendPath);
    }
  });
});

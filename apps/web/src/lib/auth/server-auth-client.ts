import type { LiveAuthUser } from "@/lib/dashboard/api-client";
import { getDashboardApiBaseUrl } from "@/lib/dashboard/api-client";
import type { ExperienceAudience } from "@/lib/auth/experience-audience";
import {
  portalDemoCredentials,
  resolvePortalDemoCredential,
  resolveSchoolDemoCredential,
  schoolDemoCredentials,
  superadminDemoCredentials,
} from "@/lib/auth/demo-credentials";
import {
  readAccessCookie,
  readAudienceCookie,
  readExperienceSessionCookie,
  readRefreshCookie,
  readTenantCookie,
  type ExperienceGatewaySession,
} from "@/lib/auth/server-session";

type LoginInput = {
  audience: ExperienceAudience;
  identifier: string;
  password: string;
  verificationCode?: string;
  tenantSlug?: string | null;
};

type RefreshInput = {
  audience: ExperienceAudience;
  tenantSlug?: string | null;
};

type BackendAuthResponse = {
  tokens: {
    access_token: string;
    refresh_token: string;
  };
  user: LiveAuthUser;
};

type CookieReader = {
  get(name: string): { value: string } | undefined;
};

function inferTenantSlug(request: Request) {
  const host = request.headers.get("host")?.split(":")[0].trim().toLowerCase() ?? null;

  if (!host || host === "localhost" || host === "127.0.0.1") {
    return null;
  }

  const parts = host.split(".");
  return parts.length > 1 ? (parts[0] ?? null) : null;
}

function isEmailLike(value: string) {
  return /\S+@\S+\.\S+/.test(value.trim());
}

function unauthorized(message: string) {
  return new Error(message);
}

function buildDemoUser(input: {
  audience: ExperienceAudience;
  identifier: string;
  displayName: string;
  role: string;
  tenantSlug?: string | null;
}) {
  return {
    user_id: `demo-${input.audience}-${input.role}`,
    tenant_id: input.tenantSlug ?? "",
    role: input.role,
    email: isEmailLike(input.identifier) ? input.identifier : `${input.role}@demo.local`,
    display_name: input.displayName,
    permissions: [],
    session_id: `demo-session-${input.audience}-${input.role}`,
  } satisfies LiveAuthUser;
}

function buildExperienceHomePath(input: {
  audience: ExperienceAudience;
  role?: string;
  viewer?: string;
}) {
  if (input.audience === "superadmin") {
    return "/superadmin";
  }

  if (input.audience === "school") {
    return `/school/${input.role ?? "admin"}`;
  }

  return `/portal/${input.viewer ?? "parent"}`;
}

function buildGatewaySession(input: {
  audience: ExperienceAudience;
  userLabel: string;
  tenantSlug: string | null;
  role?: string;
  viewer?: string;
  accessToken?: string;
  refreshToken?: string;
  user: LiveAuthUser;
}) {
  const homePath = buildExperienceHomePath({
    audience: input.audience,
    role: input.role,
    viewer: input.viewer,
  });

  return {
    audience: input.audience,
    homePath,
    redirectTo: homePath,
    tenantSlug: input.tenantSlug,
    userLabel: input.userLabel,
    accessToken: input.accessToken ?? "",
    refreshToken: input.refreshToken ?? "",
    role: input.role,
    viewer: input.viewer,
    user: input.user,
  } satisfies ExperienceGatewaySession;
}

async function requestBackendAuth<T>(
  path: string,
  input: {
    tenantSlug: string;
    method: "GET" | "POST";
    accessToken?: string;
    body?: Record<string, unknown>;
  },
) {
  const baseUrl = getDashboardApiBaseUrl(input.tenantSlug);

  if (!baseUrl) {
    throw unauthorized("Live backend authentication is not configured.");
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: input.method,
    headers: {
      Accept: "application/json",
      ...(input.body ? { "Content-Type": "application/json" } : {}),
      ...(input.accessToken ? { Authorization: `Bearer ${input.accessToken}` } : {}),
    },
    body: input.body ? JSON.stringify(input.body) : undefined,
    cache: "no-store",
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw unauthorized(payload?.message ?? "Authentication request failed.");
  }

  return (await response.json()) as T;
}

async function loginSchoolAudience(input: LoginInput) {
  const tenantSlug = input.tenantSlug?.trim() || null;
  const matchedDemo = resolveSchoolDemoCredential(input.identifier, input.password);

  if (tenantSlug && isEmailLike(input.identifier)) {
    try {
      const response = await requestBackendAuth<BackendAuthResponse>("/auth/login", {
        tenantSlug,
        method: "POST",
        body: {
          email: input.identifier.trim(),
          password: input.password,
          audience: "school",
        },
      });

      return buildGatewaySession({
        audience: "school",
        userLabel: response.user.display_name || response.user.email,
        tenantSlug,
        role: response.user.role,
        accessToken: response.tokens.access_token,
        refreshToken: response.tokens.refresh_token,
        user: response.user,
      });
    } catch (error) {
      if (!matchedDemo) {
        throw error;
      }
    }
  }

  if (!matchedDemo) {
    throw unauthorized("Use one of the listed staff review accounts for this school workspace.");
  }

  return buildGatewaySession({
    audience: "school",
    userLabel: matchedDemo.identifier,
    tenantSlug: tenantSlug ?? "amani-prep",
    role: matchedDemo.role,
    user: buildDemoUser({
      audience: "school",
      identifier: matchedDemo.identifier,
      displayName:
        matchedDemo.role === "principal"
          ? "Principal"
          : matchedDemo.role === "bursar"
            ? "Bursar"
            : matchedDemo.role === "teacher"
              ? "Teacher"
              : "Admin staff",
      role: matchedDemo.role,
      tenantSlug: tenantSlug ?? "amani-prep",
    }),
  });
}

async function loginSuperadminAudience(input: LoginInput) {
  if (
    input.identifier.trim().toLowerCase() !== superadminDemoCredentials.email ||
    input.password !== superadminDemoCredentials.password
  ) {
    throw unauthorized("Use the listed platform owner review credentials to enter this secured workspace.");
  }

  if ((input.verificationCode ?? "").trim() !== superadminDemoCredentials.verificationCode) {
    throw unauthorized("Use the listed verification code to complete the protected sign-in.");
  }

  return buildGatewaySession({
    audience: "superadmin",
    userLabel: "Platform owner",
    tenantSlug: null,
    user: buildDemoUser({
      audience: "superadmin",
      identifier: superadminDemoCredentials.email,
      displayName: "Platform owner",
      role: "platform_owner",
    }),
  });
}

async function loginPortalAudience(input: LoginInput) {
  const matchedDemo = resolvePortalDemoCredential(input.identifier, input.password);

  if (!matchedDemo) {
    throw unauthorized("Use one of the listed portal review credentials to open the family workspace.");
  }

  return buildGatewaySession({
    audience: "portal",
    userLabel: matchedDemo.identifier,
    tenantSlug: null,
    viewer: matchedDemo.viewer,
    user: buildDemoUser({
      audience: "portal",
      identifier: matchedDemo.identifier,
      displayName: matchedDemo.viewer === "parent" ? "Parent" : "Student",
      role: matchedDemo.viewer,
    }),
  });
}

export function createServerAuthClient(request: Request) {
  const inferredTenantSlug = inferTenantSlug(request);

  return {
    async login(input: LoginInput) {
      const normalizedInput = {
        ...input,
        tenantSlug: input.tenantSlug ?? inferredTenantSlug,
      };

      switch (normalizedInput.audience) {
        case "superadmin":
          return loginSuperadminAudience(normalizedInput);
        case "school":
          return loginSchoolAudience(normalizedInput);
        case "portal":
          return loginPortalAudience(normalizedInput);
      }
    },

    async refresh(input: RefreshInput, cookies: CookieReader) {
      if (input.audience !== "school") {
        const session = readExperienceSessionCookie(cookies, input.audience);

        if (!session) {
          throw unauthorized("No active session found.");
        }

        return this.me(input.audience, cookies);
      }

      const tenantSlug = input.tenantSlug?.trim() || readTenantCookie(cookies);
      const refreshToken = readRefreshCookie(cookies);

      if (!tenantSlug || !refreshToken) {
        throw unauthorized("No refresh session found.");
      }

      const response = await requestBackendAuth<BackendAuthResponse>("/auth/refresh", {
        tenantSlug,
        method: "POST",
        body: {
          refresh_token: refreshToken,
        },
      });

      return buildGatewaySession({
        audience: "school",
        userLabel: response.user.display_name || response.user.email,
        tenantSlug,
        role: response.user.role,
        accessToken: response.tokens.access_token,
        refreshToken: response.tokens.refresh_token,
        user: response.user,
      });
    },

    async me(requestedAudience: ExperienceAudience, cookies: CookieReader) {
      const audience = readAudienceCookie(cookies) ?? requestedAudience;
      const session = readExperienceSessionCookie(cookies, requestedAudience);

      if (!session || audience !== requestedAudience) {
        throw unauthorized("No active session found.");
      }

      if (requestedAudience === "school") {
        if (session.experience !== "school") {
          throw unauthorized("No active session found.");
        }

        const tenantSlug = readTenantCookie(cookies) ?? session.tenantSlug;
        const accessToken = readAccessCookie(cookies);

        if (tenantSlug && accessToken) {
          try {
            const response = await requestBackendAuth<{ user: LiveAuthUser }>("/auth/me", {
              tenantSlug,
              method: "GET",
              accessToken,
            });

            return buildGatewaySession({
              audience: "school",
              userLabel: response.user.display_name || response.user.email,
              tenantSlug,
              role: response.user.role,
              accessToken,
              refreshToken: readRefreshCookie(cookies),
              user: response.user,
            });
          } catch {
            // fall through to demo/session-based user if backend hydration fails
          }
        }

        const demoRole = session.role ?? "admin";
        const demoIdentifier =
          demoRole === "principal"
            ? schoolDemoCredentials.principal.identifier
            : demoRole === "bursar"
              ? schoolDemoCredentials.bursar.identifier
              : demoRole === "teacher"
                ? schoolDemoCredentials.teacher.identifier
                : schoolDemoCredentials.admin.identifier;

        return buildGatewaySession({
          audience: "school",
          userLabel: session.userLabel,
          tenantSlug: session.tenantSlug,
          role: demoRole,
          accessToken: readAccessCookie(cookies),
          refreshToken: readRefreshCookie(cookies),
          user: buildDemoUser({
            audience: "school",
            identifier: demoIdentifier,
            displayName: session.userLabel,
            role: demoRole,
            tenantSlug: session.tenantSlug,
          }),
        });
      }

      if (requestedAudience === "superadmin") {
        if (session.experience !== "superadmin") {
          throw unauthorized("No active session found.");
        }

        return buildGatewaySession({
          audience: "superadmin",
          userLabel: session.userLabel,
          tenantSlug: null,
          accessToken: readAccessCookie(cookies),
          refreshToken: readRefreshCookie(cookies),
          user: buildDemoUser({
            audience: "superadmin",
            identifier: superadminDemoCredentials.email,
            displayName: session.userLabel,
            role: "platform_owner",
          }),
        });
      }

      if (session.experience !== "portal") {
        throw unauthorized("No active session found.");
      }

      return buildGatewaySession({
        audience: "portal",
        userLabel: session.userLabel,
        tenantSlug: null,
        viewer: session.viewer,
        accessToken: readAccessCookie(cookies),
        refreshToken: readRefreshCookie(cookies),
        user: buildDemoUser({
          audience: "portal",
          identifier:
            session.viewer === "student"
              ? portalDemoCredentials.student.identifier
              : portalDemoCredentials.parent.identifier,
          displayName: session.userLabel,
          role: session.viewer ?? "parent",
        }),
      });
    },
  };
}

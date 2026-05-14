import type { LiveAuthUser } from "@/lib/dashboard/api-client";
import { getDashboardApiBaseUrl } from "@/lib/dashboard/api-client";
import type { ExperienceAudience } from "@/lib/auth/experience-audience";
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

function unauthorized(message: string) {
  return new Error(message);
}

const AUTH_SERVICE_UNAVAILABLE =
  "Authentication service is temporarily unavailable. Please try again shortly.";

function buildExperienceHomePath(input: {
  audience: ExperienceAudience;
  role?: string;
  viewer?: string;
}) {
  if (input.audience === "superadmin") {
    return "/superadmin";
  }

  if (input.audience === "school") {
    if (input.role === "storekeeper") {
      return "/inventory/dashboard";
    }

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
    audience: ExperienceAudience;
    tenantSlug?: string | null;
    method: "GET" | "POST";
    accessToken?: string;
    body?: Record<string, unknown>;
  },
) {
  const tenantSlug = input.tenantSlug?.trim() || undefined;
  const baseUrl = getDashboardApiBaseUrl(tenantSlug);

  if (!baseUrl) {
    throw unauthorized(AUTH_SERVICE_UNAVAILABLE);
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: input.method,
    headers: {
      Accept: "application/json",
      "x-auth-audience": input.audience,
      ...(tenantSlug ? { "x-tenant-id": tenantSlug } : {}),
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

  if (!tenantSlug) {
    throw unauthorized("School workspace is required.");
  }

  const response = await requestBackendAuth<BackendAuthResponse>("/auth/login", {
    audience: "school",
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
}

async function loginSuperadminAudience(input: LoginInput) {
  const response = await requestBackendAuth<BackendAuthResponse>("/auth/login", {
    audience: "superadmin",
    tenantSlug: null,
    method: "POST",
    body: {
      email: input.identifier.trim(),
      password: input.password,
      audience: "superadmin",
      verification_code: input.verificationCode?.trim() || undefined,
    },
  });

  return buildGatewaySession({
    audience: "superadmin",
    userLabel: response.user.display_name || response.user.email,
    tenantSlug: null,
    role: response.user.role,
    accessToken: response.tokens.access_token,
    refreshToken: response.tokens.refresh_token,
    user: response.user,
  });
}

async function loginPortalAudience(input: LoginInput) {
  const tenantSlug = input.tenantSlug?.trim() || null;
  const response = await requestBackendAuth<BackendAuthResponse>("/auth/login", {
    audience: "portal",
    tenantSlug,
    method: "POST",
    body: {
      email: input.identifier.trim(),
      password: input.password,
      audience: "portal",
    },
  });

  return buildGatewaySession({
    audience: "portal",
    userLabel: response.user.display_name || response.user.email,
    tenantSlug,
    viewer: response.user.role === "student" ? "student" : "parent",
    role: response.user.role,
    accessToken: response.tokens.access_token,
    refreshToken: response.tokens.refresh_token,
    user: response.user,
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
      const tenantSlug = input.tenantSlug?.trim() || readTenantCookie(cookies);
      const refreshToken = readRefreshCookie(cookies);

      if (!refreshToken) {
        throw unauthorized("No refresh session found.");
      }

      if (input.audience === "school" && !tenantSlug) {
        throw unauthorized("No refresh session found.");
      }

      const response = await requestBackendAuth<BackendAuthResponse>("/auth/refresh", {
        audience: input.audience,
        tenantSlug,
        method: "POST",
        body: {
          refresh_token: refreshToken,
        },
      });

      return buildGatewaySession({
        audience: input.audience,
        userLabel: response.user.display_name || response.user.email,
        tenantSlug: response.user.tenant_id ?? tenantSlug ?? null,
        role: response.user.role,
        viewer: input.audience === "portal" ? (response.user.role === "student" ? "student" : "parent") : undefined,
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

      if (session.experience !== requestedAudience) {
        throw unauthorized("No active session found.");
      }

      const sessionTenantSlug = session.experience === "school" ? session.tenantSlug : null;
      const tenantSlug = readTenantCookie(cookies) ?? sessionTenantSlug;
      const accessToken = readAccessCookie(cookies);

      if (!accessToken) {
        throw unauthorized("No active session found.");
      }

      if (requestedAudience === "school" && !tenantSlug) {
        throw unauthorized("No active session found.");
      }

      const response = await requestBackendAuth<{ user: LiveAuthUser }>("/auth/me", {
        audience: requestedAudience,
        tenantSlug,
        method: "GET",
        accessToken,
      });

      return buildGatewaySession({
        audience: requestedAudience,
        userLabel: response.user.display_name || response.user.email,
        tenantSlug: response.user.tenant_id ?? tenantSlug ?? null,
        role: response.user.role,
        viewer: requestedAudience === "portal" ? (response.user.role === "student" ? "student" : "parent") : undefined,
        accessToken,
        refreshToken: readRefreshCookie(cookies),
        user: response.user,
      });
    },
  };
}

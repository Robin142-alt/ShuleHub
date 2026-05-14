type ApiEnvelope<T> = {
  data: T;
  meta: Record<string, unknown>;
};

export interface LiveAuthUser {
  user_id: string;
  tenant_id: string | null;
  role: string;
  email: string;
  display_name: string;
  email_verified?: boolean;
  email_verified_at?: string | null;
  permissions: string[];
  session_id: string;
}

export interface LiveAuthSession {
  tenantId: string;
  accessToken: string;
  refreshToken: string;
  user: LiveAuthUser;
}

interface AuthResponse {
  tokens: {
    access_token: string;
    refresh_token: string;
  };
  user: LiveAuthUser;
}

export interface ReadinessResponse {
  status: "ok" | "degraded";
  services: {
    postgres: string;
    redis: string;
    bullmq: string;
  };
  slo: {
    generated_at: string;
    overall_status: "healthy" | "degraded" | "critical" | "unknown";
    active_alert_count: number;
    subsystem_statuses: Array<{
      subsystem: "api" | "mpesa" | "sync" | "queue" | "database";
      status: "healthy" | "degraded" | "critical" | "unknown";
    }>;
  } | null;
}

export interface ObservabilityAlert {
  id: string;
  subsystem: "api" | "mpesa" | "sync" | "queue" | "database";
  severity: "warning" | "critical";
  title: string;
  message: string;
  triggered_at: string;
}

export interface ObservabilityAlertsResponse {
  alerts: ObservabilityAlert[];
}

export interface ObservabilityHealthResponse {
  generated_at: string;
  overall_status: "healthy" | "degraded" | "critical" | "unknown";
  active_alert_count: number;
  subsystem_statuses: Array<{
    subsystem: "api" | "mpesa" | "sync" | "queue" | "database";
    status: "healthy" | "degraded" | "critical" | "unknown";
  }>;
}

const API_TIMEOUT_MS = 4_500;

function buildTenantOrigin(tenantId: string, domain: string) {
  const trimmedDomain = domain.trim().replace(/\/$/, "");

  if (/^https?:\/\//i.test(trimmedDomain)) {
    const parsed = new URL(trimmedDomain);
    return `${parsed.protocol}//${tenantId}.${parsed.host}`;
  }

  const protocol = /localhost|127\.0\.0\.1/i.test(trimmedDomain) ? "http" : "https";
  return `${protocol}://${tenantId}.${trimmedDomain}`;
}

export function getDashboardApiBaseUrl(tenantId?: string) {
  const configuredBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ?? null;
  const configuredBaseDomain = process.env.NEXT_PUBLIC_API_BASE_DOMAIN?.trim().replace(/^\.+/, "").replace(/\/$/, "") ?? null;

  if (configuredBaseDomain && tenantId) {
    return buildTenantOrigin(tenantId, configuredBaseDomain);
  }

  return configuredBaseUrl;
}

export function isDashboardApiConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
      process.env.NEXT_PUBLIC_API_BASE_DOMAIN?.trim(),
  );
}

function isEnvelope<T>(value: unknown): value is ApiEnvelope<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    "data" in value &&
    "meta" in value
  );
}

export async function requestDashboardApi<T>(
  path: string,
  options?: {
    unwrapEnvelope?: boolean;
    method?: "GET" | "POST" | "PATCH";
    tenantId?: string;
    accessToken?: string | null;
    body?: BodyInit | Record<string, unknown> | null;
  },
): Promise<T> {
  const baseUrl = getDashboardApiBaseUrl(options?.tenantId);

  if (!baseUrl) {
    throw new Error("Dashboard API base URL is not configured.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  const isFormData =
    typeof FormData !== "undefined" && options?.body instanceof FormData;
  const hasJsonBody =
    options?.body !== null
    && options?.body !== undefined
    && !isFormData;
  const requestBody: BodyInit | undefined =
    options?.body === undefined || options?.body === null
      ? undefined
      : isFormData
        ? (options.body as FormData)
        : JSON.stringify(options.body);

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: options?.method ?? "GET",
      headers: {
        Accept: "application/json",
        ...(options?.tenantId ? { "x-tenant-id": options.tenantId } : {}),
        ...(hasJsonBody ? { "Content-Type": "application/json" } : {}),
        ...(options?.accessToken
          ? {
              Authorization: `Bearer ${options.accessToken}`,
              "x-auth-audience": "school",
            }
          : {}),
      },
      cache: "no-store",
      signal: controller.signal,
      ...(requestBody !== undefined ? { body: requestBody } : {}),
    });

    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`);
    }

    const json = (await response.json()) as T | ApiEnvelope<T>;

    if (options?.unwrapEnvelope === false) {
      return json as T;
    }

    return isEnvelope<T>(json) ? json.data : (json as T);
  } finally {
    clearTimeout(timeout);
  }
}

export async function loginToDashboardApi(input: {
  tenantId: string;
  email: string;
  password: string;
}): Promise<LiveAuthSession> {
  const response = await requestDashboardApi<AuthResponse>("/auth/login", {
    method: "POST",
    tenantId: input.tenantId,
    body: {
      email: input.email,
      password: input.password,
    },
  });

  return {
    tenantId: input.tenantId,
    accessToken: response.tokens.access_token,
    refreshToken: response.tokens.refresh_token,
    user: response.user,
  };
}

export async function fetchApiMe(session: LiveAuthSession) {
  const response = await requestDashboardApi<{ user: LiveAuthUser }>("/auth/me", {
    tenantId: session.tenantId,
    accessToken: session.accessToken,
    unwrapEnvelope: false,
  });

  return response.user;
}

export function fetchApiReadiness() {
  return requestDashboardApi<ReadinessResponse>("/health/ready", {
    unwrapEnvelope: false,
  });
}

export function fetchApiObservabilityHealth() {
  return requestDashboardApi<ObservabilityHealthResponse>("/observability/health");
}

export function fetchApiObservabilityAlerts() {
  return requestDashboardApi<ObservabilityAlertsResponse>("/observability/alerts");
}

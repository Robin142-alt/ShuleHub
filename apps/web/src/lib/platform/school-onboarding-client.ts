import { getCsrfToken } from "@/lib/auth/csrf-client";

export type PlatformSchool = {
  tenant_id: string;
  school_name: string;
  subdomain: string;
  status: "active" | "inactive";
  invitation_sent: boolean;
  admin_email: string;
  created_at: string;
};

type ApiEnvelope<T> = {
  data: T;
  meta?: Record<string, unknown>;
};

function isEnvelope<T>(value: unknown): value is ApiEnvelope<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    "data" in value
  );
}

async function parsePlatformResponse(response: Response) {
  const payload = (await response.json().catch(() => null)) as
    | { message?: string }
    | PlatformSchool
    | PlatformSchool[]
    | ApiEnvelope<PlatformSchool | PlatformSchool[]>
    | null;

  if (!response.ok) {
    throw new Error(
      payload && "message" in payload && payload.message
        ? payload.message
        : "Unable to complete this platform request.",
    );
  }

  return isEnvelope<PlatformSchool | PlatformSchool[]>(payload)
    ? payload.data
    : payload;
}

export async function fetchPlatformSchools() {
  const response = await fetch("/api/platform/schools", {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
  });
  const payload = await parsePlatformResponse(response);

  return Array.isArray(payload) ? payload : [];
}

export async function createPlatformSchool(input: {
  schoolName: string;
  tenantId: string;
  adminEmail: string;
  adminName: string;
  county?: string;
}) {
  const response = await fetch("/api/platform/schools", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-shulehub-csrf": await getCsrfToken(),
    },
    credentials: "same-origin",
    body: JSON.stringify({
      school_name: input.schoolName,
      tenant_id: input.tenantId,
      admin_email: input.adminEmail,
      admin_name: input.adminName,
      county: input.county,
    }),
  });
  const payload = await parsePlatformResponse(response);

  return payload as PlatformSchool;
}

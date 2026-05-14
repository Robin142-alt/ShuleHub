import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { validateCsrfRequest } from "@/lib/auth/csrf";
import { readAccessCookie, readAudienceCookie, readTenantCookie } from "@/lib/auth/server-session";
import { getDashboardApiBaseUrl } from "@/lib/dashboard/api-client";

type RouteContext = {
  params: Promise<{ membershipId: string }> | { membershipId: string };
};

const unavailableMessage =
  "Live tenant user management is not available for this session.";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, context: RouteContext) {
  if (!validateCsrfRequest(request)) {
    return NextResponse.json(
      { message: "Security check expired. Refresh the page and try again." },
      { status: 403 },
    );
  }

  const session = await getTenantUserSession();

  if (!session) {
    return NextResponse.json(
      { message: unavailableMessage },
      { status: 503 },
    );
  }

  const params = await context.params;
  const membershipId = encodeURIComponent(params.membershipId);
  const body = await request.json();
  const response = await fetch(`${session.baseUrl}/auth/tenant-users/${membershipId}/role`, {
    method: "PATCH",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.accessToken}`,
      "x-auth-audience": "school",
      "x-tenant-id": session.tenantSlug,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null);

  return NextResponse.json(payload ?? {}, { status: response.status });
}

async function getTenantUserSession() {
  const cookieStore = await cookies();
  const tenantSlug = readTenantCookie(cookieStore);
  const audience = readAudienceCookie(cookieStore);
  const accessToken = readAccessCookie(cookieStore);
  const baseUrl = tenantSlug ? getDashboardApiBaseUrl(tenantSlug) : null;

  if (!tenantSlug || !baseUrl || !accessToken || audience !== "school") {
    return null;
  }

  return { accessToken, baseUrl, tenantSlug };
}

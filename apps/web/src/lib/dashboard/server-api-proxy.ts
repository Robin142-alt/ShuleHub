import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { validateCsrfRequest } from "@/lib/auth/csrf";
import {
  readAccessCookie,
  readExperienceSessionCookie,
  readTenantCookie,
} from "@/lib/auth/server-session";
import { getDashboardApiBaseUrl } from "@/lib/dashboard/api-client";

type CatchAllContext = {
  params: Promise<{ path?: string[] }> | { path?: string[] };
};

export async function proxySchoolApiRequest(
  request: NextRequest,
  context: CatchAllContext,
  upstreamPrefix: string,
  options?: {
    requireSchoolSession?: boolean;
    audience?: "school" | "superadmin" | "portal";
  },
) {
  if (request.method !== "GET" && !validateCsrfRequest(request)) {
    return NextResponse.json(
      { message: "Security check expired. Refresh the page and try again." },
      { status: 403 },
    );
  }

  const cookieStore = await cookies();
  const audience = options?.audience ?? "school";
  const session = readExperienceSessionCookie(cookieStore, audience);
  const accessToken = readAccessCookie(cookieStore);

  if ((options?.requireSchoolSession ?? true) && (!session || !accessToken)) {
    return NextResponse.json(
      { message: "A signed-in session is required." },
      { status: 401 },
    );
  }

  const requestUrl = new URL(request.url);
  const sessionTenantSlug = session && "tenantSlug" in session ? session.tenantSlug : null;
  const tenantSlug = requestUrl.searchParams.get("tenantSlug") ?? readTenantCookie(cookieStore) ?? sessionTenantSlug ?? null;
  const baseUrl = getDashboardApiBaseUrl(tenantSlug ?? undefined);

  if (!baseUrl) {
    return NextResponse.json(
      { message: "Live API is unavailable for this request." },
      { status: 503 },
    );
  }

  const params = await context.params;
  const upstreamPath = `${upstreamPrefix}/${(params.path ?? []).join("/")}`.replace(/\/$/, "");
  const upstreamQuery = new URLSearchParams(requestUrl.searchParams);
  upstreamQuery.delete("tenantSlug");
  const query = upstreamQuery.toString();
  const body = request.method === "GET" ? undefined : await request.text();
  const upstreamResponse = await fetch(`${baseUrl}${upstreamPath}${query ? `?${query}` : ""}`, {
    method: request.method,
    headers: {
      Accept: "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
      "x-auth-audience": audience,
      ...(tenantSlug ? { "x-tenant-id": tenantSlug } : {}),
    },
    body: body && body.length > 0 ? body : undefined,
    cache: "no-store",
  });
  const responseBody = await upstreamResponse.text();

  return new NextResponse(responseBody, {
    status: upstreamResponse.status,
    headers: {
      "content-type": upstreamResponse.headers.get("content-type") ?? "application/json",
    },
  });
}

import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { validateCsrfRequest } from "@/lib/auth/csrf";
import { readAccessCookie, readAudienceCookie, readTenantCookie } from "@/lib/auth/server-session";
import { getDashboardApiBaseUrl } from "@/lib/dashboard/api-client";

type RouteContext = {
  params: Promise<{ path?: string[] }> | { path?: string[] };
};

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: RouteContext) {
  return proxyDisciplineRequest(request, context);
}

export async function POST(request: NextRequest, context: RouteContext) {
  return proxyDisciplineRequest(request, context);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return proxyDisciplineRequest(request, context);
}

async function proxyDisciplineRequest(request: NextRequest, context: RouteContext) {
  if (request.method !== "GET" && !validateCsrfRequest(request)) {
    return NextResponse.json(
      { message: "Security check expired. Refresh the page and try again." },
      { status: 403 },
    );
  }

  const cookieStore = await cookies();
  const accessToken = readAccessCookie(cookieStore);

  if (!accessToken) {
    return NextResponse.json(
      { message: "A signed-in school session is required for discipline operations." },
      { status: 401 },
    );
  }

  const requestUrl = new URL(request.url);
  const tenantSlug = requestUrl.searchParams.get("tenantSlug") ?? readTenantCookie(cookieStore);
  const audience = readAudienceCookie(cookieStore) ?? "school";
  const baseUrl = getDashboardApiBaseUrl(tenantSlug ?? undefined);

  if (!baseUrl) {
    return NextResponse.json(
      { message: "Discipline service is unavailable for this workspace." },
      { status: 503 },
    );
  }

  const params = await context.params;
  const upstreamPath = `/discipline/${(params.path ?? []).join("/")}`.replace(/\/$/, "");
  const upstreamQuery = new URLSearchParams(requestUrl.searchParams);
  upstreamQuery.delete("tenantSlug");
  const query = upstreamQuery.toString();
  const contentType = request.headers.get("content-type") ?? "";
  const body = await buildProxyBody(request);
  const upstreamResponse = await fetch(`${baseUrl}${upstreamPath}${query ? `?${query}` : ""}`, {
    method: request.method,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      "x-auth-audience": audience,
      ...(tenantSlug ? { "x-tenant-id": tenantSlug } : {}),
      ...(body && !isFormContent(contentType) ? { "Content-Type": "application/json" } : {}),
    },
    body,
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

async function buildProxyBody(request: Request) {
  if (request.method === "GET" || request.method === "HEAD") {
    return undefined;
  }

  const contentType = request.headers.get("content-type") ?? "";

  if (isFormContent(contentType)) {
    return request.formData();
  }

  const body = await request.text();
  return body.length > 0 ? body : undefined;
}

function isFormContent(contentType: string) {
  return contentType.toLowerCase().includes("multipart/form-data");
}

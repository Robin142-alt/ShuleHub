import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { validateCsrfRequest } from "@/lib/auth/csrf";
import { isExperienceAudience } from "@/lib/auth/experience-audience";
import {
  readAccessCookie,
  readAudienceCookie,
  readTenantCookie,
} from "@/lib/auth/server-session";
import { getDashboardApiBaseUrl } from "@/lib/dashboard/api-client";

type RouteContext = {
  params: Promise<{ path?: string[] }> | { path?: string[] };
};

export const dynamic = "force-dynamic";

const SUPPORT_UNAVAILABLE_MESSAGE =
  "Support service is temporarily unavailable. Please try again shortly.";
const MAX_PROXY_MULTIPART_BYTES = 11 * 1024 * 1024;

export async function GET(request: NextRequest, context: RouteContext) {
  return proxySupportRequest(request, context);
}

export async function POST(request: NextRequest, context: RouteContext) {
  return proxySupportRequest(request, context);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return proxySupportRequest(request, context);
}

async function proxySupportRequest(request: NextRequest, context: RouteContext) {
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
      { message: "A signed-in support session is required for support operations." },
      { status: 401 },
    );
  }

  const requestUrl = new URL(request.url);
  const tenantSlug = requestUrl.searchParams.get("tenantSlug") ?? readTenantCookie(cookieStore);
  const audienceParam = requestUrl.searchParams.get("audience");
  const audience = isExperienceAudience(audienceParam)
    ? audienceParam
    : readAudienceCookie(cookieStore) ?? "school";
  const baseUrl = getDashboardApiBaseUrl(tenantSlug ?? undefined);

  if (!baseUrl) {
    return NextResponse.json(
      { message: SUPPORT_UNAVAILABLE_MESSAGE },
      { status: 503 },
    );
  }

  const params = await context.params;
  const supportPath = `/support/${(params.path ?? []).join("/")}`;
  const upstreamQuery = new URLSearchParams(requestUrl.searchParams);
  upstreamQuery.delete("tenantSlug");
  upstreamQuery.delete("audience");
  const query = upstreamQuery.toString();
  const contentType = request.headers.get("content-type") ?? "";
  const multipartTooLarge = getMultipartContentLengthViolation(request, contentType);

  if (multipartTooLarge) {
    return multipartTooLarge;
  }

  const body = await buildProxyBody(request);

  const upstreamResponse = await fetch(`${baseUrl}${supportPath}${query ? `?${query}` : ""}`, {
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

function getMultipartContentLengthViolation(request: Request, contentType: string) {
  if (!isFormContent(contentType)) {
    return null;
  }

  const contentLengthHeader = request.headers.get("content-length");
  const contentLength = Number(contentLengthHeader);

  if (!contentLengthHeader || !Number.isFinite(contentLength) || contentLength <= 0) {
    return NextResponse.json(
      { message: "Multipart uploads must include a valid content length." },
      { status: 411 },
    );
  }

  if (contentLength > MAX_PROXY_MULTIPART_BYTES) {
    return NextResponse.json(
      { message: "Uploaded file exceeds the supported size limit." },
      { status: 413 },
    );
  }

  return null;
}

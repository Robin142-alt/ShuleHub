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

const MAX_PROXY_UPLOAD_BYTES = 11 * 1024 * 1024;

function validateProxyBody(request: NextRequest) {
  if (request.method === "GET" || request.method === "HEAD") {
    return null;
  }

  const contentType = request.headers.get("content-type") ?? "";

  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return null;
  }

  const contentLengthHeader = request.headers.get("content-length");
  const contentLength = Number(contentLengthHeader);

  if (
    !contentLengthHeader
    || !Number.isFinite(contentLength)
    || !Number.isInteger(contentLength)
    || contentLength <= 0
  ) {
    return NextResponse.json(
      { message: "Upload size is required before files can be accepted." },
      { status: 411 },
    );
  }

  if (contentLength > MAX_PROXY_UPLOAD_BYTES) {
    return NextResponse.json(
      { message: "Upload is too large. Attachments must be 10 MB or smaller." },
      { status: 413 },
    );
  }

  return null;
}

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

  const invalidBodyResponse = validateProxyBody(request);

  if (invalidBodyResponse) {
    return invalidBodyResponse;
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
  const body =
    request.method === "GET" || request.method === "HEAD"
      ? undefined
      : await request.arrayBuffer();
  const contentType = request.headers.get("content-type");
  const upstreamResponse = await fetch(`${baseUrl}${upstreamPath}${query ? `?${query}` : ""}`, {
    method: request.method,
    headers: {
      Accept: "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(body && contentType ? { "Content-Type": contentType } : {}),
      "x-auth-audience": audience,
      ...(tenantSlug ? { "x-tenant-id": tenantSlug } : {}),
    },
    body: body && body.byteLength > 0 ? body : undefined,
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

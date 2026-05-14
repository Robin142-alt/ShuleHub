import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { validateCsrfRequest } from "@/lib/auth/csrf";
import { readAccessCookie, readAudienceCookie } from "@/lib/auth/server-session";
import { getDashboardApiBaseUrl } from "@/lib/dashboard/api-client";

const unavailableMessage =
  "School onboarding is temporarily unavailable. Please try again shortly.";

export async function GET() {
  return proxyPlatformSchoolsRequest("GET");
}

export async function POST(request: NextRequest) {
  if (!validateCsrfRequest(request)) {
    return NextResponse.json(
      { message: "Security check expired. Refresh the page and try again." },
      { status: 403 },
    );
  }

  const body = await request.text();
  return proxyPlatformSchoolsRequest("POST", body);
}

async function proxyPlatformSchoolsRequest(method: "GET" | "POST", body?: string) {
  try {
    const cookieStore = await cookies();
    const accessToken = readAccessCookie(cookieStore);
    const audience = readAudienceCookie(cookieStore);
    const baseUrl = getDashboardApiBaseUrl();

    if (!accessToken || audience !== "superadmin") {
      return NextResponse.json(
        { message: "Platform owner access is required." },
        { status: 401 },
      );
    }

    if (!baseUrl) {
      return NextResponse.json(
        { message: unavailableMessage },
        { status: 503 },
      );
    }

    const response = await fetch(`${baseUrl}/platform/schools`, {
      method,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
        "x-auth-audience": "superadmin",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body,
      cache: "no-store",
    });
    const responseBody = await response.text();

    return new NextResponse(responseBody, {
      status: response.status,
      headers: {
        "content-type": response.headers.get("content-type") ?? "application/json",
      },
    });
  } catch {
    return NextResponse.json(
      { message: unavailableMessage },
      { status: 500 },
    );
  }
}

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { validateCsrfRequest } from "@/lib/auth/csrf";
import { readAccessCookie, readAudienceCookie, readTenantCookie } from "@/lib/auth/server-session";
import { getDashboardApiBaseUrl } from "@/lib/dashboard/api-client";

const unavailableMessage =
  "Live invitation management is not available for this session.";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getInvitationSession();

    if (!session) {
      return NextResponse.json(
        { message: unavailableMessage },
        { status: 503 },
      );
    }

    const response = await fetch(`${session.baseUrl}/auth/invitations`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${session.accessToken}`,
        "x-auth-audience": "school",
        "x-tenant-id": session.tenantSlug,
      },
      cache: "no-store",
    });
    const payload = await response.json().catch(() => null);

    return NextResponse.json(payload ?? { users: [] }, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Unable to load invitations.",
      },
      { status: 400 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!validateCsrfRequest(request)) {
      return NextResponse.json(
        { message: "Security check expired. Refresh the page and try again." },
        { status: 403 },
      );
    }

    const session = await getInvitationSession();

    if (!session) {
      return NextResponse.json(
        { message: unavailableMessage },
        { status: 503 },
      );
    }

    const body = await request.json();
    const response = await fetch(`${session.baseUrl}/auth/invitations`, {
      method: "POST",
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
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Unable to create invitation.",
      },
      { status: 400 },
    );
  }
}

async function getInvitationSession() {
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

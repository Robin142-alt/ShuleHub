import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { validateCsrfRequest } from "@/lib/auth/csrf";
import { isExperienceAudience } from "@/lib/auth/experience-audience";
import {
  readAccessCookie,
  readAudienceCookie,
  readTenantCookie,
} from "@/lib/auth/server-session";
import { getDashboardApiBaseUrl } from "@/lib/dashboard/api-client";

const unavailableMessage =
  "Email verification is temporarily unavailable. Please contact support if you need immediate access.";

export async function POST(request: NextRequest) {
  try {
    if (!validateCsrfRequest(request)) {
      return NextResponse.json(
        { message: "Security check expired. Refresh the page and try again." },
        { status: 403 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      audience?: string;
      tenantSlug?: string | null;
    };
    const cookieStore = await cookies();
    const audience = body.audience ?? readAudienceCookie(cookieStore) ?? "school";

    if (!isExperienceAudience(audience)) {
      return NextResponse.json(
        { message: "Unsupported authentication audience." },
        { status: 400 },
      );
    }

    const accessToken = readAccessCookie(cookieStore);

    if (!accessToken) {
      return NextResponse.json(
        { message: "Sign in before requesting email verification." },
        { status: 401 },
      );
    }

    const tenantSlug = body.tenantSlug ?? readTenantCookie(cookieStore);
    const baseUrl = getDashboardApiBaseUrl(tenantSlug ?? undefined);

    if (!baseUrl) {
      return NextResponse.json(
        { message: unavailableMessage },
        { status: 503 },
      );
    }

    const response = await fetch(`${baseUrl}/auth/email-verification/request`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "x-auth-audience": audience,
        Authorization: `Bearer ${accessToken}`,
        ...(tenantSlug ? { "x-tenant-id": tenantSlug } : {}),
      },
      body: JSON.stringify({}),
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as
      | { message?: string }
      | null;

    return NextResponse.json(
      {
        success: response.ok,
        message: response.ok
          ? (payload?.message ?? "Email verification instructions have been sent.")
          : (payload?.message ?? unavailableMessage),
      },
      { status: response.ok ? 200 : response.status },
    );
  } catch {
    return NextResponse.json(
      {
        message: unavailableMessage,
      },
      { status: 500 },
    );
  }
}

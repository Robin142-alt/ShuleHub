import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { validateCsrfRequest } from "@/lib/auth/csrf";
import { getDashboardApiBaseUrl } from "@/lib/dashboard/api-client";

const unavailableMessage =
  "Password reset is temporarily unavailable. Please contact support if you need immediate access.";

export async function POST(request: NextRequest) {
  try {
    if (!validateCsrfRequest(request)) {
      return NextResponse.json(
        { message: "Security check expired. Refresh the page and try again." },
        { status: 403 },
      );
    }

    const body = (await request.json()) as {
      audience?: "superadmin" | "school" | "portal";
      token?: string;
      password?: string;
      tenantSlug?: string | null;
    };
    const audience = body.audience ?? "school";
    const baseUrl = getDashboardApiBaseUrl(body.tenantSlug ?? undefined);

    if (!baseUrl) {
      return NextResponse.json(
        { message: unavailableMessage },
        { status: 503 },
      );
    }

    const response = await fetch(`${baseUrl}/auth/password-recovery/reset`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "x-auth-audience": audience,
        ...(body.tenantSlug ? { "x-tenant-id": body.tenantSlug } : {}),
      },
      body: JSON.stringify({
        token: body.token,
        password: body.password,
      }),
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as
      | { message?: string }
      | null;

    return NextResponse.json(
      {
        success: response.ok,
        message: response.ok
          ? (payload?.message ?? "Password updated successfully.")
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

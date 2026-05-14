import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { validateCsrfRequest } from "@/lib/auth/csrf";
import { getDashboardApiBaseUrl } from "@/lib/dashboard/api-client";

const unavailableMessage =
  "Invitation acceptance is temporarily unavailable. Please contact support if you need immediate access.";

export async function POST(request: NextRequest) {
  try {
    if (!validateCsrfRequest(request)) {
      return NextResponse.json(
        { message: "Security check expired. Refresh the page and try again." },
        { status: 403 },
      );
    }

    const body = (await request.json()) as {
      token?: string;
      password?: string;
      displayName?: string;
      tenantSlug?: string | null;
    };
    const baseUrl = getDashboardApiBaseUrl(body.tenantSlug ?? undefined);

    if (!baseUrl) {
      return NextResponse.json(
        { message: unavailableMessage },
        { status: 503 },
      );
    }

    const response = await fetch(`${baseUrl}/auth/invitations/accept`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "x-auth-audience": "school",
        ...(body.tenantSlug ? { "x-tenant-id": body.tenantSlug } : {}),
      },
      body: JSON.stringify({
        token: body.token,
        password: body.password,
        display_name: body.displayName,
      }),
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as
      | {
          success?: boolean;
          message?: string;
          tenant_id?: string;
          email?: string;
          display_name?: string;
          role?: string;
        }
      | null;

    return NextResponse.json(
      response.ok
        ? {
            success: true,
            message: payload?.message ?? "Invitation accepted. You can now sign in.",
            tenantId: payload?.tenant_id,
            email: payload?.email,
            displayName: payload?.display_name,
            role: payload?.role,
          }
        : {
            message: payload?.message ?? unavailableMessage,
          },
      { status: response.ok ? 200 : response.status },
    );
  } catch {
    return NextResponse.json(
      { message: unavailableMessage },
      { status: 500 },
    );
  }
}

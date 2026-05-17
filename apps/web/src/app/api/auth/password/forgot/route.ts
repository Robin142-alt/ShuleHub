import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { validateCsrfRequest } from "@/lib/auth/csrf";
import { getDashboardApiBaseUrl } from "@/lib/dashboard/api-client";

const emailPattern = /\S+@\S+\.\S+/;
const genericMessage =
  "If the account is eligible, password recovery instructions have been sent.";
const unavailableMessage =
  "Password recovery is temporarily unavailable. Please contact support if you need immediate access.";

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
      email?: string;
      identifier?: string;
      tenantSlug?: string | null;
    };
    const audience = body.audience ?? "school";
    const identifier = (body.identifier ?? body.email ?? "").trim();

    if (!emailPattern.test(identifier)) {
      return NextResponse.json({ success: true, message: genericMessage });
    }

    const baseUrl = getDashboardApiBaseUrl(body.tenantSlug ?? undefined);

    if (!baseUrl) {
      return NextResponse.json(
        { message: unavailableMessage },
        { status: 503 },
      );
    }

    const response = await fetch(`${baseUrl}/auth/password-recovery/request`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "x-auth-audience": audience,
        ...(body.tenantSlug ? { "x-tenant-id": body.tenantSlug } : {}),
      },
      body: JSON.stringify({
        audience,
        email: identifier,
      }),
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as
      | { message?: string }
      | null;

    return NextResponse.json(
      {
        success: response.ok,
        message: response.ok ? (payload?.message ?? genericMessage) : unavailableMessage,
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

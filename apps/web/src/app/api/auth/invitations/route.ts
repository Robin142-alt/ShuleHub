import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { readAccessCookie, readTenantCookie } from "@/lib/auth/server-session";
import { getDashboardApiBaseUrl } from "@/lib/dashboard/api-client";

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const tenantSlug = readTenantCookie(cookieStore);
    const accessToken = readAccessCookie(cookieStore);
    const baseUrl = tenantSlug ? getDashboardApiBaseUrl(tenantSlug) : null;

    if (!baseUrl || !accessToken) {
      return NextResponse.json(
        { message: "Live invitation management is not available for this session." },
        { status: 503 },
      );
    }

    const body = await request.json();
    const response = await fetch(`${baseUrl}/auth/invitations`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
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

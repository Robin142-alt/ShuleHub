import { NextResponse } from "next/server";

import { getDashboardApiBaseUrl } from "@/lib/dashboard/api-client";

function inferTenantSlug(request: Request) {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
  const normalizedHost = host.split(":")[0]?.trim().toLowerCase() ?? "";

  if (!normalizedHost || normalizedHost === "localhost" || normalizedHost === "127.0.0.1") {
    return null;
  }

  return normalizedHost.split(".")[0] ?? null;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      token?: string;
      password?: string;
      tenantSlug?: string | null;
    };
    const tenantSlug = body.tenantSlug?.trim() || inferTenantSlug(request);
    const baseUrl = tenantSlug ? getDashboardApiBaseUrl(tenantSlug) : null;

    if (!baseUrl) {
      return NextResponse.json(
        { message: "Live password reset is not configured for this tenant." },
        { status: 503 },
      );
    }

    const response = await fetch(`${baseUrl}/auth/password/reset`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        token: body.token,
        password: body.password,
      }),
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
            : "Unable to reset the password.",
      },
      { status: 400 },
    );
  }
}

import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { validateCsrfRequest } from "@/lib/auth/csrf";
import {
  readAccessCookie,
  readExperienceSessionCookie,
  readTenantCookie,
} from "@/lib/auth/server-session";
import {
  isDashboardApiConfigured,
  requestDashboardApi,
} from "@/lib/dashboard/api-client";

export async function POST(request: NextRequest) {
  if (!validateCsrfRequest(request)) {
    return NextResponse.json(
      { synced: false, message: "Security check expired. Refresh the page and try again." },
      { status: 403 },
    );
  }

  const cookieStore = await cookies();
  const session = readExperienceSessionCookie(cookieStore, "school");

  if (!session || session.experience !== "school" || session.role !== "storekeeper") {
    return NextResponse.json(
      { synced: false, message: "Storekeeper inventory access is required." },
      { status: 403 },
    );
  }

  const tenantId = readTenantCookie(cookieStore) ?? session.tenantSlug;
  const accessToken = readAccessCookie(cookieStore);

  if (!tenantId || !accessToken) {
    return NextResponse.json(
      {
        synced: false,
        message: "Storekeeper session expired. Sign in again to submit the stock issue.",
      },
      { status: 401 },
    );
  }

  if (!isDashboardApiConfigured()) {
    return NextResponse.json(
      {
        synced: false,
        message: "Live inventory API is unavailable. The stock issue was not submitted.",
      },
      { status: 503 },
    );
  }

  try {
    const upstream = await requestDashboardApi("/inventory/stock-issues", {
      method: "POST",
      tenantId,
      accessToken,
      body: await request.json(),
      unwrapEnvelope: false,
    });

    return NextResponse.json({
      synced: true,
      message: "Stock issue synced to the live inventory API.",
      upstream,
    });
  } catch (error) {
    return NextResponse.json(
      {
        synced: false,
        message:
          error instanceof Error
            ? error.message
            : "Live inventory sync failed.",
      },
      { status: 502 },
    );
  }
}

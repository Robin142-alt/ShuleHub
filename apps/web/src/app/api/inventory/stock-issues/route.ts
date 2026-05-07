import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  readAccessCookie,
  readExperienceSessionCookie,
  readTenantCookie,
} from "@/lib/auth/server-session";
import {
  isDashboardApiConfigured,
  requestDashboardApi,
} from "@/lib/dashboard/api-client";

export async function POST(request: Request) {
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

  if (!isDashboardApiConfigured() || !tenantId || !accessToken) {
    return NextResponse.json(
      {
        synced: false,
        message: "Live inventory API is not configured; stock issue was saved locally.",
      },
      { status: 202 },
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
            : "Live inventory API sync failed.",
      },
      { status: 502 },
    );
  }
}

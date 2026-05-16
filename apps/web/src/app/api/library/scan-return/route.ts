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

  if (!session || session.experience !== "school" || !["librarian", "admin", "owner"].includes(session.role ?? "")) {
    return NextResponse.json(
      { synced: false, message: "Librarian library access is required." },
      { status: 403 },
    );
  }

  const tenantId = readTenantCookie(cookieStore) ?? session.tenantSlug;
  const accessToken = readAccessCookie(cookieStore);

  if (!isDashboardApiConfigured() || !tenantId || !accessToken) {
    return NextResponse.json(
      { synced: false, message: "Live library API is not configured." },
      { status: 202 },
    );
  }

  try {
    const upstream = await requestDashboardApi("/library/circulation/return", {
      method: "POST",
      tenantId,
      accessToken,
      body: await request.json(),
      unwrapEnvelope: false,
    });

    return NextResponse.json({ synced: true, message: "Book returned from scanner.", upstream });
  } catch (error) {
    return NextResponse.json(
      { synced: false, message: error instanceof Error ? error.message : "Scanner return failed." },
      { status: 502 },
    );
  }
}

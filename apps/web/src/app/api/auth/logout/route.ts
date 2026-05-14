import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { validateCsrfRequest } from "@/lib/auth/csrf";
import { clearExperienceSessionCookies } from "@/lib/auth/server-session";

export async function POST(request: NextRequest) {
  if (!validateCsrfRequest(request)) {
    return NextResponse.json(
      { message: "Security check expired. Refresh the page and try again." },
      { status: 403 },
    );
  }

  const response = NextResponse.json({ success: true });
  clearExperienceSessionCookies(response);
  return response;
}

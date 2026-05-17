import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { validateCsrfRequest } from "@/lib/auth/csrf";
import {
  setExperienceSessionCookies,
  toPublicExperienceGatewaySession,
  type ExperienceGatewaySession,
} from "@/lib/auth/server-session";
import { getDashboardApiBaseUrl, type LiveAuthUser } from "@/lib/dashboard/api-client";

type BackendAuthResponse = {
  tokens: {
    access_token: string;
    refresh_token: string;
  };
  user: LiveAuthUser;
};

export async function POST(request: NextRequest) {
  if (!validateCsrfRequest(request)) {
    return NextResponse.json(
      { message: "Security check expired. Refresh the page and try again." },
      { status: 403 },
    );
  }

  const baseUrl = getDashboardApiBaseUrl();

  if (!baseUrl) {
    return NextResponse.json(
      { message: "Parent portal verification is temporarily unavailable." },
      { status: 503 },
    );
  }

  const upstreamResponse = await fetch(`${baseUrl}/auth/parent/otp/verify`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "x-auth-audience": "portal",
    },
    body: await request.text(),
    cache: "no-store",
  });
  const payload = (await upstreamResponse.json().catch(() => null)) as BackendAuthResponse | { message?: string } | null;

  if (!upstreamResponse.ok || !payload || !("tokens" in payload)) {
    return NextResponse.json(
      { message: payload && "message" in payload && payload.message ? payload.message : "Unable to verify the parent code." },
      { status: upstreamResponse.status },
    );
  }

  const homePath = "/portal/parent";
  const session = {
    audience: "portal",
    homePath,
    redirectTo: homePath,
    tenantSlug: payload.user.tenant_id,
    userLabel: payload.user.display_name || payload.user.email,
    accessToken: payload.tokens.access_token,
    refreshToken: payload.tokens.refresh_token,
    role: payload.user.role,
    viewer: "parent",
    user: payload.user,
  } satisfies ExperienceGatewaySession;
  const response = NextResponse.json({
    redirectTo: homePath,
    session: toPublicExperienceGatewaySession(session),
    user: payload.user,
  });
  setExperienceSessionCookies(response, session);

  return response;
}

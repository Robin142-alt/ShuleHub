import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { validateCsrfRequest } from "@/lib/auth/csrf";
import { isExperienceAudience } from "@/lib/auth/experience-audience";
import { createServerAuthClient } from "@/lib/auth/server-auth-client";
import {
  setExperienceSessionCookies,
  toPublicExperienceGatewaySession,
} from "@/lib/auth/server-session";

export async function POST(request: NextRequest) {
  try {
    if (!validateCsrfRequest(request)) {
      return NextResponse.json(
        { message: "Security check expired. Refresh the page and try again." },
        { status: 403 },
      );
    }

    const body = (await request.json()) as {
      audience?: string;
      identifier?: string;
      password?: string;
      verificationCode?: string;
      tenantSlug?: string | null;
    };

    const audience = body.audience ?? null;

    if (!isExperienceAudience(audience)) {
      return NextResponse.json(
        { message: "Unsupported authentication audience." },
        { status: 400 },
      );
    }

    if (!body.identifier?.trim() || !body.password?.trim()) {
      return NextResponse.json(
        { message: "Identifier and password are required." },
        { status: 400 },
      );
    }

    const authClient = createServerAuthClient(request);
    const session = await authClient.login({
      audience,
      identifier: body.identifier,
      password: body.password,
      verificationCode: body.verificationCode,
      tenantSlug: body.tenantSlug ?? null,
    });

    const response = NextResponse.json({
      redirectTo: session.redirectTo,
      session: toPublicExperienceGatewaySession(session),
      user: session.user,
    });

    setExperienceSessionCookies(response, session);

    return response;
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Unable to sign in right now.",
      },
      { status: 401 },
    );
  }
}

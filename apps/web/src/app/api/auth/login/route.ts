import { NextResponse } from "next/server";

import { isExperienceAudience } from "@/lib/auth/experience-audience";
import { createServerAuthClient } from "@/lib/auth/server-auth-client";
import { setExperienceSessionCookies } from "@/lib/auth/server-session";

export async function POST(request: Request) {
  try {
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
      session,
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

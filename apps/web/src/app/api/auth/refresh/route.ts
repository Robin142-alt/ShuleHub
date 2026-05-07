import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { isExperienceAudience } from "@/lib/auth/experience-audience";
import { createServerAuthClient } from "@/lib/auth/server-auth-client";
import { setExperienceSessionCookies } from "@/lib/auth/server-session";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      audience?: string;
      tenantSlug?: string | null;
    };

    const audience = body.audience ?? null;

    if (!isExperienceAudience(audience)) {
      return NextResponse.json(
        { message: "Unsupported authentication audience." },
        { status: 400 },
      );
    }

    const authClient = createServerAuthClient(request);
    const cookieStore = await cookies();
    const session = await authClient.refresh(
      {
        audience,
        tenantSlug: body.tenantSlug ?? null,
      },
      cookieStore,
    );

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
            : "Unable to refresh the current session.",
      },
      { status: 401 },
    );
  }
}

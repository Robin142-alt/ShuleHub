import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { isExperienceAudience } from "@/lib/auth/experience-audience";
import { createServerAuthClient } from "@/lib/auth/server-auth-client";
import { toPublicExperienceGatewaySession } from "@/lib/auth/server-session";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const audience = searchParams.get("audience");

  if (!isExperienceAudience(audience)) {
    return NextResponse.json(
      { message: "Unsupported authentication audience." },
      { status: 400 },
    );
  }

  try {
    const authClient = createServerAuthClient(request);
    const cookieStore = await cookies();
    const session = await authClient.me(audience, cookieStore);

    return NextResponse.json({
      session: toPublicExperienceGatewaySession(session),
      user: session.user,
    });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "No active session found.",
      },
      { status: 401 },
    );
  }
}

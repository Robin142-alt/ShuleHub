import { NextResponse, type NextRequest } from "next/server";

import {
  evaluateExperienceRouting,
  PORTAL_SESSION_COOKIE,
  SCHOOL_SESSION_COOKIE,
  SUPERADMIN_SESSION_COOKIE,
} from "@/lib/auth/experience-routing";

export function proxy(request: NextRequest) {
  const decision = evaluateExperienceRouting({
    host:
      request.headers.get("x-forwarded-host") ??
      request.headers.get("host"),
    pathname: request.nextUrl.pathname,
    cookies: {
      [SUPERADMIN_SESSION_COOKIE]:
        request.cookies.get(SUPERADMIN_SESSION_COOKIE)?.value,
      [SCHOOL_SESSION_COOKIE]:
        request.cookies.get(SCHOOL_SESSION_COOKIE)?.value,
      [PORTAL_SESSION_COOKIE]:
        request.cookies.get(PORTAL_SESSION_COOKIE)?.value,
    },
  });

  if (decision.action === "redirect") {
    return NextResponse.redirect(new URL(decision.location, request.url));
  }

  const requestHeaders = new Headers(request.headers);

  Object.entries(decision.headers).forEach(([key, value]) => {
    requestHeaders.set(key, value);
  });

  if (decision.rewrittenPath && decision.rewrittenPath !== request.nextUrl.pathname) {
    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = decision.rewrittenPath;

    return NextResponse.rewrite(rewriteUrl, {
      request: {
        headers: requestHeaders,
      },
    });
  }

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

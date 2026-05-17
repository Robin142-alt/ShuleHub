import { NextResponse } from "next/server";

import type { LiveAuthUser } from "@/lib/dashboard/api-client";
import type { ExperienceAudience } from "@/lib/auth/experience-audience";
import {
  parseExperienceSession,
  serializeExperienceSession,
  type ExperienceSession,
} from "@/lib/auth/experience-routing";
import type { PortalViewer, SchoolExperienceRole } from "@/lib/experiences/types";
import {
  ACCESS_COOKIE,
  AUDIENCE_COOKIE,
  getExperienceSessionCookieName,
  REFRESH_COOKIE,
  TENANT_COOKIE,
} from "@/lib/auth/session-cookies";

export type ExperienceGatewaySession = {
  audience: ExperienceAudience;
  homePath: string;
  redirectTo: string;
  tenantSlug: string | null;
  userLabel: string;
  accessToken: string;
  refreshToken: string;
  role?: string;
  viewer?: string;
  user: LiveAuthUser;
};

export type PublicExperienceGatewaySession = Omit<
  ExperienceGatewaySession,
  "accessToken" | "refreshToken"
>;

type CookieReader = {
  get(name: string): { value: string } | undefined;
};

const secureCookies = process.env.NODE_ENV === "production";

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: secureCookies,
    path: "/",
  };
}

function deleteCookie(response: NextResponse, name: string) {
  response.cookies.set(name, "", {
    ...cookieOptions(),
    maxAge: 0,
  });
}

function toExperienceSession(
  session: ExperienceGatewaySession,
): ExperienceSession {
  if (session.audience === "superadmin") {
    return {
      experience: "superadmin",
      homePath: session.homePath,
      userLabel: session.userLabel,
    };
  }

  if (session.audience === "school") {
    return {
      experience: "school",
      homePath: session.homePath,
      role: (session.role ?? "admin") as SchoolExperienceRole,
      tenantSlug: session.tenantSlug ?? "",
      userLabel: session.userLabel,
    };
  }

  return {
    experience: "portal",
    homePath: session.homePath,
    viewer: (session.viewer ?? "parent") as PortalViewer,
    userLabel: session.userLabel,
  };
}

export function toPublicExperienceGatewaySession(
  session: ExperienceGatewaySession,
): PublicExperienceGatewaySession {
  const publicSession = { ...session } as Omit<
    ExperienceGatewaySession,
    "accessToken" | "refreshToken"
  > & Partial<Pick<ExperienceGatewaySession, "accessToken" | "refreshToken">>;

  delete publicSession.accessToken;
  delete publicSession.refreshToken;

  return publicSession;
}

export function setExperienceSessionCookies(
  response: NextResponse,
  session: ExperienceGatewaySession,
) {
  response.cookies.set(
    getExperienceSessionCookieName(session.audience),
    serializeExperienceSession(toExperienceSession(session)),
    cookieOptions(),
  );
  response.cookies.set(ACCESS_COOKIE, session.accessToken, cookieOptions());
  response.cookies.set(REFRESH_COOKIE, session.refreshToken, cookieOptions());
  response.cookies.set(AUDIENCE_COOKIE, session.audience, cookieOptions());

  if (session.tenantSlug) {
    response.cookies.set(TENANT_COOKIE, session.tenantSlug, cookieOptions());
  } else {
    deleteCookie(response, TENANT_COOKIE);
  }
}

export function clearExperienceSessionCookies(response: NextResponse) {
  deleteCookie(response, ACCESS_COOKIE);
  deleteCookie(response, REFRESH_COOKIE);
  deleteCookie(response, AUDIENCE_COOKIE);
  deleteCookie(response, TENANT_COOKIE);
  deleteCookie(response, getExperienceSessionCookieName("superadmin"));
  deleteCookie(response, getExperienceSessionCookieName("school"));
  deleteCookie(response, getExperienceSessionCookieName("portal"));
}

export function readAudienceCookie(cookieStore: CookieReader) {
  return cookieStore.get(AUDIENCE_COOKIE)?.value ?? null;
}

export function readTenantCookie(cookieStore: CookieReader) {
  return cookieStore.get(TENANT_COOKIE)?.value ?? null;
}

export function readAccessCookie(cookieStore: CookieReader) {
  return cookieStore.get(ACCESS_COOKIE)?.value ?? "";
}

export function readRefreshCookie(cookieStore: CookieReader) {
  return cookieStore.get(REFRESH_COOKIE)?.value ?? "";
}

export function readExperienceSessionCookie(
  cookieStore: CookieReader,
  audience: ExperienceAudience,
) {
  return parseExperienceSession(
    audience,
    cookieStore.get(getExperienceSessionCookieName(audience))?.value ?? null,
  );
}

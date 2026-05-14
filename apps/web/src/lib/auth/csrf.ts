import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const CSRF_COOKIE = "shulehub.csrf";
export const CSRF_HEADER = "x-shulehub-csrf";

const secureCookies = process.env.NODE_ENV === "production";

export function generateCsrfToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function createCsrfResponse() {
  const token = generateCsrfToken();
  const response = NextResponse.json({ token });

  response.cookies.set(CSRF_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookies,
    path: "/",
    maxAge: 60 * 30,
  });

  return response;
}

export function validateCsrfRequest(request: NextRequest) {
  const cookieToken = request.cookies.get(CSRF_COOKIE)?.value ?? null;
  const headerToken = request.headers.get(CSRF_HEADER);

  return Boolean(cookieToken && headerToken && cookieToken === headerToken);
}

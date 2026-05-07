import { NextResponse } from "next/server";

import { clearExperienceSessionCookies } from "@/lib/auth/server-session";

export async function POST() {
  const response = NextResponse.json({ success: true });
  clearExperienceSessionCookies(response);
  return response;
}

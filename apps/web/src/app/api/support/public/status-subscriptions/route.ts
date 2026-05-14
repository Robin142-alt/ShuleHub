import { NextRequest, NextResponse } from "next/server";

import { getDashboardApiBaseUrl } from "@/lib/dashboard/api-client";

export const dynamic = "force-dynamic";

const SUBSCRIPTION_UNAVAILABLE_MESSAGE =
  "Status subscriptions are temporarily unavailable. Please try again shortly.";

export async function POST(request: NextRequest) {
  const baseUrl = getDashboardApiBaseUrl();

  if (!baseUrl) {
    return NextResponse.json(
      { message: SUBSCRIPTION_UNAVAILABLE_MESSAGE },
      { status: 503 },
    );
  }

  const isFormPost = request.headers
    .get("content-type")
    ?.toLowerCase()
    .includes("application/x-www-form-urlencoded")
    ?? false;
  const payload = isFormPost
    ? Object.fromEntries((await request.formData()).entries())
    : await request.json();

  const upstreamResponse = await fetch(`${baseUrl}/support/public/status-subscriptions`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "x-forwarded-for": request.headers.get("x-forwarded-for") ?? "",
    },
    body: JSON.stringify({
      email: typeof payload.email === "string" ? payload.email : "",
      locale: typeof payload.locale === "string" ? payload.locale : undefined,
    }),
    cache: "no-store",
  });

  if (isFormPost) {
    const searchParams = new URLSearchParams({
      subscribed: upstreamResponse.ok ? "1" : "0",
    });

    return NextResponse.redirect(new URL(`/support/status?${searchParams}`, request.url), 303);
  }

  const responseBody = await upstreamResponse.text();

  return new NextResponse(responseBody, {
    status: upstreamResponse.status,
    headers: {
      "content-type": upstreamResponse.headers.get("content-type") ?? "application/json",
    },
  });
}

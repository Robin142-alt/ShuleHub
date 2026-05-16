import type { NextRequest } from "next/server";

import { proxySchoolApiRequest } from "@/lib/dashboard/server-api-proxy";

type RouteContext = {
  params: Promise<{ path?: string[] }> | { path?: string[] };
};

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: RouteContext) {
  return proxySchoolApiRequest(request, context, "/platform", {
    audience: "superadmin",
  });
}

export async function POST(request: NextRequest, context: RouteContext) {
  return proxySchoolApiRequest(request, context, "/platform", {
    audience: "superadmin",
  });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return proxySchoolApiRequest(request, context, "/platform", {
    audience: "superadmin",
  });
}

import { createCsrfResponse } from "@/lib/auth/csrf";

export function GET() {
  return createCsrfResponse();
}

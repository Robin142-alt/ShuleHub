import { getCsrfToken } from "@/lib/auth/csrf-client";

type EmailVerificationRequestInput = {
  audience?: "superadmin" | "school" | "portal";
  tenantSlug?: string | null;
};

type EmailVerificationVerifyInput = {
  token: string;
  tenantSlug?: string | null;
};

async function postEmailVerificationAction(
  path: string,
  body: Record<string, unknown>,
) {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-shulehub-csrf": await getCsrfToken(),
    },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as
    | { message?: string }
    | null;

  if (!response.ok) {
    throw new Error(payload?.message ?? "Unable to complete email verification.");
  }

  return payload;
}

export function requestEmailVerification(input: EmailVerificationRequestInput = {}) {
  return postEmailVerificationAction("/api/auth/email-verification/request", input);
}

export function verifyEmail(input: EmailVerificationVerifyInput) {
  return postEmailVerificationAction("/api/auth/email-verification/verify", input);
}

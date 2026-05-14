import { getCsrfToken } from "@/lib/auth/csrf-client";

export type InvitationAcceptanceResult = {
  success: true;
  message: string;
  tenantId?: string;
  email?: string;
  displayName?: string;
  role?: string;
};

export async function acceptInvitation(input: {
  token: string;
  password: string;
  displayName?: string;
  tenantSlug?: string | null;
}) {
  const response = await fetch("/api/auth/invitations/accept", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-shulehub-csrf": await getCsrfToken(),
    },
    credentials: "same-origin",
    body: JSON.stringify(input),
  });
  const payload = (await response.json().catch(() => null)) as
    | InvitationAcceptanceResult
    | { message?: string }
    | null;

  if (!response.ok) {
    throw new Error(payload?.message ?? "Unable to accept this invitation.");
  }

  return payload as InvitationAcceptanceResult;
}

import { AuthShell } from "@/components/auth/auth-shell";
import { VerifyEmailView } from "@/components/auth/email-verification-view";
import { readResetToken, type ResetSearchParams } from "@/lib/auth/reset-token";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams?: ResetSearchParams;
}) {
  const initialToken = await readResetToken(searchParams);

  return (
    <AuthShell
      eyebrow="Verify email"
      heroTitle="Secure account verification before workspace access."
      heroDescription="Email verification confirms account ownership before sensitive school or platform records are opened."
      badge="Identity security"
      logoMark="SH"
      helper="Verification links are single-use, short-lived, and tied to the account email."
      highlights={[
        {
          id: "token",
          title: "Single-use token",
          description: "Verification links are consumed after a successful confirmation.",
        },
        {
          id: "expiry",
          title: "Time limited",
          description: "Expired links are rejected before account state changes.",
        },
        {
          id: "session",
          title: "Safe return",
          description: "Users return through secure sign-in after confirming email ownership.",
        },
      ]}
      trustNotes={[
        { id: "secure", label: "Secure link", icon: "lock" },
        { id: "verified", label: "Verified email", icon: "check" },
        { id: "tenant", label: "Tenant aware", icon: "shield" },
      ]}
    >
      <VerifyEmailView initialToken={initialToken} />
    </AuthShell>
  );
}

import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordView } from "@/components/auth/auth-recovery-view";
import { readResetToken, type ResetSearchParams } from "@/lib/auth/reset-token";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams?: ResetSearchParams;
}) {
  const initialToken = await readResetToken(searchParams);

  return (
    <AuthShell
      eyebrow="Password reset"
      heroTitle="Create a new password with clear, secure guidance."
      heroDescription="Reset passwords with validation, confirmation, short-lived codes, and calm enterprise messaging."
      badge="Password security"
      logoMark="SH"
      helper="New passwords should be unique to ShuleHub and never shared with school staff, families, or support."
      highlights={[
        {
          id: "requirements",
          title: "Clear requirements",
          description: "Password rules are readable and enforced before submission.",
        },
        {
          id: "expiry",
          title: "Short-lived code",
          description: "Recovery codes expire automatically to reduce account takeover risk.",
        },
        {
          id: "session",
          title: "Fresh session",
          description: "Users return through a new secure login after changing credentials.",
        },
      ]}
      trustNotes={[
        { id: "secure", label: "Secure reset", icon: "shield" },
        { id: "expiry", label: "Code expiry", icon: "lock" },
        { id: "verified", label: "Verified channel", icon: "check" },
      ]}
    >
      <ResetPasswordView
        title="Create your new password"
        subtitle="Enter the recovery code from your verified channel, then choose a new password."
        secretLabel="New password"
        secretPlaceholder="Create a new password"
        backHref="/login"
        audience="school"
        initialToken={initialToken}
      />
    </AuthShell>
  );
}

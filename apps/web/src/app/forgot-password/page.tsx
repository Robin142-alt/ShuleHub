import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordView } from "@/components/auth/auth-recovery-view";

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      eyebrow="Account recovery"
      heroTitle="Recover access without weakening account security."
      heroDescription="A secure recovery entry for school staff, parents, students, support teams, and platform operators."
      badge="Secure recovery"
      logoMark="SH"
      helper="Recovery messaging avoids account enumeration and sends instructions only through verified channels."
      highlights={[
        {
          id: "safe",
          title: "Security aware",
          description: "The flow confirms next steps without revealing whether an identifier exists.",
        },
        {
          id: "mobile",
          title: "Mobile ready",
          description: "Parents, teachers, and administrators can complete recovery on phones.",
        },
        {
          id: "tenant",
          title: "Tenant scoped",
          description: "School recovery remains bound to the correct institution workspace.",
        },
      ]}
      trustNotes={[
        { id: "verified", label: "Verified channels", icon: "shield" },
        { id: "expiry", label: "Short expiry", icon: "lock" },
        { id: "audit", label: "Audit ready", icon: "check" },
      ]}
    >
      <ForgotPasswordView
        title="Recover your account"
        subtitle="Enter the verified email address connected to your account. If it is eligible, instructions will be sent to that address."
        identifierLabel="Email address"
        identifierPlaceholder="Enter your email address"
        submitLabel="Send recovery instructions"
        backHref="/login"
        successMessage="If the account is eligible, recovery instructions have been sent to the verified channel."
        audience="school"
      />
    </AuthShell>
  );
}

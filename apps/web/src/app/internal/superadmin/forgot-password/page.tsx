import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordView } from "@/components/auth/auth-recovery-view";

export default function InternalSuperadminForgotPasswordPage() {
  return (
    <AuthShell
      eyebrow="Super admin recovery"
      heroTitle="Recover platform access safely."
      heroDescription="Account recovery for platform operators should feel simple, but still reflect the trust and control required for global admin access."
      badge="Controlled recovery"
      logoMark="SH"
      helper="Recovery links are short-lived, device aware, and designed for high-privilege platform accounts."
      highlights={[
        {
          id: "verify-identity",
          title: "Identity first",
          description:
            "Recovery always starts by verifying the operator and their trusted channel.",
        },
        {
          id: "short-lived",
          title: "Short-lived recovery",
          description: "Reset links and codes expire quickly to reduce risk.",
        },
        {
          id: "support-assisted",
          title: "Support-assisted if needed",
          description:
            "Platform owners can still help support staff without weakening security posture.",
        },
      ]}
      trustNotes={[
        { id: "secure-reset", label: "Secure reset flow", icon: "shield" },
        { id: "limited-window", label: "Short expiry", icon: "lock" },
      ]}
    >
      <ForgotPasswordView
        title="Recover platform access"
        subtitle="Enter the email address tied to your platform account. We will send recovery instructions to your verified channel."
        identifierLabel="Work email"
        identifierPlaceholder="Enter your work email"
        submitLabel="Send recovery link"
        backHref="/login"
        successMessage="If the email belongs to an authorized platform account, recovery instructions have been sent."
        audience="superadmin"
      />
    </AuthShell>
  );
}

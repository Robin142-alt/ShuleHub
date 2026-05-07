import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordView } from "@/components/auth/auth-recovery-view";

export default function InternalSuperadminResetPasswordPage() {
  return (
    <AuthShell
      eyebrow="Super admin reset"
      heroTitle="Set a new platform password."
      heroDescription="Choose a new high-trust password, complete recovery, and return to the platform with device protection intact."
      badge="Secure reset session"
      logoMark="SH"
      helper="We recommend a unique password plus your authenticator app for ongoing platform access."
      highlights={[
        {
          id: "policy",
          title: "Strong policy",
          description:
            "Passwords should be unique, memorable, and hard to reuse elsewhere.",
        },
        {
          id: "confirm-device",
          title: "Device-aware",
          description:
            "Recent device context helps teams spot unusual reset activity quickly.",
        },
        {
          id: "fast-return",
          title: "Fast return",
          description:
            "Move from recovery to platform control with minimal friction.",
        },
      ]}
      trustNotes={[
        { id: "encrypted", label: "Encrypted reset flow", icon: "lock" },
        { id: "audited", label: "Recovery audited", icon: "check" },
      ]}
    >
      <ResetPasswordView
        title="Create a new platform password"
        subtitle="Enter the recovery code from your email, then choose a new password for this platform account."
        secretLabel="New password"
        secretPlaceholder="Create a strong platform password"
        backHref="/login"
      />
    </AuthShell>
  );
}

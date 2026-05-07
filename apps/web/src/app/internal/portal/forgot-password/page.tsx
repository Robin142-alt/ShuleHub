import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordView } from "@/components/auth/auth-recovery-view";

export default function InternalPortalForgotPasswordPage() {
  return (
    <AuthShell
      eyebrow="Portal recovery"
      heroTitle="Recover family portal access."
      heroDescription="Keep the portal recovery flow simple enough for families and learners while still protecting private school information."
      badge="Friendly recovery"
      logoMark="PT"
      helper="Use the phone number or admission number already linked to the portal account."
      highlights={[
        { id: "simple", title: "Simple for families", description: "Clear language and familiar identifiers reduce support calls." },
        { id: "private", title: "Private access", description: "Only the linked family or learner receives recovery instructions." },
        { id: "mobile", title: "Mobile friendly", description: "Everything works comfortably from a phone without extra training." },
      ]}
      trustNotes={[
        { id: "portal-safe", label: "Portal protected", icon: "shield" },
        { id: "clear-steps", label: "Clear steps", icon: "check" },
      ]}
    >
      <ForgotPasswordView
        title="Recover your portal password or PIN"
        subtitle="Enter the phone number or admission number linked to the portal. We will send a recovery message to your verified contact."
        identifierLabel="Phone number or admission number"
        identifierPlaceholder="0712 345 678 or SH-24011"
        submitLabel="Send recovery message"
        backHref="/login"
        successMessage="If the details match a family or student account, recovery instructions have been sent."
      />
    </AuthShell>
  );
}

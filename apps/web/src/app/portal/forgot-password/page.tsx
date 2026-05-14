import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordView } from "@/components/auth/auth-recovery-view";

export default function PortalForgotPasswordPage() {
  return (
    <AuthShell
      eyebrow="Portal recovery"
      heroTitle="Recover family portal access."
      heroDescription="Keep the portal recovery flow simple enough for families and learners while still protecting private school information."
      badge="Friendly recovery"
      logoMark="PT"
      helper="Use the verified email address already linked to the portal account."
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
        title="Recover your portal password"
        subtitle="Enter the verified email address linked to the portal. We will send recovery instructions to that address."
        identifierLabel="Email address"
        identifierPlaceholder="Email address on your portal account"
        submitLabel="Send recovery instructions"
        backHref="/portal/login"
        successMessage="If the details match a family or student account, recovery instructions have been sent."
        audience="portal"
      />
    </AuthShell>
  );
}

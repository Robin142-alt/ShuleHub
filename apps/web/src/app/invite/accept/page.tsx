import { AuthShell } from "@/components/auth/auth-shell";
import { InviteAcceptanceView } from "@/components/auth/auth-invitation-view";
import { readResetToken, type ResetSearchParams } from "@/lib/auth/reset-token";

export default async function InviteAcceptancePage({
  searchParams,
}: {
  searchParams?: ResetSearchParams;
}) {
  const initialToken = await readResetToken(searchParams);

  return (
    <AuthShell
      eyebrow="Invite acceptance"
      heroTitle="Secure school onboarding starts from a verified invitation."
      heroDescription="New administrators create their own password from a signed, short-lived invitation link before entering a tenant workspace."
      badge="User onboarding"
      logoMark="SH"
      helper="Invitation links bind the school, role, email address, and first password setup without exposing credentials."
      highlights={[
        {
          id: "tenant",
          title: "Tenant bound",
          description: "The invitation activates access only for the school selected by the platform owner.",
        },
        {
          id: "email",
          title: "Email issued",
          description: "Users receive real email invitations and create passwords themselves.",
        },
        {
          id: "audit",
          title: "Audit ready",
          description: "Acceptance consumes the token and records activation in the auth system.",
        },
      ]}
      trustNotes={[
        { id: "secure", label: "Signed token", icon: "lock" },
        { id: "scoped", label: "Tenant scoped", icon: "shield" },
        { id: "verified", label: "Email verified", icon: "check" },
      ]}
    >
      <InviteAcceptanceView initialToken={initialToken} />
    </AuthShell>
  );
}

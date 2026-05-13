import { headers } from "next/headers";

import { AuthShell } from "@/components/auth/auth-shell";
import { InvitationAcceptanceView } from "@/components/auth/invitation-acceptance-view";
import { resolveSchoolBranding } from "@/lib/auth/school-branding";

export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const resolution = resolveSchoolBranding(host);
  const params = await searchParams;

  return (
    <AuthShell
      eyebrow="Invitation activation"
      heroTitle={resolution.branding.name}
      heroDescription="Your school administrator invited you into a tenant-isolated ERP workspace."
      badge="Secure account setup"
      logoMark={resolution.branding.logoMark}
      helper="Invitations expire automatically and can only be used once."
      highlights={[
        { id: "invited-role", title: "Role assigned", description: "Your dashboard is determined by the role your school assigned." },
        { id: "private-password", title: "Private password", description: "You create your password yourself. Administrators never see it." },
        { id: "tenant-safe", title: "Tenant safe", description: "Activation is bound to this school's workspace." },
      ]}
      trustNotes={[
        { id: "single-use", label: "Single-use invitation", icon: "lock" },
        { id: "tenant", label: "Tenant isolated", icon: "shield" },
      ]}
    >
      <InvitationAcceptanceView initialToken={params.token ?? ""} />
    </AuthShell>
  );
}

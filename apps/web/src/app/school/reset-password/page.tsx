import { headers } from "next/headers";

import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordView } from "@/components/auth/auth-recovery-view";
import { readResetToken, type ResetSearchParams } from "@/lib/auth/reset-token";
import { resolveSchoolBranding } from "@/lib/auth/school-branding";

export default async function SchoolResetPasswordPage({
  searchParams,
}: {
  searchParams?: ResetSearchParams;
}) {
  const requestHeaders = await headers();
  const initialToken = await readResetToken(searchParams);
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host");
  const resolution = resolveSchoolBranding(host);

  return (
    <AuthShell
      eyebrow="School password reset"
      heroTitle={`Create a new password for ${resolution.branding.shortName}`}
      heroDescription="Reset access in a way that feels safe, familiar, and easy for non-technical school teams."
      badge="Secure school reset"
      logoMark={resolution.branding.logoMark}
      helper="New passwords return staff directly to their school's isolated workspace."
      highlights={[
        { id: "simple-reset", title: "Simple reset", description: "Straightforward steps without exposing families or staff to confusing recovery UX." },
        { id: "school-aware", title: "School aware", description: "Reset actions stay inside the correct school tenant from start to finish." },
        { id: "support", title: "Support ready", description: "Admins can still help staff if they get locked out or lose access." },
      ]}
      trustNotes={[
        { id: "school-secure", label: "School secured", icon: "shield" },
        { id: "managed", label: "Managed reset", icon: "lock" },
      ]}
    >
      <ResetPasswordView
        title="Create your new school password"
        subtitle="Enter the recovery code from your school message, then choose a new password for your workspace."
        secretLabel="New password"
        secretPlaceholder="Create a new school password"
        backHref="/school/login"
        audience="school"
        tenantSlug={resolution.requestedSlug ?? resolution.branding.slug}
        initialToken={initialToken}
      />
    </AuthShell>
  );
}

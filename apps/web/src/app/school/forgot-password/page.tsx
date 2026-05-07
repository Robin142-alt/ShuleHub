import { headers } from "next/headers";

import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordView } from "@/components/auth/auth-recovery-view";
import { resolveSchoolBranding } from "@/lib/auth/school-branding";

export default async function SchoolForgotPasswordPage() {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host");
  const resolution = resolveSchoolBranding(host);

  return (
    <AuthShell
      eyebrow="School account recovery"
      heroTitle={`Recover access to ${resolution.branding.shortName}`}
      heroDescription="Help principals, bursars, teachers, and office teams get back into the school workspace without adding technical friction."
      badge="School password recovery"
      logoMark={resolution.branding.logoMark}
      helper="Recovery remains tenant-scoped so staff only regain access to the school that issued their credentials."
      highlights={[
        { id: "email-or-phone", title: "Email or phone", description: "Staff can start recovery with the identifier their school normally uses." },
        { id: "tenant-aware", title: "Tenant-aware", description: "Recovery messages always align to the school workspace, not the wider platform." },
        { id: "simple", title: "Simple enough for schools", description: "The flow stays clear and calm for day-to-day non-technical users." },
      ]}
      trustNotes={[
        { id: "scoped", label: "Tenant scoped", icon: "shield" },
        { id: "clear", label: "Simple flow", icon: "check" },
      ]}
    >
      <ForgotPasswordView
        title="Reset your school password"
        subtitle="Enter the email or phone number your school uses for your account. We will send reset instructions to your verified channel."
        identifierLabel="Email or phone number"
        identifierPlaceholder="principal@school.ac.ke or 0712 345 678"
        submitLabel="Send reset instructions"
        backHref="/school/login"
        successMessage="If the details match a school account, reset instructions are on the way."
      />
    </AuthShell>
  );
}

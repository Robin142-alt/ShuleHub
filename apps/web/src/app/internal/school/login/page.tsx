import { headers } from "next/headers";

import { AuthShell } from "@/components/auth/auth-shell";
import { SchoolLoginView } from "@/components/auth/school-login-view";
import { resolveSchoolBranding } from "@/lib/auth/school-branding";

export default async function InternalSchoolLoginPage() {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const resolution = resolveSchoolBranding(host);

  return (
    <AuthShell
      eyebrow="School staff login"
      heroTitle={resolution.branding.name}
      heroDescription={resolution.branding.heroMessage}
      badge={`${resolution.branding.county} school ERP`}
      logoMark={resolution.branding.logoMark}
      helper="Staff sign-in stays tenant aware, school branded, and easy enough for principals, bursars, teachers, and office teams to use every day."
      highlights={[
        {
          id: "collections",
          title: "Collections and M-PESA",
          description:
            "See fee collection tools and payment workflows in a familiar, trustworthy space.",
        },
        {
          id: "academics",
          title: "Academics and attendance",
          description:
            "Classroom operations stay one or two clicks away for non-technical school teams.",
        },
        {
          id: "tenant-security",
          title: "Tenant-isolated access",
          description:
            "Each school only enters its own workspace, branding, and operational data.",
        },
      ]}
      trustNotes={[
        { id: "tenant", label: "Tenant protected", icon: "shield" },
        { id: "branding", label: "School branded", icon: "check" },
        { id: "secure", label: "Secure session", icon: "lock" },
      ]}
    >
      <SchoolLoginView resolution={resolution} />
    </AuthShell>
  );
}

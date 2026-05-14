import { AuthShell } from "@/components/auth/auth-shell";
import { PublicSchoolLoginView } from "@/components/auth/public-school-login-view";
import { redirectPublicEntryToKnownSession } from "@/lib/routing/public-entry-session";

export default async function PublicLoginPage() {
  await redirectPublicEntryToKnownSession();

  return (
    <AuthShell
      eyebrow="School ERP sign-in"
      heroTitle="Run collections, academics, and school operations from one trusted workspace."
      heroDescription="ShuleHub is built for institutions that need fee clarity, operational control, and tenant-safe access from the first sign-in screen."
      badge="Institutional school access"
      logoMark="SH"
      helper="Every school signs into its own operational environment with finance-safe access controls, role-aware routing, and clear support paths."
      highlights={[
        {
          id: "finance",
          title: "Finance-first operations",
          description: "Collections, M-PESA, balances, and reporting stay visible and audit-friendly for bursars and school leaders.",
        },
        {
          id: "tenant",
          title: "Tenant-aware by design",
          description: "School branding, role access, and operational data load inside the correct tenant context automatically.",
        },
        {
          id: "trust",
          title: "Operationally trusted",
          description: "Built for the routines schools actually depend on every day, from learner records to statements and reconciliations.",
        },
      ]}
      trustNotes={[
        { id: "health", label: "Operational status monitored", icon: "check" },
        { id: "tenant", label: "Tenant isolated", icon: "shield" },
        { id: "session", label: "Secure session", icon: "lock" },
      ]}
    >
      <PublicSchoolLoginView />
    </AuthShell>
  );
}

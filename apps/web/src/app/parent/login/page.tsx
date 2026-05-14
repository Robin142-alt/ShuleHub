import { AuthShell } from "@/components/auth/auth-shell";
import { PortalLoginView } from "@/components/auth/portal-login-view";

export default function ParentLoginPage() {
  return (
    <AuthShell
      eyebrow="Parent portal login"
      heroTitle="Friendly access for learner progress, fee payments, and school communication."
      heroDescription="Parents get a clear, mobile-first portal with M-PESA payment context, balances, results, and trusted school notices."
      badge="Family access"
      logoMark="PT"
      helper="Parent sessions are linked only to verified learner profiles and family communication records."
      highlights={[
        {
          id: "payments",
          title: "M-PESA first",
          description: "Balances, recent payments, and instructions are easy to understand on phones.",
        },
        {
          id: "progress",
          title: "Learner progress",
          description: "Academic progress and school notices are visible without calling the school office.",
        },
        {
          id: "notices",
          title: "School notices",
          description: "Important updates and downloads live inside the same trusted portal.",
        },
      ]}
      trustNotes={[
        { id: "family-safe", label: "Private family access", icon: "shield" },
        { id: "mpesa", label: "Payment aware", icon: "check" },
        { id: "secure", label: "Secure session", icon: "lock" },
      ]}
    >
      <PortalLoginView mode="parent" />
    </AuthShell>
  );
}

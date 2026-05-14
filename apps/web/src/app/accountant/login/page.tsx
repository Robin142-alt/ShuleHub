import { AuthShell } from "@/components/auth/auth-shell";
import { PublicSchoolLoginView } from "@/components/auth/public-school-login-view";

export default function AccountantLoginPage() {
  return (
    <AuthShell
      eyebrow="Accountant login"
      heroTitle="Fintech-grade access for fee collection, reconciliation, and reporting."
      heroDescription="A secure finance entry point for accountants who manage revenue analytics, M-PESA collections, ledgers, statements, and audit evidence."
      badge="Finance operations"
      logoMark="AC"
      helper="Finance sessions prioritize transaction safety, device awareness, role permissions, and clear audit trails."
      highlights={[
        {
          id: "revenue",
          title: "Revenue analytics",
          description: "Monitor collection progress, arrears, and payment trends before entering the workspace.",
        },
        {
          id: "mpesa",
          title: "M-PESA insight",
          description: "Payment confirmations and reconciliation context stay finance-safe.",
        },
        {
          id: "audit",
          title: "Audit confidence",
          description: "Sensitive actions are permissioned, logged, and easy to review.",
        },
      ]}
      trustNotes={[
        { id: "finance-scope", label: "Finance scoped", icon: "shield" },
        { id: "audit", label: "Audit logged", icon: "check" },
        { id: "session", label: "Secure session", icon: "lock" },
      ]}
    >
      <PublicSchoolLoginView intent="accountant" />
    </AuthShell>
  );
}

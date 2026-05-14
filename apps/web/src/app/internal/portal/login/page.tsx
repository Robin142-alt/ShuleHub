import { AuthShell } from "@/components/auth/auth-shell";
import { PortalLoginView } from "@/components/auth/portal-login-view";

export default function InternalPortalLoginPage() {
  return (
    <AuthShell
      eyebrow="Parent and student portal"
      heroTitle="School access for families and learners."
      heroDescription="A calm, mobile-first portal for fees, academics, notices, and downloads that feels friendly from the first screen."
      badge="Portal access"
      logoMark="PT"
      helper="Parents only see linked learners, and students only see their own records, comments, balances, and messages."
      highlights={[
        {
          id: "fees",
          title: "Fees made clear",
          description:
            "Current balance, recent payments, and M-PESA instructions stay simple and visible.",
        },
        {
          id: "updates",
          title: "Daily visibility",
          description:
            "Families can check notices, results, and school updates without calling the school office first.",
        },
        {
          id: "friendly",
          title: "Friendly by default",
          description:
            "The portal is designed for phones first, with language non-technical users can trust immediately.",
        },
      ]}
      trustNotes={[
        { id: "family-safe", label: "Private family access", icon: "shield" },
        { id: "mobile-ready", label: "Mobile first", icon: "check" },
        { id: "secure-login", label: "Secure login", icon: "lock" },
      ]}
    >
      <PortalLoginView />
    </AuthShell>
  );
}

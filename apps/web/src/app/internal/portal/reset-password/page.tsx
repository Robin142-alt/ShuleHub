import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordView } from "@/components/auth/auth-recovery-view";
import { readResetToken, type ResetSearchParams } from "@/lib/auth/reset-token";

export default async function InternalPortalResetPasswordPage({
  searchParams,
}: {
  searchParams?: ResetSearchParams;
}) {
  const initialToken = await readResetToken(searchParams);

  return (
    <AuthShell
      eyebrow="Portal reset"
      heroTitle="Choose a new portal password."
      heroDescription="A quick, friendly reset flow for parents and learners that still respects privacy and account safety."
      badge="Portal reset"
      logoMark="PT"
      helper="Short, clear reset steps help families recover without needing technical support from the school office."
      highlights={[
        { id: "guided", title: "Guided recovery", description: "Every step explains what to do next without jargon." },
        { id: "family-safe", title: "Family safe", description: "Only the verified portal contact can complete the reset." },
        { id: "fast", title: "Fast return", description: "Get back to fees, report cards, and school notices with minimal friction." },
      ]}
      trustNotes={[
        { id: "private-reset", label: "Private reset", icon: "shield" },
        { id: "simple-reset", label: "Simple flow", icon: "check" },
      ]}
    >
      <ResetPasswordView
        title="Create a new portal password"
        subtitle="Enter your recovery code, then choose a new password for the portal."
        secretLabel="New password"
        secretPlaceholder="Create a new portal password"
        backHref="/login"
        audience="portal"
        initialToken={initialToken}
      />
    </AuthShell>
  );
}

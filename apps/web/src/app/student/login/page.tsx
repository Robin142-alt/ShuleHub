import { AuthShell } from "@/components/auth/auth-shell";
import { PortalLoginView } from "@/components/auth/portal-login-view";

export default function StudentLoginPage() {
  return (
    <AuthShell
      eyebrow="Student login"
      heroTitle="A lightweight learning portal for assignments, results, and school updates."
      heroDescription="Students get a focused mobile-first entry into learning tasks, academic records, timetable context, and school notices."
      badge="Learning portal"
      logoMark="ST"
      helper="Student sessions are scoped to a single learner profile and never expose parent, finance, or staff workspaces."
      highlights={[
        {
          id: "assignments",
          title: "Assignments",
          description: "Open active class work, due dates, feedback, and learning resources quickly.",
        },
        {
          id: "results",
          title: "Results",
          description: "Track assessment outcomes and term progress from a clean dashboard.",
        },
        {
          id: "notices",
          title: "School updates",
          description: "Receive academic reminders and school announcements in one place.",
        },
      ]}
      trustNotes={[
        { id: "learner-scope", label: "Learner scoped", icon: "shield" },
        { id: "friendly", label: "Student friendly", icon: "check" },
        { id: "secure", label: "Secure access", icon: "lock" },
      ]}
    >
      <PortalLoginView mode="student" />
    </AuthShell>
  );
}

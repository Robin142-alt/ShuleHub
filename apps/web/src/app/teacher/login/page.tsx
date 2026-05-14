import { AuthShell } from "@/components/auth/auth-shell";
import { PublicSchoolLoginView } from "@/components/auth/public-school-login-view";

export default function TeacherLoginPage() {
  return (
    <AuthShell
      eyebrow="Teacher login"
      heroTitle="Move from timetable to marks entry without friction."
      heroDescription="A fast academic workspace for teachers who need class context, assignment workflows, and CBC-ready records on any device."
      badge="Academic operations"
      logoMark="TR"
      helper="Teacher access is scoped to assigned classes, subjects, timetable events, and academic workflows."
      highlights={[
        {
          id: "timetable",
          title: "Timetable ready",
          description: "Upcoming lessons, room context, and class actions stay visible from sign-in.",
        },
        {
          id: "assignments",
          title: "Assignment flow",
          description: "Create, review, and follow up on class work with fewer handoffs.",
        },
        {
          id: "academics",
          title: "Academic insights",
          description: "Learner progress, subject context, and classroom patterns stay easy to scan.",
        },
      ]}
      trustNotes={[
        { id: "class-scope", label: "Class scoped", icon: "shield" },
        { id: "mobile", label: "Mobile first", icon: "check" },
        { id: "session", label: "Secure session", icon: "lock" },
      ]}
    >
      <PublicSchoolLoginView intent="teacher" />
    </AuthShell>
  );
}

import { AuthShell } from "@/components/auth/auth-shell";
import { SuperadminLoginView } from "@/components/auth/superadmin-login-view";

export default function SupportStaffLoginPage() {
  return (
    <AuthShell
      eyebrow="Support staff login"
      heroTitle="Resolve tenant issues with SLA context, ticket queues, and operational visibility."
      heroDescription="Internal support teams enter a control-center experience for customer replies, escalations, tenant health, incidents, and recurring issue patterns."
      badge="Support operations"
      logoMark="SP"
      helper="Support actions are role protected, internally audited, and separated from school-facing user access."
      highlights={[
        {
          id: "tickets",
          title: "Ticket queue",
          description: "Open, escalated, breached, and waiting tickets stay visible from the first screen.",
        },
        {
          id: "sla",
          title: "SLA dashboard",
          description: "Response and resolution clocks help agents focus on the right tenant issue.",
        },
        {
          id: "incidents",
          title: "Incident context",
          description: "Platform health and repeated module issues are surfaced before support enters the queue.",
        },
      ]}
      trustNotes={[
        { id: "agent-scope", label: "Agent scoped", icon: "shield" },
        { id: "internal-notes", label: "Internal audit", icon: "check" },
        { id: "session", label: "Secure session", icon: "lock" },
      ]}
    >
      <SuperadminLoginView variant="support" />
    </AuthShell>
  );
}

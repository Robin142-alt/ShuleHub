import { AuthShell } from "@/components/auth/auth-shell";
import { AuthStateView, type AuthStateKind } from "@/components/auth/auth-state-view";

const stateHero: Record<
  AuthStateKind,
  {
    eyebrow: string;
    title: string;
    description: string;
    badge: string;
  }
> = {
  "verify-email": {
    eyebrow: "Verify email",
    title: "Secure account verification before workspace access.",
    description:
      "Email verification confirms account ownership before sensitive school or platform records are opened.",
    badge: "Identity security",
  },
  mfa: {
    eyebrow: "Security verification",
    title: "Additional verification keeps privileged workspaces protected.",
    description:
      "Sensitive school, finance, support, and platform sessions can route through stronger checks as security policies are enabled.",
    badge: "Security check",
  },
  otp: {
    eyebrow: "OTP entry",
    title: "One-time codes add a second layer to secure sign-in.",
    description:
      "Short-lived verification codes protect recovery, device checks, and sensitive sign-in events.",
    badge: "Verification",
  },
  device: {
    eyebrow: "Device context",
    title: "Device context keeps high-trust school workflows easier to review.",
    description:
      "New browser and workstation details can be surfaced clearly as stronger device policies are enabled.",
    badge: "Session context",
  },
  locked: {
    eyebrow: "Account locked",
    title: "Risk-aware account protection without confusing users.",
    description:
      "Locked account states explain what happened, avoid leaking account details, and guide safe recovery.",
    badge: "Risk controls",
  },
  expired: {
    eyebrow: "Session expired",
    title: "Session expiration is clear, calm, and recoverable.",
    description:
      "Inactive sessions close automatically while keeping users oriented about how to continue securely.",
    badge: "Session security",
  },
  unauthorized: {
    eyebrow: "Unauthorized",
    title: "Access control states that feel operational, not broken.",
    description:
      "Users understand when a valid account lacks the role, tenant, or module permission requested.",
    badge: "Access control",
  },
  invite: {
    eyebrow: "Invite acceptance",
    title: "Secure invitations connect users to the right school role.",
    description:
      "New users accept a verified invite, confirm identity, and set their first password in a protected flow.",
    badge: "User onboarding",
  },
  "new-password": {
    eyebrow: "Password setup",
    title: "New passwords are guided by secure enterprise UX.",
    description:
      "Password setup explains requirements clearly while avoiding unsafe hints or credential exposure.",
    badge: "Password security",
  },
  tenant: {
    eyebrow: "Tenant selection",
    title: "School workspace selection keeps multi-tenant access clear.",
    description:
      "Institution users enter through the correct tenant before role-based access is evaluated.",
    badge: "Tenant access",
  },
  "magic-link": {
    eyebrow: "Magic link",
    title: "Passwordless verification stays calm and security aware.",
    description:
      "Magic-link states confirm the next step without exposing whether an account exists.",
    badge: "Passwordless",
  },
  "access-denied": {
    eyebrow: "Access denied",
    title: "Permission boundaries are firm, readable, and helpful.",
    description:
      "Denied states protect data while guiding users toward administrators or the correct account.",
    badge: "Permission control",
  },
  maintenance: {
    eyebrow: "Maintenance mode",
    title: "Maintenance states preserve confidence during platform work.",
    description:
      "Schools see a professional operations message when sign-in is intentionally limited.",
    badge: "Operational status",
  },
  offline: {
    eyebrow: "Offline state",
    title: "Connectivity states are clear before authentication begins.",
    description:
      "Users understand network failures without confusing them with account or password problems.",
    badge: "Connectivity",
  },
  "not-found": {
    eyebrow: "Auth 404",
    title: "Unknown authentication routes still feel like ShuleHub.",
    description:
      "Even missing auth links guide users back to the right school, portal, or platform entry point.",
    badge: "Route recovery",
  },
};

export function AuthStatePage({ kind }: { kind: AuthStateKind }) {
  const hero = stateHero[kind];

  return (
    <AuthShell
      eyebrow={hero.eyebrow}
      heroTitle={hero.title}
      heroDescription={hero.description}
      badge={hero.badge}
      logoMark="SH"
      helper="Authentication states use consistent language, accessible controls, and enterprise security patterns across ShuleHub."
      highlights={[
        {
          id: "csrf",
          title: "CSRF guarded",
          description: "Sensitive mutations use same-site session protection and CSRF verification.",
        },
        {
          id: "sessions",
          title: "Session aware",
          description: "Expiration, device checks, and locked states remain clear and recoverable.",
        },
        {
          id: "tenant",
          title: "Tenant safe",
          description: "School context and role boundaries are protected before dashboards load.",
        },
      ]}
      trustNotes={[
        { id: "secure", label: "Secure cookies", icon: "lock" },
        { id: "audit", label: "Audit ready", icon: "check" },
        { id: "tenant", label: "Tenant aware", icon: "shield" },
      ]}
    >
      <AuthStateView kind={kind} />
    </AuthShell>
  );
}

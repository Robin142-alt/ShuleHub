import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  KeyRound,
  LockKeyhole,
  MailCheck,
  PlugZap,
  ShieldAlert,
  ShieldCheck,
  WifiOff,
} from "lucide-react";

import { AuthCard } from "@/components/auth/auth-card";

export type AuthStateKind =
  | "verify-email"
  | "mfa"
  | "otp"
  | "device"
  | "locked"
  | "expired"
  | "unauthorized"
  | "invite"
  | "new-password"
  | "tenant"
  | "magic-link"
  | "access-denied"
  | "maintenance"
  | "offline"
  | "not-found";

const stateCopy: Record<
  AuthStateKind,
  {
    icon: LucideIcon;
    label: string;
    title: string;
    description: string;
    primaryHref: string;
    primaryLabel: string;
    secondaryHref?: string;
    secondaryLabel?: string;
  }
> = {
  "verify-email": {
    icon: MailCheck,
    label: "Email verification",
    title: "Confirm your email address",
    description:
      "Open the secure verification link sent to your inbox. The link expires automatically to protect account access.",
    primaryHref: "/login",
    primaryLabel: "Back to login",
  },
  mfa: {
    icon: ShieldCheck,
    label: "Multi-factor authentication",
    title: "Verification required",
    description:
      "Enter the current code from your authenticator app or use a recovery method approved by your administrator.",
    primaryHref: "/login",
    primaryLabel: "Return to sign-in",
  },
  otp: {
    icon: KeyRound,
    label: "One-time passcode",
    title: "Enter your one-time code",
    description:
      "Use the most recent code from your verification message. Older codes are rejected automatically.",
    primaryHref: "/login",
    primaryLabel: "Back to login",
  },
  device: {
    icon: LockKeyhole,
    label: "Device context",
    title: "Review this device",
    description:
      "Use a trusted phone, tablet, or managed workstation for school and platform access.",
    primaryHref: "/login",
    primaryLabel: "Continue securely",
  },
  locked: {
    icon: ShieldAlert,
    label: "Account locked",
    title: "Access is temporarily locked",
    description:
      "We paused sign-in attempts after unusual activity. Wait before trying again or start account recovery.",
    primaryHref: "/forgot-password",
    primaryLabel: "Recover account",
    secondaryHref: "/login",
    secondaryLabel: "Back to login",
  },
  expired: {
    icon: Clock3,
    label: "Session expired",
    title: "Your session has expired",
    description:
      "For security, inactive sessions close automatically. Sign in again to continue your work.",
    primaryHref: "/login",
    primaryLabel: "Sign in again",
  },
  unauthorized: {
    icon: ShieldAlert,
    label: "Unauthorized",
    title: "You are not authorized for this workspace",
    description:
      "Your account is valid, but it does not include permission for the requested school, module, or platform area.",
    primaryHref: "/login",
    primaryLabel: "Use another account",
  },
  invite: {
    icon: MailCheck,
    label: "Invite acceptance",
    title: "Accept your secure invitation",
    description:
      "Invitations bind your email, role, school workspace, and first password setup in one protected flow.",
    primaryHref: "/new-password",
    primaryLabel: "Set password",
    secondaryHref: "/login",
    secondaryLabel: "Back to login",
  },
  "new-password": {
    icon: KeyRound,
    label: "New password setup",
    title: "Create a secure password",
    description:
      "Choose a password that is unique to ShuleHub and meets your administrator's security requirements.",
    primaryHref: "/reset-password",
    primaryLabel: "Set password",
  },
  tenant: {
    icon: ShieldCheck,
    label: "Tenant selection",
    title: "Choose your school workspace",
    description:
      "School users must enter through the verified workspace assigned to their institution.",
    primaryHref: "/login",
    primaryLabel: "Find workspace",
  },
  "magic-link": {
    icon: MailCheck,
    label: "Magic link",
    title: "Check your email",
    description:
      "A secure sign-in link was sent if the account is eligible. Links expire quickly and work once.",
    primaryHref: "/login",
    primaryLabel: "Back to login",
  },
  "access-denied": {
    icon: ShieldAlert,
    label: "Access denied",
    title: "This action needs another permission",
    description:
      "Ask your administrator to update your role if you need access to this workspace or module.",
    primaryHref: "/login",
    primaryLabel: "Switch account",
  },
  maintenance: {
    icon: PlugZap,
    label: "Maintenance",
    title: "Authentication is in maintenance",
    description:
      "Sign-in is temporarily limited while the operations team completes scheduled security work.",
    primaryHref: "/login",
    primaryLabel: "Try again",
  },
  offline: {
    icon: WifiOff,
    label: "Offline",
    title: "Connection unavailable",
    description:
      "Check your internet connection. ShuleHub needs a secure connection before opening protected workspaces.",
    primaryHref: "/login",
    primaryLabel: "Retry sign-in",
  },
  "not-found": {
    icon: AlertTriangle,
    label: "Auth route not found",
    title: "This authentication page does not exist",
    description:
      "Use the correct school, portal, or platform sign-in route to continue.",
    primaryHref: "/login",
    primaryLabel: "Open login",
  },
};

export function AuthStateView({ kind }: { kind: AuthStateKind }) {
  const copy = stateCopy[kind];
  const Icon = copy.icon;

  return (
    <AuthCard>
      <div className="space-y-6 text-center">
        <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
          <Icon className="h-6 w-6" />
        </span>
        <div>
          <p className="text-sm font-bold text-emerald-700">{copy.label}</p>
          <h1 className="mt-3 text-3xl font-bold leading-tight text-slate-950">
            {copy.title}
          </h1>
          <p className="mt-3 text-sm leading-7 text-slate-600">
            {copy.description}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
            <p className="text-sm leading-6 text-slate-600">
              This flow uses secure cookies, CSRF checks, tenant-aware routing, and audit-friendly messaging.
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href={copy.primaryHref}
            className="inline-flex h-12 flex-1 items-center justify-center rounded-2xl bg-slate-950 px-4 text-sm font-bold text-white transition hover:bg-emerald-700"
          >
            {copy.primaryLabel}
          </Link>
          {copy.secondaryHref && copy.secondaryLabel ? (
            <Link
              href={copy.secondaryHref}
              className="inline-flex h-12 flex-1 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
            >
              {copy.secondaryLabel}
            </Link>
          ) : null}
        </div>
      </div>
    </AuthCard>
  );
}

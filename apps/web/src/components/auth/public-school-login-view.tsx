"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { BellRing, Building2, ShieldCheck } from "lucide-react";

import { AuthCard } from "@/components/auth/auth-card";
import { AuthCheckbox } from "@/components/auth/auth-checkbox";
import { AuthField } from "@/components/auth/auth-field";
import { AuthMessage } from "@/components/auth/auth-message";
import { AuthPasswordField } from "@/components/auth/auth-password-field";
import { AuthSubmitButton } from "@/components/auth/auth-submit-button";
import {
  resolveSchoolBrandingIdentifier,
  type SchoolBranding,
} from "@/lib/auth/school-branding";
import { useExperienceSession } from "@/lib/auth/use-experience-session";

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function SchoolIdentityPreview({
  branding,
}: {
  branding: SchoolBranding;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface-muted px-4 py-4">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-sm font-semibold text-foreground shadow-sm">
          {branding.logoMark}
        </span>
        <div>
          <p className="text-sm font-semibold text-foreground">{branding.name}</p>
          <p className="text-sm text-muted">{branding.county}</p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-white px-3 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
            Current term
          </p>
          <p className="mt-2 text-sm font-semibold text-foreground">Term 2 · 2026</p>
        </div>
        <div className="rounded-xl border border-border bg-white px-3 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
            Access status
          </p>
          <p className="mt-2 text-sm font-semibold text-foreground">Operational</p>
        </div>
        <div className="rounded-xl border border-border bg-white px-3 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
            Support line
          </p>
          <p className="mt-2 text-sm font-semibold text-foreground">{branding.supportPhone}</p>
        </div>
      </div>
    </div>
  );
}

export function PublicSchoolLoginView() {
  const router = useRouter();
  const [schoolAddress, setSchoolAddress] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [busy, setBusy] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const resolvedBranding = useMemo(
    () => resolveSchoolBrandingIdentifier(schoolAddress),
    [schoolAddress],
  );

  const authSession = useExperienceSession("school", {
    tenantSlug: resolvedBranding?.slug ?? null,
  });

  const submit = async () => {
    const nextErrors: Record<string, string> = {};
    const trimmedIdentifier = identifier.trim();
    const trimmedSchoolAddress = schoolAddress.trim();
    const looksLikeEmail = /\S+@\S+\.\S+/.test(trimmedIdentifier);
    const looksLikePhone = /^[0-9+\-() ]{9,}$/.test(trimmedIdentifier);

    if (!trimmedSchoolAddress) {
      nextErrors.schoolAddress = "Enter your school web address or tenant code.";
    } else if (!resolvedBranding) {
      nextErrors.schoolAddress =
        "We could not match that school address. Use your school subdomain or contact support.";
    }

    if (!trimmedIdentifier || (!looksLikeEmail && !looksLikePhone)) {
      nextErrors.identifier = "Use your school email or registered work phone number.";
    }

    if (password.trim().length < 8) {
      nextErrors.password = "Enter the password issued for your school workspace.";
    }

    setFieldErrors(nextErrors);
    setGeneralError(null);

    if (Object.keys(nextErrors).length > 0 || !resolvedBranding) {
      return;
    }

    setBusy(true);
    await wait(220);

    try {
      const result = await authSession.login({
        identifier: trimmedIdentifier,
        password,
        tenantSlug: resolvedBranding.slug,
      });
      void router.push(result.redirectTo ?? "/school/admin");
    } catch (loginError) {
      setGeneralError(
        loginError instanceof Error
          ? loginError.message
          : "Unable to sign in right now.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard>
      <div className="space-y-6">
        <div className="space-y-3">
          <span className="inline-flex rounded-full border border-border bg-surface-muted px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-muted">
            School operations access
          </span>
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-foreground">
              Sign in to your school operations workspace
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Secure access for principals, bursars, teachers, and office teams with tenant-aware routing and role-based sign-in.
            </p>
          </div>
        </div>

        <AuthMessage
          tone="info"
          title="Trusted institutional access"
          description="Financial workflows, attendance, academics, and communication stay inside your school's isolated workspace."
        />

        <div className="space-y-4">
          <AuthField
            label="School web address or code"
            placeholder="barakaacademy or greenfield.school"
            autoComplete="organization"
            value={schoolAddress}
            onChange={(event) => setSchoolAddress(event.target.value)}
            error={fieldErrors.schoolAddress}
            hint="Use the school link or tenant code your institution uses to sign in."
          />
          <AuthField
            label="Work email or phone number"
            placeholder="bursar@school.ac.ke or 0712 345 678"
            autoComplete="username"
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            error={fieldErrors.identifier}
          />
          <AuthPasswordField
            label="Password"
            autoComplete="current-password"
            placeholder="Enter your secure school password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={fieldErrors.password}
          />
        </div>

        {resolvedBranding ? <SchoolIdentityPreview branding={resolvedBranding} /> : null}

        <div className="flex items-center justify-between gap-3">
          <AuthCheckbox
            checked={rememberMe}
            onChange={(event) => setRememberMe(event.target.checked)}
            label="Keep this device signed in"
            description="Only use this on a trusted institutional or personal device."
          />
          <Link
            href="/school/forgot-password"
            className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
          >
            Forgot password?
          </Link>
        </div>

        {generalError ? (
          <AuthMessage
            tone="error"
            title="Unable to sign in"
            description={generalError}
          />
        ) : null}

        <AuthSubmitButton busy={busy} onClick={submit}>
          Sign in securely
        </AuthSubmitButton>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-border bg-surface-muted px-4 py-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-accent" />
              <p className="text-sm font-semibold text-foreground">Tenant protected</p>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted">
              School data and finance actions stay isolated per tenant.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-surface-muted px-4 py-4">
            <div className="flex items-center gap-2">
              <BellRing className="h-4 w-4 text-accent" />
              <p className="text-sm font-semibold text-foreground">Operational status</p>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted">
              Login, finance, and queue health are monitored continuously.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-surface-muted px-4 py-4">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-accent" />
              <p className="text-sm font-semibold text-foreground">Institution ready</p>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted">
              Designed for daily school use, not generic admin browsing.
            </p>
          </div>
        </div>

        <p className="text-xs leading-6 text-muted">
          Families use the school-issued portal link. Platform operations use a separate secured control-center address.
        </p>
      </div>
    </AuthCard>
  );
}

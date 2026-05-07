"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { AuthCard } from "@/components/auth/auth-card";
import { AuthCheckbox } from "@/components/auth/auth-checkbox";
import { AuthDemoCredentials } from "@/components/auth/auth-demo-credentials";
import { AuthField } from "@/components/auth/auth-field";
import { AuthMessage } from "@/components/auth/auth-message";
import { AuthPasswordField } from "@/components/auth/auth-password-field";
import { AuthSubmitButton } from "@/components/auth/auth-submit-button";
import {
  schoolDemoCredentials,
} from "@/lib/auth/demo-credentials";
import type { SchoolBrandingResolution } from "@/lib/auth/school-branding";
import { useExperienceSession } from "@/lib/auth/use-experience-session";

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function SchoolLoginView({
  resolution,
}: {
  resolution: SchoolBrandingResolution;
}) {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [busy, setBusy] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const authSession = useExperienceSession("school", {
    tenantSlug: resolution.requestedSlug ?? resolution.branding.slug,
  });

  const isTenantUnavailable = resolution.status === "unknown";
  const tenantMessage = useMemo(() => {
    if (resolution.status === "resolved") {
      return null;
    }

    if (resolution.status === "unknown") {
      return {
        tone: "error" as const,
        title: "Tenant not found",
        description:
          "We could not identify this school workspace from the link you used. Confirm the school address or contact support.",
      };
    }

    return {
      tone: "info" as const,
      title: "Review school workspace",
      description:
        "No tenant subdomain was detected, so this review environment is showing the default school branding profile.",
    };
  }, [resolution.status]);

  const submit = async () => {
    const nextErrors: Record<string, string> = {};
    const trimmedIdentifier = identifier.trim();
    const looksLikeEmail = /\S+@\S+\.\S+/.test(trimmedIdentifier);
    const looksLikePhone = /^[0-9+\-() ]{9,}$/.test(trimmedIdentifier);

    if (!trimmedIdentifier || (!looksLikeEmail && !looksLikePhone)) {
      nextErrors.identifier = "Use your work email or school phone number.";
    }

    if (password.trim().length < 8) {
      nextErrors.password = "Use the password given for your school workspace.";
    }

    setFieldErrors(nextErrors);
    setGeneralError(null);

    if (Object.keys(nextErrors).length > 0 || isTenantUnavailable) {
      return;
    }

    setBusy(true);
    await wait(250);

    try {
      const result = await authSession.login({
        identifier: trimmedIdentifier,
        password,
        tenantSlug: resolution.requestedSlug ?? resolution.branding.slug,
      });
      void router.push(result.redirectTo ?? "/dashboard");
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
          <div className="flex items-center gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-soft text-sm font-semibold text-foreground">
              {resolution.branding.logoMark}
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">{resolution.branding.name}</p>
              <p className="text-sm text-muted">{resolution.branding.county}</p>
            </div>
          </div>
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-foreground">
              Welcome back
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Sign in to continue to your school workspace.
            </p>
          </div>
        </div>

        {tenantMessage ? (
          <AuthMessage
            tone={tenantMessage.tone}
            title={tenantMessage.title}
            description={tenantMessage.description}
          />
        ) : (
          <AuthMessage
            tone="info"
            title="Tenant-isolated access"
            description="Your sign-in only opens your school's workspace, branding, data, and allowed role actions."
          />
        )}

        <div className="space-y-4">
          <AuthField
            label="Email or phone number"
            placeholder="principal@school.ac.ke or 0712 345 678"
            autoComplete="username"
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            error={fieldErrors.identifier}
            hint="Use the email or phone number your school registered for your account."
          />
          <AuthPasswordField
            label="Password"
            autoComplete="current-password"
            placeholder="Enter your school password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={fieldErrors.password}
          />
        </div>

        <AuthDemoCredentials
          title="Review staff access"
          subtitle="Choose a school role below to inspect the tenant workspace with controlled credentials."
          credentials={[
            {
              id: "principal",
              label: "Principal",
              identifier: schoolDemoCredentials.principal.identifier,
              password: schoolDemoCredentials.principal.password,
            },
            {
              id: "bursar",
              label: "Bursar",
              identifier: schoolDemoCredentials.bursar.identifier,
              password: schoolDemoCredentials.bursar.password,
            },
            {
              id: "teacher",
              label: "Teacher",
              identifier: schoolDemoCredentials.teacher.identifier,
              password: schoolDemoCredentials.teacher.password,
            },
            {
              id: "Admin",
              label: "Admin staff",
              identifier: schoolDemoCredentials.admin.identifier,
              password: schoolDemoCredentials.admin.password,
            },
          ]}
        />

        <div className="flex items-center justify-between gap-3">
          <AuthCheckbox
            checked={rememberMe}
            onChange={(event) => setRememberMe(event.target.checked)}
            label="Remember me"
          />
          <Link href="/forgot-password" className="text-sm font-medium text-foreground underline-offset-4 hover:underline">
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

        <AuthSubmitButton busy={busy} onClick={submit} disabled={isTenantUnavailable}>
          Sign in securely
        </AuthSubmitButton>

        <div className="rounded-2xl border border-border bg-surface-muted px-4 py-4">
          <p className="text-sm font-semibold text-foreground">Need help?</p>
          <p className="mt-2 text-sm leading-6 text-muted">
            Contact your school administrator or email{" "}
            <span className="font-medium text-foreground">
              {resolution.branding.supportEmail}
            </span>
            . School support line:{" "}
            <span className="font-medium text-foreground">
              {resolution.branding.supportPhone}
            </span>
            .
          </p>
        </div>
      </div>
    </AuthCard>
  );
}

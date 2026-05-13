"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AuthCard } from "@/components/auth/auth-card";
import { AuthField } from "@/components/auth/auth-field";
import { AuthMessage } from "@/components/auth/auth-message";
import { AuthPasswordField } from "@/components/auth/auth-password-field";
import { AuthSubmitButton } from "@/components/auth/auth-submit-button";
import { useExperienceSession } from "@/lib/auth/use-experience-session";

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function PortalLoginView() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const authSession = useExperienceSession("portal");

  const submit = async () => {
    const nextErrors: Record<string, string> = {};
    const trimmedIdentifier = identifier.trim();

    if (!trimmedIdentifier || trimmedIdentifier.length < 4) {
      nextErrors.identifier = "Use your admission number or your family phone number.";
    }

    if (secret.trim().length < 4) {
      nextErrors.secret = "Enter your password or 4-digit PIN.";
    }

    setFieldErrors(nextErrors);
    setGeneralError(null);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setBusy(true);
    await wait(220);

    try {
      const result = await authSession.login({
        identifier: trimmedIdentifier,
        password: secret,
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
          <span className="inline-flex rounded-full border border-border bg-surface-muted px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-muted">
            Family access
          </span>
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-foreground">
              Access your school portal
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Check balances, attendance, exams, and school messages with a simple secure login.
            </p>
          </div>
        </div>

        <AuthMessage
          tone="info"
          title="Private by design"
          description="Parents only see linked learners, and students only see their own records, reports, and school messages."
        />

        <div className="space-y-4">
          <AuthField
            label="Admission number or phone"
            placeholder="SH-24011 or 0712 345 678"
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            error={fieldErrors.identifier}
            hint="Parents can use the phone number linked to the school account."
          />
          <AuthPasswordField
            label="Password or PIN"
            placeholder="Enter your password or PIN"
            value={secret}
            onChange={(event) => setSecret(event.target.value)}
            error={fieldErrors.secret}
          />
        </div>

        {generalError ? (
          <AuthMessage
            tone="error"
            title="Portal sign-in failed"
            description={generalError}
          />
        ) : null}

        <AuthSubmitButton busy={busy} onClick={submit}>
          Open portal
        </AuthSubmitButton>

        <div className="flex items-center justify-between gap-3 text-sm">
          <Link href="/forgot-password" className="font-medium text-foreground underline-offset-4 hover:underline">
            Forgot password or PIN?
          </Link>
          <span className="text-muted">Friendly support for families and learners.</span>
        </div>
      </div>
    </AuthCard>
  );
}

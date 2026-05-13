"use client";

import Link from "next/link";
import { useState } from "react";

import { AuthCard } from "@/components/auth/auth-card";
import { AuthField } from "@/components/auth/auth-field";
import { AuthMessage } from "@/components/auth/auth-message";
import { AuthPasswordField } from "@/components/auth/auth-password-field";
import { AuthSubmitButton } from "@/components/auth/auth-submit-button";

export function ForgotPasswordView({
  title,
  subtitle,
  identifierLabel,
  identifierPlaceholder,
  submitLabel,
  backHref,
  successMessage,
}: {
  title: string;
  subtitle: string;
  identifierLabel: string;
  identifierPlaceholder: string;
  submitLabel: string;
  backHref: string;
  successMessage: string;
}) {
  const [identifier, setIdentifier] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!/\S+@\S+\.\S+/.test(identifier.trim())) {
      setError("Enter the email address tied to this account.");
      return;
    }

    setError(null);
    setBusy(true);

    try {
      const response = await fetch("/api/auth/password/forgot", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: identifier.trim() }),
      });
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.message ?? "Unable to start password recovery.");
      }

      setSuccess(true);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to start password recovery.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard>
      <div className="space-y-6">
        <div className="space-y-3">
          <h2 className="text-3xl font-bold tracking-tight text-foreground">{title}</h2>
          <p className="text-sm leading-6 text-muted">{subtitle}</p>
        </div>

        {success ? (
          <AuthMessage
            tone="success"
            title="Check your messages"
            description={successMessage}
          />
        ) : (
          <div className="space-y-4">
            <AuthField
              label={identifierLabel}
              placeholder={identifierPlaceholder}
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              error={error ?? undefined}
            />
            <AuthSubmitButton busy={busy} onClick={submit}>
              {submitLabel}
            </AuthSubmitButton>
          </div>
        )}

        <Link href={backHref} className="inline-flex text-sm font-medium text-foreground underline-offset-4 hover:underline">
          Back to login
        </Link>
      </div>
    </AuthCard>
  );
}

export function ResetPasswordView({
  title,
  subtitle,
  secretLabel,
  secretPlaceholder,
  backHref,
}: {
  title: string;
  subtitle: string;
  secretLabel: string;
  secretPlaceholder: string;
  backHref: string;
}) {
  const [code, setCode] = useState(() =>
    typeof window === "undefined"
      ? ""
      : new URLSearchParams(window.location.search).get("token") ?? "",
  );
  const [secret, setSecret] = useState("");
  const [confirmSecret, setConfirmSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);

  const submit = async () => {
    const nextErrors: Record<string, string> = {};

    if (code.trim().length < 4) {
      nextErrors.code = "Enter the reset token from your recovery message.";
    }

    if (secret.trim().length < 12) {
      nextErrors.secret = "Use at least 12 characters.";
    }

    if (confirmSecret !== secret) {
      nextErrors.confirmSecret = "The confirmation does not match the new secret.";
    }

    setFieldErrors(nextErrors);
    setGeneralError(null);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setBusy(true);

    try {
      const response = await fetch("/api/auth/password/reset", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token: code.trim(),
          password: secret,
        }),
      });
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.message ?? "Unable to reset this password.");
      }

      setSuccess(true);
    } catch (submitError) {
      setGeneralError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to reset this password.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard>
      <div className="space-y-6">
        <div className="space-y-3">
          <h2 className="text-3xl font-bold tracking-tight text-foreground">{title}</h2>
          <p className="text-sm leading-6 text-muted">{subtitle}</p>
        </div>

        {success ? (
          <AuthMessage
            tone="success"
            title="Password updated"
            description="Your account is ready. Return to login and continue securely."
          />
        ) : (
          <div className="space-y-4">
            <AuthField
              label="Recovery token"
              placeholder="Paste the token from your reset link"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              error={fieldErrors.code}
            />
            <AuthPasswordField
              label={secretLabel}
              placeholder={secretPlaceholder}
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
              error={fieldErrors.secret}
            />
            <AuthPasswordField
              label="Confirm new password"
              placeholder="Re-enter your new password"
              value={confirmSecret}
              onChange={(event) => setConfirmSecret(event.target.value)}
              error={fieldErrors.confirmSecret}
            />
            {generalError ? (
              <AuthMessage
                tone="error"
                title="Reset failed"
                description={generalError}
              />
            ) : null}
            <AuthSubmitButton busy={busy} onClick={submit}>
              Save new password
            </AuthSubmitButton>
          </div>
        )}

        <Link href={backHref} className="inline-flex text-sm font-medium text-foreground underline-offset-4 hover:underline">
          Back to login
        </Link>
      </div>
    </AuthCard>
  );
}

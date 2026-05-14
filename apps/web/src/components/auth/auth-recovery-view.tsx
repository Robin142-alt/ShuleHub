"use client";

import Link from "next/link";
import { useState } from "react";

import { AuthCard } from "@/components/auth/auth-card";
import { AuthField } from "@/components/auth/auth-field";
import { AuthMessage } from "@/components/auth/auth-message";
import { AuthPasswordField } from "@/components/auth/auth-password-field";
import { SecurityBadge, SessionWarning } from "@/components/auth/auth-security";
import { AuthSubmitButton } from "@/components/auth/auth-submit-button";
import {
  requestPasswordRecovery,
  resetPassword,
} from "@/lib/auth/recovery-client";

type RecoveryAudience = "superadmin" | "school" | "portal";
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ForgotPasswordView({
  title,
  subtitle,
  identifierLabel,
  identifierPlaceholder,
  submitLabel,
  backHref,
  successMessage,
  audience = "school",
  tenantSlug = null,
}: {
  title: string;
  subtitle: string;
  identifierLabel: string;
  identifierPlaceholder: string;
  submitLabel: string;
  backHref: string;
  successMessage: string;
  audience?: RecoveryAudience;
  tenantSlug?: string | null;
}) {
  const [identifier, setIdentifier] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const normalizedIdentifier = identifier.trim();

    if (!emailPattern.test(normalizedIdentifier)) {
      setError("Enter a valid email address for this account.");
      return;
    }

    setError(null);
    setBusy(true);

    try {
      await requestPasswordRecovery({
        audience,
        identifier: normalizedIdentifier,
        tenantSlug,
      });
      setSuccess(true);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to send recovery instructions right now.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard>
      <div className="space-y-6">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <SecurityBadge label="Secure recovery" tone="success" />
            <SecurityBadge label="Short-lived link" />
          </div>
          <h2 className="text-3xl font-bold leading-tight text-slate-950">{title}</h2>
          <p className="text-sm leading-6 text-slate-600">{subtitle}</p>
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
              autoComplete="username"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              error={error ?? undefined}
            />
            <AuthSubmitButton busy={busy} onClick={submit}>
              {submitLabel}
            </AuthSubmitButton>
          </div>
        )}

        <SessionWarning mode="normal" />

        <Link href={backHref} className="inline-flex text-sm font-bold text-slate-700 underline-offset-4 hover:text-emerald-700 hover:underline">
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
  audience = "school",
  tenantSlug = null,
  initialToken = "",
}: {
  title: string;
  subtitle: string;
  secretLabel: string;
  secretPlaceholder: string;
  backHref: string;
  audience?: RecoveryAudience;
  tenantSlug?: string | null;
  initialToken?: string;
}) {
  const [code, setCode] = useState(initialToken);
  const [secret, setSecret] = useState("");
  const [confirmSecret, setConfirmSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState(false);

  const submit = async () => {
    const nextErrors: Record<string, string> = {};

    if (code.trim().length < 4) {
      nextErrors.code = "Enter the reset code or token from your recovery message.";
    }

    if (
      secret.trim().length < 10 ||
      !/[A-Z]/.test(secret) ||
      !/[a-z]/.test(secret) ||
      !/\d/.test(secret)
    ) {
      nextErrors.secret =
        "Use at least 10 characters with uppercase, lowercase, and a number.";
    }

    if (confirmSecret !== secret) {
      nextErrors.confirmSecret = "The confirmation does not match the new password.";
    }

    setFieldErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setBusy(true);

    try {
      await resetPassword({
        audience,
        token: code.trim(),
        password: secret,
        tenantSlug,
      });
      setSuccess(true);
    } catch (submitError) {
      setFieldErrors({
        code:
          submitError instanceof Error
            ? submitError.message
            : "Unable to reset this password right now.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard>
      <div className="space-y-6">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <SecurityBadge label="Password policy" tone="success" />
            <SecurityBadge label="Verified code" />
          </div>
          <h2 className="text-3xl font-bold leading-tight text-slate-950">{title}</h2>
          <p className="text-sm leading-6 text-slate-600">{subtitle}</p>
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
              label="Recovery code"
              placeholder="Enter the code you received"
              autoComplete="one-time-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              error={fieldErrors.code}
            />
            <AuthPasswordField
              label={secretLabel}
              placeholder={secretPlaceholder}
              autoComplete="new-password"
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
              error={fieldErrors.secret}
            />
            <AuthPasswordField
              label="Confirm new password"
              placeholder="Re-enter your new password"
              autoComplete="new-password"
              value={confirmSecret}
              onChange={(event) => setConfirmSecret(event.target.value)}
              error={fieldErrors.confirmSecret}
            />
            <AuthSubmitButton busy={busy} onClick={submit}>
              Save new password
            </AuthSubmitButton>
          </div>
        )}

        <SessionWarning mode="normal" />

        <Link href={backHref} className="inline-flex text-sm font-bold text-slate-700 underline-offset-4 hover:text-emerald-700 hover:underline">
          Back to login
        </Link>
      </div>
    </AuthCard>
  );
}

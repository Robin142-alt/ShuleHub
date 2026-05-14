"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { AuthCard } from "@/components/auth/auth-card";
import { AuthField } from "@/components/auth/auth-field";
import { AuthMessage } from "@/components/auth/auth-message";
import { SecurityBadge, SessionWarning } from "@/components/auth/auth-security";
import { AuthSubmitButton } from "@/components/auth/auth-submit-button";
import { verifyEmail } from "@/lib/auth/email-verification-client";

export function VerifyEmailView({
  initialToken = "",
  backHref = "/login",
}: {
  initialToken?: string;
  backHref?: string;
}) {
  const [token, setToken] = useState(initialToken);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const autoSubmitted = useRef(false);

  const submitToken = useCallback(
    async (nextToken = token) => {
      const normalizedToken = nextToken.trim();

      if (normalizedToken.length < 4) {
        setError("Enter the verification code or open the link from your email.");
        return;
      }

      setError(null);
      setBusy(true);

      try {
        const payload = await verifyEmail({ token: normalizedToken });
        setSuccessMessage(payload?.message ?? "Email verified successfully.");
      } catch (submitError) {
        setError(
          submitError instanceof Error
            ? submitError.message
            : "Unable to verify this email right now.",
        );
      } finally {
        setBusy(false);
      }
    },
    [token],
  );

  useEffect(() => {
    if (!initialToken.trim() || autoSubmitted.current) {
      return;
    }

    autoSubmitted.current = true;
    void submitToken(initialToken);
  }, [initialToken, submitToken]);

  return (
    <AuthCard>
      <div className="space-y-6">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <SecurityBadge label="Email ownership" tone="success" />
            <SecurityBadge label="Single-use token" />
          </div>
          <h2 className="text-3xl font-bold leading-tight text-slate-950">Verify your email</h2>
          <p className="text-sm leading-6 text-slate-600">
            Use the secure link from your message or paste the verification token below.
          </p>
        </div>

        {successMessage ? (
          <AuthMessage
            tone="success"
            title="Email verified"
            description={successMessage}
          />
        ) : (
          <div className="space-y-4">
            <AuthField
              label="Verification token"
              placeholder="Paste your email verification token"
              autoComplete="one-time-code"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              error={error ?? undefined}
            />
            <AuthSubmitButton busy={busy} onClick={() => void submitToken()}>
              Verify email
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

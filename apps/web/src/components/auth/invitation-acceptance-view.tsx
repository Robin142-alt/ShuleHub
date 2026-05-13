"use client";

import Link from "next/link";
import { useState } from "react";

import { AuthCard } from "@/components/auth/auth-card";
import { AuthField } from "@/components/auth/auth-field";
import { AuthMessage } from "@/components/auth/auth-message";
import { AuthPasswordField } from "@/components/auth/auth-password-field";
import { AuthSubmitButton } from "@/components/auth/auth-submit-button";

export function InvitationAcceptanceView({
  initialToken,
}: {
  initialToken: string;
}) {
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [successPath, setSuccessPath] = useState<string | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function submit() {
    const nextErrors: Record<string, string> = {};

    if (displayName.trim().length < 2) {
      nextErrors.displayName = "Enter your full name as it should appear in the school workspace.";
    }

    if (password.trim().length < 12) {
      nextErrors.password = "Use at least 12 characters.";
    }

    if (confirmPassword !== password) {
      nextErrors.confirmPassword = "The password confirmation does not match.";
    }

    if (!initialToken) {
      nextErrors.token = "This invitation link is missing its secure token.";
    }

    setFieldErrors(nextErrors);
    setGeneralError(null);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setBusy(true);

    try {
      const response = await fetch("/api/auth/invitations/accept", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token: initialToken,
          password,
          display_name: displayName.trim(),
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { message?: string; redirect_to?: string }
        | null;

      if (!response.ok) {
        throw new Error(payload?.message ?? "Unable to accept this invitation.");
      }

      setSuccessPath(payload?.redirect_to ?? "/login");
    } catch (error) {
      setGeneralError(
        error instanceof Error
          ? error.message
          : "Unable to accept this invitation.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard>
      <div className="space-y-6">
        <div className="space-y-3">
          <h2 className="text-3xl font-bold tracking-tight text-foreground">
            Activate your school account
          </h2>
          <p className="text-sm leading-6 text-muted">
            Confirm your name and create a private password. Your role and tenant access come from the invitation.
          </p>
        </div>

        {successPath ? (
          <AuthMessage
            tone="success"
            title="Account activated"
            description="Your password is set and your school account is ready."
          />
        ) : (
          <div className="space-y-4">
            {fieldErrors.token ? (
              <AuthMessage tone="error" title="Invalid invitation" description={fieldErrors.token} />
            ) : null}
            <AuthField
              label="Full name"
              placeholder="Jane Njeri"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              error={fieldErrors.displayName}
            />
            <AuthPasswordField
              label="Password"
              placeholder="Create a secure password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              error={fieldErrors.password}
            />
            <AuthPasswordField
              label="Confirm password"
              placeholder="Re-enter your password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              error={fieldErrors.confirmPassword}
            />
            {generalError ? (
              <AuthMessage tone="error" title="Activation failed" description={generalError} />
            ) : null}
            <AuthSubmitButton busy={busy} onClick={submit}>
              Activate account
            </AuthSubmitButton>
          </div>
        )}

        <Link href={successPath ?? "/login"} className="inline-flex text-sm font-medium text-foreground underline-offset-4 hover:underline">
          Continue to login
        </Link>
      </div>
    </AuthCard>
  );
}

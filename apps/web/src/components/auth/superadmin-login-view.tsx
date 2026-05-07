"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AuthCard } from "@/components/auth/auth-card";
import { AuthCheckbox } from "@/components/auth/auth-checkbox";
import { AuthDemoCredentials } from "@/components/auth/auth-demo-credentials";
import { AuthField } from "@/components/auth/auth-field";
import { AuthMessage } from "@/components/auth/auth-message";
import { AuthPasswordField } from "@/components/auth/auth-password-field";
import { AuthSubmitButton } from "@/components/auth/auth-submit-button";
import { superadminDemoCredentials } from "@/lib/auth/demo-credentials";
import { useExperienceSession } from "@/lib/auth/use-experience-session";

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function SuperadminLoginView() {
  const router = useRouter();
  const [step, setStep] = useState<"credentials" | "verify">("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [trustDevice, setTrustDevice] = useState(true);
  const [busy, setBusy] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const authSession = useExperienceSession("superadmin");

  const submitCredentials = async () => {
    const nextErrors: Record<string, string> = {};

    if (!/\S+@\S+\.\S+/.test(email.trim())) {
      nextErrors.email = "Enter a valid work email address.";
    }

    if (password.trim().length < 8) {
      nextErrors.password = "Use a password with at least 8 characters.";
    }

    setFieldErrors(nextErrors);
    setGeneralError(null);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setBusy(true);
    await wait(250);
    setBusy(false);

    if (
      email.trim().toLowerCase() !== superadminDemoCredentials.email ||
      password !== superadminDemoCredentials.password
    ) {
      setGeneralError(
        "Use the listed platform owner review credentials to enter this secured workspace.",
      );
      return;
    }

    setStep("verify");
  };

  const submitVerification = async () => {
    const nextErrors: Record<string, string> = {};

    if (!/^\d{6}$/.test(verificationCode.trim())) {
      nextErrors.verificationCode = "Enter the 6-digit verification code from your authenticator app.";
    }

    setFieldErrors(nextErrors);
    setGeneralError(null);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setBusy(true);
    await wait(300);
    setBusy(false);

    if (verificationCode.trim() !== superadminDemoCredentials.verificationCode) {
      setGeneralError(
        "Use the listed verification code to complete the protected sign-in.",
      );
      return;
    }

    try {
      const result = await authSession.login({
        identifier: email.trim(),
        password,
        verificationCode: verificationCode.trim(),
      });
      void router.push(result.redirectTo ?? "/dashboard");
    } catch (loginError) {
      setGeneralError(
        loginError instanceof Error
          ? loginError.message
          : "Unable to sign in right now.",
      );
    }
  };

  return (
    <AuthCard>
      <div className="space-y-6">
        <div className="space-y-3">
          <span className="inline-flex rounded-full border border-border bg-surface-muted px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-muted">
            Secure platform access
          </span>
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-foreground">
              Platform Control Center
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Sign in with your platform account, then verify the session before entering global tenant controls.
            </p>
          </div>
        </div>

        {step === "credentials" ? (
          <>
            <AuthMessage
              tone="info"
              title="Protected workspace"
              description="Every super admin session is audited, 2FA-protected, and isolated from tenant-facing access."
            />
            <div className="space-y-4">
              <AuthField
                label="Email"
                type="email"
                autoComplete="email"
                placeholder="owner@shulehub.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                error={fieldErrors.email}
              />
              <AuthPasswordField
                label="Password"
                autoComplete="current-password"
                placeholder="Enter your platform password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                error={fieldErrors.password}
              />
            </div>

            <AuthDemoCredentials
              title="Review access"
              subtitle="Use these controlled review credentials to inspect the platform owner workspace."
              credentials={[
                {
                  id: "platform-owner",
                  label: "Platform owner",
                  identifier: superadminDemoCredentials.email,
                  password: superadminDemoCredentials.password,
                  auxiliaryLabel: "Verification code",
                  auxiliaryValue: superadminDemoCredentials.verificationCode,
                },
              ]}
            />

            <div className="rounded-2xl border border-border bg-surface-muted px-4 py-4">
              <p className="text-sm font-semibold text-foreground">Recent sign-in</p>
              <p className="mt-2 text-sm leading-6 text-muted">
                Last confirmed device: Nairobi, Kenya • Chrome on Windows • 08:42 EAT
              </p>
            </div>

            {generalError ? (
              <AuthMessage
                tone="error"
                title="Sign-in failed"
                description={generalError}
              />
            ) : null}

            <AuthSubmitButton busy={busy} onClick={submitCredentials}>
              Continue securely
            </AuthSubmitButton>

            <div className="flex items-center justify-between gap-3 text-sm">
              <Link href="/forgot-password" className="font-medium text-foreground underline-offset-4 hover:underline">
                Forgot password?
              </Link>
              <span className="text-muted">Only authorized platform staff can access this area.</span>
            </div>
          </>
        ) : (
          <>
            <AuthMessage
              tone="success"
              title="Credentials confirmed"
              description="Enter the code from your authenticator app to finish securing this session."
            />
            <div className="space-y-4">
              <AuthField
                label="6-digit verification code"
                inputMode="numeric"
                placeholder="123456"
                value={verificationCode}
                onChange={(event) => setVerificationCode(event.target.value)}
                error={fieldErrors.verificationCode}
              />
              <AuthCheckbox
                checked={trustDevice}
                onChange={(event) => setTrustDevice(event.target.checked)}
                label="Trust this device for 30 days"
                description="Only use this on a secure personal or company-managed device."
              />
            </div>

            <div className="rounded-2xl border border-border bg-surface-muted px-4 py-4">
              <p className="text-sm font-semibold text-foreground">Session protection</p>
              <p className="mt-2 text-sm leading-6 text-muted">
                You can review active sessions and revoke old devices after you sign in.
              </p>
            </div>

            {generalError ? (
              <AuthMessage
                tone="error"
                title="Verification failed"
                description={generalError}
              />
            ) : null}

            <AuthSubmitButton busy={busy} onClick={submitVerification}>
              Verify and continue
            </AuthSubmitButton>

            <button
              type="button"
              onClick={() => {
                setStep("credentials");
                setVerificationCode("");
                setFieldErrors({});
              }}
              className="w-full text-sm font-medium text-muted underline-offset-4 hover:text-foreground hover:underline"
            >
              Back to password step
            </button>
          </>
        )}

        <p className="text-xs leading-6 text-muted">
          By continuing, you agree to platform session monitoring, audit logging, and device verification requirements.
        </p>
      </div>
    </AuthCard>
  );
}

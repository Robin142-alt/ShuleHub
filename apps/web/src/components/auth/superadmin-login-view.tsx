"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { z } from "zod";

import { AuthCard } from "@/components/auth/auth-card";
import { AuthCheckbox } from "@/components/auth/auth-checkbox";
import { AuthField } from "@/components/auth/auth-field";
import { AuthMessage } from "@/components/auth/auth-message";
import { AuthPasswordField } from "@/components/auth/auth-password-field";
import {
  MobileTrustRow,
  SecurityBadge,
  SessionWarning,
} from "@/components/auth/auth-security";
import { AuthSubmitButton } from "@/components/auth/auth-submit-button";
import { useExperienceSession } from "@/lib/auth/use-experience-session";

const credentialsSchema = z.object({
  email: z.string().email("Enter your platform email address."),
  password: z.string().min(8, "Enter your platform password."),
});

export function SuperadminLoginView({
  variant = "platform",
}: {
  variant?: "platform" | "support";
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberSession, setRememberSession] = useState(true);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const authSession = useExperienceSession("superadmin");
  const copy =
    variant === "support"
      ? {
          primaryBadge: "Support staff",
          title: "Support operations access",
          description:
            "Open the internal support control center for tickets, SLA queues, tenant incidents, and customer replies.",
          messageTitle: "Internal support workspace",
          message:
            "Support sessions are protected with CSRF validation, device context, and audit-ready action trails.",
        }
      : {
          primaryBadge: "Platform owner",
          title: "Welcome back",
          description:
            "Continue to the platform control center with session-managed secure access.",
          messageTitle: "High-privilege workspace",
          message:
            "Platform access is protected with CSRF validation, session binding, and audit-ready event capture.",
        };
  const submitCredentials = async (form?: HTMLFormElement | null) => {
    const emailInput = form?.elements.namedItem("email");
    const passwordInput = form?.elements.namedItem("password");
    const nextEmail =
      emailInput instanceof HTMLInputElement ? emailInput.value.trim() : email.trim();
    const nextPassword =
      passwordInput instanceof HTMLInputElement ? passwordInput.value : password;
    const parsed = credentialsSchema.safeParse({
      email: nextEmail,
      password: nextPassword,
    });

    if (!parsed.success) {
      const flattened = parsed.error.flatten().fieldErrors;
      setFieldErrors({
        email: flattened.email?.[0] ?? "",
        password: flattened.password?.[0] ?? "",
      });
      return;
    }

    setFieldErrors({});
    setGeneralError(null);

    try {
      const result = await authSession.login({
        identifier: nextEmail,
        password: nextPassword,
      });
      void router.push(result.redirectTo ?? "/superadmin");
    } catch (loginError) {
      setGeneralError(
        loginError instanceof Error
          ? loginError.message
          : "We could not complete this secure sign-in.",
      );
    }
  };

  return (
    <AuthCard>
      <div className="space-y-6">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <SecurityBadge label={copy.primaryBadge} tone="success" />
            <SecurityBadge label="Email verified" />
            <SecurityBadge label="Audit logged" />
          </div>
          <div>
            <h2 className="text-3xl font-bold leading-tight text-slate-950">
              {copy.title}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {copy.description}
            </p>
          </div>
        </div>

        <MobileTrustRow />

        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            void submitCredentials(event.currentTarget);
          }}
        >
          <AuthMessage
            tone="info"
            title={copy.messageTitle}
            description={copy.message}
          />

          <div className="space-y-4">
            <AuthField
              label="Email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              error={fieldErrors.email || undefined}
            />
            <AuthPasswordField
              label="Password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              error={fieldErrors.password || undefined}
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <AuthCheckbox
              checked={rememberSession}
              onChange={(event) => setRememberSession(event.target.checked)}
              label="Remember session"
            />
            <Link
              href="/superadmin/forgot-password"
              className="text-sm font-bold text-slate-700 underline-offset-4 hover:text-emerald-700 hover:underline"
            >
              Forgot password?
            </Link>
          </div>

          <SessionWarning mode="normal" />

          {generalError ? (
            <AuthMessage tone="error" title="Sign-in blocked" description={generalError} />
          ) : null}

          <AuthSubmitButton
            busy={authSession.isSubmitting}
            type="submit"
          >
            Continue securely
          </AuthSubmitButton>
        </form>

        <p className="text-xs leading-6 text-slate-500">
          ShuleHub never asks users to share passwords or verification codes.
        </p>
      </div>
    </AuthCard>
  );
}

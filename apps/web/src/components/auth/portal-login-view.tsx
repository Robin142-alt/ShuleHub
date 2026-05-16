"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Smartphone } from "lucide-react";

import { AuthCard } from "@/components/auth/auth-card";
import { AuthField } from "@/components/auth/auth-field";
import { AuthMessage } from "@/components/auth/auth-message";
import { AuthPasswordField } from "@/components/auth/auth-password-field";
import { MobileTrustRow, SecurityBadge } from "@/components/auth/auth-security";
import { AuthSubmitButton } from "@/components/auth/auth-submit-button";
import { getCsrfToken } from "@/lib/auth/csrf-client";
import { useExperienceSession } from "@/lib/auth/use-experience-session";

const portalSchema = z.object({
  identifier: z.string().trim().min(5, "Enter your phone number or email address."),
  secret: z.string(),
});

type PortalForm = z.infer<typeof portalSchema>;

type PortalMode = "family" | "parent" | "student";

const portalCopy: Record<
  PortalMode,
  {
    badge: string;
    title: string;
    description: string;
    identifierLabel: string;
    secretLabel: string;
    submitLabel: string;
    message: string;
  }
> = {
  family: {
    badge: "Family portal",
    title: "Access your school portal",
    description:
      "Check fees, exam results, notices, and downloads from a friendly mobile-first workspace.",
    identifierLabel: "Portal email address",
    secretLabel: "Password",
    submitLabel: "Open portal",
    message:
      "Parents only see linked learners, and students only see their own records and school messages.",
  },
  parent: {
    badge: "Parent access",
    title: "Follow progress and payments",
    description:
      "A secure parent login for fee balances, M-PESA guidance, announcements, and learner progress.",
    identifierLabel: "Parent email address",
    secretLabel: "Password",
    submitLabel: "Continue as parent",
    message:
      "Payment context and learner records stay private to the verified family profile.",
  },
  student: {
    badge: "Student access",
    title: "Open your learning portal",
    description:
      "A focused student login for assignments, results, timetable, notices, and academic downloads.",
    identifierLabel: "Student email address",
    secretLabel: "Password",
    submitLabel: "Continue as student",
    message:
      "Students only see their own timetable, assignments, performance records, and notices.",
  },
};

export function PortalLoginView({ mode = "family" }: { mode?: PortalMode }) {
  const router = useRouter();
  const authSession = useExperienceSession("portal");
  const [loginMode, setLoginMode] = useState<"password" | "otp">("password");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [otpMessage, setOtpMessage] = useState<string | null>(null);
  const [otpError, setOtpError] = useState<string | null>(null);
  const copy = portalCopy[mode];
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PortalForm>({
    resolver: zodResolver(portalSchema),
    defaultValues: {
      identifier: "",
      secret: "",
    },
  });

  const submit = handleSubmit(async (values) => {
    try {
      if (loginMode === "otp") {
        setOtpError(null);

        if (!challengeId) {
          const response = await fetch("/api/auth/parent/otp/request", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-shulehub-csrf": await getCsrfToken(),
            },
            credentials: "same-origin",
            body: JSON.stringify({ identifier: values.identifier.trim() }),
          });
          const payload = (await response.json().catch(() => null)) as
            | { challenge_id?: string; message?: string }
            | null;

          if (!response.ok) {
            throw new Error(payload?.message ?? "Unable to send a verification code.");
          }

          setChallengeId(payload?.challenge_id ?? null);
          setOtpMessage(payload?.message ?? "If a parent account exists, a code has been sent.");
          return;
        }

        const response = await fetch("/api/auth/parent/otp/verify", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-shulehub-csrf": await getCsrfToken(),
          },
          credentials: "same-origin",
          body: JSON.stringify({
            challenge_id: challengeId,
            otp_code: values.secret.trim(),
          }),
        });
        const payload = (await response.json().catch(() => null)) as
          | { redirectTo?: string; message?: string }
          | null;

        if (!response.ok) {
          throw new Error(payload?.message ?? "Unable to verify that code.");
        }

        void router.push(payload?.redirectTo ?? "/portal/parent");
        return;
      }

      const result = await authSession.login({
        identifier: values.identifier.trim(),
        password: values.secret,
      });
      void router.push(result.redirectTo ?? "/dashboard");
    } catch (error) {
      setOtpError(error instanceof Error ? error.message : "Unable to sign in right now.");
    }
  });

  return (
    <AuthCard>
      <form className="space-y-6" onSubmit={submit}>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <SecurityBadge label={copy.badge} tone="success" />
            <SecurityBadge label="Private records" />
            <SecurityBadge label="M-PESA ready" />
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

        <AuthMessage
          tone="info"
          title="Private by design"
          description={loginMode === "otp" ? "Parents can receive a one-time code by SMS where a phone number is linked by the school." : copy.message}
        />

        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1 text-sm font-bold text-slate-600">
          <button
            type="button"
            className={`rounded-xl px-3 py-2 transition ${loginMode === "password" ? "bg-white text-slate-950 shadow-sm" : "hover:text-slate-950"}`}
            onClick={() => {
              setLoginMode("password");
              setChallengeId(null);
              setOtpError(null);
              setOtpMessage(null);
            }}
          >
            Password
          </button>
          <button
            type="button"
            className={`rounded-xl px-3 py-2 transition ${loginMode === "otp" ? "bg-white text-slate-950 shadow-sm" : "hover:text-slate-950"}`}
            onClick={() => {
              setLoginMode("otp");
              setChallengeId(null);
              setOtpError(null);
              setOtpMessage(null);
            }}
          >
            SMS code
          </button>
        </div>

        <div className="space-y-4">
          <AuthField
            label={loginMode === "otp" ? "Phone number or email" : copy.identifierLabel}
            autoComplete={loginMode === "otp" ? "username" : "email"}
            {...register("identifier")}
            error={errors.identifier?.message}
          />
          <AuthPasswordField
            label={loginMode === "otp" && challengeId ? "Verification code" : copy.secretLabel}
            autoComplete={loginMode === "otp" ? "one-time-code" : "current-password"}
            {...register("secret")}
            error={errors.secret?.message}
          />
        </div>

        {otpMessage ? (
          <AuthMessage tone="success" title="Verification code sent" description={otpMessage} />
        ) : null}

        {authSession.error || otpError ? (
          <AuthMessage
            tone="error"
            title="Portal sign-in failed"
            description={otpError ?? authSession.error ?? "Unable to sign in right now."}
          />
        ) : null}

        <AuthSubmitButton busy={isSubmitting || authSession.isSubmitting} type="submit">
          {loginMode === "otp" ? (challengeId ? "Verify code" : "Send code") : copy.submitLabel}
        </AuthSubmitButton>

        <div className="flex items-center justify-between gap-3 text-sm">
          <Link
            href="/portal/forgot-password"
            className="font-bold text-slate-700 underline-offset-4 hover:text-emerald-700 hover:underline"
          >
            Forgot password?
          </Link>
          <span className="inline-flex items-center gap-2 text-slate-500">
            <Smartphone className="h-4 w-4" />
            Mobile optimized
          </span>
        </div>
      </form>
    </AuthCard>
  );
}

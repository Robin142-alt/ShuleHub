"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { useExperienceSession } from "@/lib/auth/use-experience-session";

const portalSchema = z.object({
  identifier: z.string().trim().email("Enter a valid portal email address."),
  secret: z.string().min(4, "Enter your portal password."),
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
      const result = await authSession.login({
        identifier: values.identifier.trim(),
        password: values.secret,
      });
      void router.push(result.redirectTo ?? "/dashboard");
    } catch {
      // useExperienceSession exposes the safe message.
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
          description={copy.message}
        />

        <div className="space-y-4">
          <AuthField
            label={copy.identifierLabel}
            autoComplete="email"
            {...register("identifier")}
            error={errors.identifier?.message}
          />
          <AuthPasswordField
            label={copy.secretLabel}
            autoComplete="current-password"
            {...register("secret")}
            error={errors.secret?.message}
          />
        </div>

        {authSession.error ? (
          <AuthMessage
            tone="error"
            title="Portal sign-in failed"
            description={authSession.error}
          />
        ) : null}

        <AuthSubmitButton busy={isSubmitting || authSession.isSubmitting} type="submit">
          {copy.submitLabel}
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

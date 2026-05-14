"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { AuthCard } from "@/components/auth/auth-card";
import { AuthCheckbox } from "@/components/auth/auth-checkbox";
import { AuthField } from "@/components/auth/auth-field";
import { AuthMessage } from "@/components/auth/auth-message";
import { AuthPasswordField } from "@/components/auth/auth-password-field";
import {
  MobileTrustRow,
  SecurityBadge,
  TenantSelector,
} from "@/components/auth/auth-security";
import { AuthSubmitButton } from "@/components/auth/auth-submit-button";
import { resolveSchoolBrandingIdentifier } from "@/lib/auth/school-branding";
import { useExperienceSession } from "@/lib/auth/use-experience-session";

const publicSchoolSchema = z.object({
  schoolAddress: z.string().trim().min(2, "Enter your school code or workspace address."),
  identifier: z
    .string()
    .trim()
    .email("Enter a valid work email address."),
  password: z.string().min(8, "Enter your workspace password."),
});

type PublicSchoolForm = z.infer<typeof publicSchoolSchema>;

type PublicSchoolIntent = "school" | "teacher" | "accountant";

const intentCopy: Record<
  PublicSchoolIntent,
  {
    badge: string;
    title: string;
    description: string;
    message: string;
  }
> = {
  school: {
    badge: "Institutional access",
    title: "Sign in to your school operations workspace",
    description:
      "Find the school workspace first, then continue with your role-aware staff account.",
    message:
      "Financial workflows, academics, support, and communication stay inside the verified school workspace.",
  },
  teacher: {
    badge: "Teacher access",
    title: "Open your teaching workspace",
    description:
      "Find your school workspace, then continue to timetable, marks entry, assignments, and class communication.",
    message:
      "Teacher access stays scoped to assigned classes, subjects, academic workflows, and school policies.",
  },
  accountant: {
    badge: "Finance access",
    title: "Open the finance workspace",
    description:
      "Find your school workspace, then continue to collections, statements, M-PESA reconciliation, and audit-ready reporting.",
    message:
      "Finance sessions prioritize device awareness, role permissions, transaction safety, and clear audit trails.",
  },
};

export function PublicSchoolLoginView({
  intent = "school",
}: {
  intent?: PublicSchoolIntent;
}) {
  const router = useRouter();
  const [schoolAddress, setSchoolAddress] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<PublicSchoolForm>({
    resolver: zodResolver(publicSchoolSchema),
    defaultValues: {
      schoolAddress: "",
      identifier: "",
      password: "",
    },
  });
  const resolvedBranding = useMemo(
    () => resolveSchoolBrandingIdentifier(schoolAddress),
    [schoolAddress],
  );
  const authSession = useExperienceSession("school", {
    tenantSlug: resolvedBranding?.slug ?? null,
  });
  const copy = intentCopy[intent];

  const submit = handleSubmit(async (values) => {
    if (!resolvedBranding) {
      setValue("schoolAddress", values.schoolAddress, {
        shouldValidate: true,
        shouldDirty: true,
      });
      return;
    }

    try {
      const result = await authSession.login({
        identifier: values.identifier.trim(),
        password: values.password,
        tenantSlug: resolvedBranding.slug,
      });
      void router.push(result.redirectTo ?? "/school/admin");
    } catch {
      // useExperienceSession exposes the safe message.
    }
  });

  return (
    <AuthCard size="wide">
      <form className="space-y-6" onSubmit={submit}>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <SecurityBadge label={copy.badge} tone="success" />
            <SecurityBadge label="Tenant selector" />
            <SecurityBadge label="Secure session" />
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
          title="Trusted institutional access"
          description={copy.message}
        />

        <div className="space-y-4">
          <TenantSelector
            value={schoolAddress}
            onChange={(value) => {
              setSchoolAddress(value);
              setValue("schoolAddress", value, {
                shouldDirty: true,
                shouldValidate: true,
              });
            }}
            error={
              errors.schoolAddress?.message ??
              (schoolAddress && !resolvedBranding
                ? "We could not match that school workspace."
                : undefined)
            }
          />
          <AuthField
            label="Work email address"
            autoComplete="email"
            {...register("identifier")}
            error={errors.identifier?.message}
          />
          <AuthPasswordField
            label="Password"
            autoComplete="current-password"
            {...register("password")}
            error={errors.password?.message}
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <AuthCheckbox
            checked={rememberMe}
            onChange={(event) => setRememberMe(event.target.checked)}
            label="Keep this session signed in"
            description="Only use this on a trusted institutional or personal workstation."
          />
          <Link
            href="/school/forgot-password"
            className="text-sm font-bold text-slate-700 underline-offset-4 hover:text-emerald-700 hover:underline"
          >
            Forgot password?
          </Link>
        </div>

        {authSession.error ? (
          <AuthMessage
            tone="error"
            title="Unable to sign in"
            description={authSession.error}
          />
        ) : null}

        <AuthSubmitButton
          busy={isSubmitting || authSession.isSubmitting}
          type="submit"
          disabled={!resolvedBranding}
        >
          Sign in securely
        </AuthSubmitButton>
      </form>
    </AuthCard>
  );
}

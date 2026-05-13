import { notFound, redirect } from "next/navigation";

import { SchoolPages } from "@/components/school/school-pages";
import type { SchoolExperienceRole } from "@/lib/experiences/types";
import { readPublicSchoolSession } from "@/lib/routing/public-experience-session";

const allowedRoles = ["principal", "bursar", "teacher", "admin", "storekeeper", "admissions", "librarian"] as const;

export default async function SchoolRoleHomePage({
  params,
}: {
  params: Promise<{ role: string }>;
}) {
  const { role } = await params;

  if (!allowedRoles.includes(role as SchoolExperienceRole)) {
    notFound();
  }

  const session = await readPublicSchoolSession(role as SchoolExperienceRole);

  if (session.role === "storekeeper") {
    redirect("/inventory/dashboard");
  }

  if (session.role === "librarian") {
    redirect("/library/dashboard");
  }

  return <SchoolPages role={session.role} tenantSlug={session.tenantSlug} routeMode="public" />;
}

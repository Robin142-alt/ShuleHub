import { notFound } from "next/navigation";

import { SchoolPages } from "@/components/school/school-pages";
import type { SchoolExperienceRole } from "@/lib/experiences/types";
import { readPublicSchoolSession } from "@/lib/routing/public-experience-session";

const allowedRoles = ["principal", "bursar", "teacher", "admin", "storekeeper", "admissions"] as const;

export default async function SchoolStudentProfilePage({
  params,
}: {
  params: Promise<{ role: string; studentId: string }>;
}) {
  const { role, studentId } = await params;

  if (!allowedRoles.includes(role as SchoolExperienceRole)) {
    notFound();
  }

  const session = await readPublicSchoolSession(role as SchoolExperienceRole);
  return <SchoolPages role={session.role} studentId={studentId} tenantSlug={session.tenantSlug} routeMode="public" />;
}

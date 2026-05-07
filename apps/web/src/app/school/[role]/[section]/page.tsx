import { notFound } from "next/navigation";

import { SchoolPages } from "@/components/school/school-pages";
import type { SchoolExperienceRole } from "@/lib/experiences/types";
import { readPublicSchoolSession } from "@/lib/routing/public-experience-session";
import { isSchoolSection } from "@/lib/routing/experience-routes";

const allowedRoles = ["principal", "bursar", "teacher", "admin", "storekeeper", "admissions"] as const;

export default async function SchoolSectionPage({
  params,
}: {
  params: Promise<{ role: string; section: string }>;
}) {
  const { role, section } = await params;

  if (!allowedRoles.includes(role as SchoolExperienceRole)) {
    notFound();
  }

  if (!isSchoolSection(section)) {
    notFound();
  }

  const session = await readPublicSchoolSession(role as SchoolExperienceRole);
  return <SchoolPages role={session.role} section={section} tenantSlug={session.tenantSlug} routeMode="public" />;
}

import { notFound, redirect } from "next/navigation";

import { SchoolPages } from "@/components/school/school-pages";
import type { SchoolExperienceRole } from "@/lib/experiences/types";
import { isProductionReadyModule } from "@/lib/features/module-readiness";
import { readPublicSchoolSession } from "@/lib/routing/public-experience-session";
import { isSchoolSection } from "@/lib/routing/experience-routes";

const allowedRoles = ["principal", "bursar", "teacher", "admin", "storekeeper", "admissions", "librarian"] as const;
const supportSections = new Set([
  "support-new-ticket",
  "support-my-tickets",
  "support-knowledge-base",
  "support-system-status",
]);

export default async function SchoolSectionPage({
  params,
}: {
  params: Promise<{ role: string; section: string }>;
}) {
  const { role, section } = await params;

  if (!allowedRoles.includes(role as SchoolExperienceRole)) {
    notFound();
  }

  if (!isSchoolSection(section) || !isProductionReadyModule(section)) {
    notFound();
  }

  const session = await readPublicSchoolSession(role as SchoolExperienceRole);

  if (session.role === "storekeeper" && !supportSections.has(section)) {
    redirect("/inventory/dashboard");
  }

  if (session.role === "librarian") {
    redirect("/library/dashboard");
  }

  return <SchoolPages role={session.role} section={section} tenantSlug={session.tenantSlug} routeMode="public" />;
}

import { notFound } from "next/navigation";

import { SchoolPages } from "@/components/school/school-pages";
import { isProductionReadyModule } from "@/lib/features/module-readiness";
import { readSchoolRequestContext } from "@/lib/routing/experience-context";
import { isSchoolSection, type SchoolSection } from "@/lib/routing/experience-routes";

export default async function InternalSchoolSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const context = await readSchoolRequestContext();
  const { section } = await params;

  if (!isSchoolSection(section) || !isProductionReadyModule(section)) {
    notFound();
  }

  return (
    <SchoolPages
      role={context.role}
      section={section as SchoolSection}
      tenantSlug={context.tenantSlug}
    />
  );
}

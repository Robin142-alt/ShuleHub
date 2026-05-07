import { SchoolPages } from "@/components/school/school-pages";
import { readSchoolRequestContext } from "@/lib/routing/experience-context";

export default async function InternalSchoolStudentPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const context = await readSchoolRequestContext();
  const { studentId } = await params;

  return <SchoolPages role={context.role} studentId={studentId} tenantSlug={context.tenantSlug} section="students" />;
}

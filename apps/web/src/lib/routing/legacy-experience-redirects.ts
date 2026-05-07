import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { resolveExperienceHost } from "@/lib/auth/experience-routing";
import {
  toPortalPath,
  toSchoolPath,
  toSchoolStudentPath,
  toSuperadminPath,
  type PortalSection,
  type SchoolSection,
  type SuperadminSection,
} from "@/lib/routing/experience-routes";

async function readResolvedExperience() {
  const requestHeaders = await headers();
  return resolveExperienceHost(requestHeaders.get("host"));
}

export async function redirectLegacySuperadminRoute(
  section: SuperadminSection = "dashboard",
) {
  const resolution = await readResolvedExperience();

  redirect(
    resolution.experience === "superadmin"
      ? toSuperadminPath(section)
      : "/superadmin/login",
  );
}

export async function redirectLegacySchoolRoute(
  section: SchoolSection = "dashboard",
) {
  const resolution = await readResolvedExperience();

  redirect(
    resolution.experience === "school" ? toSchoolPath(section) : "/school/login",
  );
}

export async function redirectLegacySchoolStudentRoute(studentId: string) {
  const resolution = await readResolvedExperience();

  redirect(
    resolution.experience === "school"
      ? toSchoolStudentPath(studentId)
      : "/school/login",
  );
}

export async function redirectLegacyPortalRoute(
  section: PortalSection = "dashboard",
) {
  const resolution = await readResolvedExperience();

  redirect(
    resolution.experience === "portal" ? toPortalPath(section) : "/portal/login",
  );
}

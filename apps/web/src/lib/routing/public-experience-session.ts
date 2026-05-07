import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  parseExperienceSession,
  PORTAL_SESSION_COOKIE,
  SCHOOL_SESSION_COOKIE,
  SUPERADMIN_SESSION_COOKIE,
} from "@/lib/auth/experience-routing";
import type { PortalViewer, SchoolExperienceRole } from "@/lib/experiences/types";

export async function readPublicSuperadminSession() {
  const cookieStore = await cookies();
  const session = parseExperienceSession(
    "superadmin",
    cookieStore.get(SUPERADMIN_SESSION_COOKIE)?.value,
  );

  if (!session || session.experience !== "superadmin") {
    redirect("/superadmin/login");
  }

  return session;
}

export async function readPublicSchoolSession(expectedRole?: SchoolExperienceRole) {
  const cookieStore = await cookies();
  const session = parseExperienceSession(
    "school",
    cookieStore.get(SCHOOL_SESSION_COOKIE)?.value,
  );

  if (!session || session.experience !== "school") {
    redirect("/school/login");
  }

  if (expectedRole && session.role !== expectedRole) {
    redirect(`/school/${session.role}`);
  }

  return session;
}

export async function readStorekeeperInventorySession() {
  const cookieStore = await cookies();
  const session = parseExperienceSession(
    "school",
    cookieStore.get(SCHOOL_SESSION_COOKIE)?.value,
  );

  if (!session || session.experience !== "school") {
    redirect("/school/login");
  }

  if (session.role !== "storekeeper") {
    redirect("/forbidden");
  }

  return session;
}

export async function readPublicPortalSession(expectedViewer?: PortalViewer) {
  const cookieStore = await cookies();
  const session = parseExperienceSession(
    "portal",
    cookieStore.get(PORTAL_SESSION_COOKIE)?.value,
  );

  if (!session || session.experience !== "portal") {
    redirect("/portal/login");
  }

  if (expectedViewer && session.viewer !== expectedViewer) {
    redirect(`/portal/${session.viewer}`);
  }

  return session;
}

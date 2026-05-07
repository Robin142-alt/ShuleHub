import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  parseExperienceSession,
  PORTAL_SESSION_COOKIE,
  SCHOOL_SESSION_COOKIE,
  SUPERADMIN_SESSION_COOKIE,
} from "@/lib/auth/experience-routing";

export async function getPublicEntryRedirectPath() {
  const cookieStore = await cookies();

  const superadminSession = parseExperienceSession(
    "superadmin",
    cookieStore.get(SUPERADMIN_SESSION_COOKIE)?.value,
  );

  if (superadminSession) {
    return superadminSession.homePath;
  }

  const schoolSession = parseExperienceSession(
    "school",
    cookieStore.get(SCHOOL_SESSION_COOKIE)?.value,
  );

  if (schoolSession?.experience === "school") {
    return `/school/${schoolSession.role}`;
  }

  const portalSession = parseExperienceSession(
    "portal",
    cookieStore.get(PORTAL_SESSION_COOKIE)?.value,
  );

  if (portalSession?.experience === "portal") {
    return `/portal/${portalSession.viewer}`;
  }

  return null;
}

export async function redirectPublicEntryToKnownSession() {
  const redirectPath = await getPublicEntryRedirectPath();

  if (redirectPath) {
    redirect(redirectPath);
  }
}

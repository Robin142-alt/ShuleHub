import { notFound } from "next/navigation";

import { SuperadminPages } from "@/components/platform/superadmin-pages";
import { readPlatformRequestContext } from "@/lib/routing/experience-context";
import {
  isSuperadminSection,
  type SuperadminSection,
} from "@/lib/routing/experience-routes";

export default async function InternalSuperadminSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  await readPlatformRequestContext();

  const { section } = await params;

  if (section !== "dashboard" && section !== "users" && !isSuperadminSection(section)) {
    notFound();
  }

  const viewSection: "overview" | SuperadminSection =
    section === "dashboard" ? "overview" : (section as SuperadminSection);

  return <SuperadminPages section={viewSection} />;
}

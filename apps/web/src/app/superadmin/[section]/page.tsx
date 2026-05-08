import { notFound } from "next/navigation";

import { SuperadminPages } from "@/components/platform/superadmin-pages";
import { readPublicSuperadminSession } from "@/lib/routing/public-experience-session";
import type { SuperadminSection } from "@/lib/routing/experience-routes";

const allowedSections = new Set([
  "tenants",
  "schools",
  "revenue",
  "subscriptions",
  "mpesa-monitoring",
  "users",
  "support",
  "support-open",
  "support-in-progress",
  "support-escalated",
  "support-resolved",
  "support-sla",
  "support-analytics",
  "audit-logs",
  "infrastructure",
  "notifications",
  "settings",
]);

export default async function SuperadminSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  await readPublicSuperadminSession();

  const { section } = await params;

  if (!allowedSections.has(section)) {
    notFound();
  }

  const mappedSection =
    section === "tenants" ? "schools" : (section as SuperadminSection);

  return <SuperadminPages section={mappedSection} routeMode="public" />;
}

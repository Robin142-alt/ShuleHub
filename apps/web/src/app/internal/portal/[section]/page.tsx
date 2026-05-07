import { notFound } from "next/navigation";

import { PortalPages } from "@/components/portal/portal-pages";
import { readPortalRequestContext } from "@/lib/routing/experience-context";
import { isPortalSection, type PortalSection } from "@/lib/routing/experience-routes";

export default async function InternalPortalSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const context = await readPortalRequestContext();
  const { section } = await params;

  if (!isPortalSection(section)) {
    notFound();
  }

  return (
    <PortalPages
      viewer={context.viewer}
      section={section as PortalSection}
    />
  );
}

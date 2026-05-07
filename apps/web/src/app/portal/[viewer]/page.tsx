import { notFound } from "next/navigation";

import type { PortalViewer } from "@/lib/experiences/types";
import { PortalPages } from "@/components/portal/portal-pages";
import { readPublicPortalSession } from "@/lib/routing/public-experience-session";

const allowedViewers = ["parent", "student"] as const;

export default async function PortalViewerHomePage({
  params,
}: {
  params: Promise<{ viewer: string }>;
}) {
  const { viewer } = await params;

  if (!allowedViewers.includes(viewer as PortalViewer)) {
    notFound();
  }

  const session = await readPublicPortalSession(viewer as PortalViewer);
  return <PortalPages viewer={session.viewer} routeMode="public" />;
}

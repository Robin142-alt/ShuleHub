import { notFound } from "next/navigation";

import { StorekeeperWorkspace } from "@/components/storekeeper/storekeeper-workspace";
import {
  isStorekeeperSection,
  type StorekeeperSectionId,
} from "@/lib/storekeeper/storekeeper-data";
import { readStorekeeperInventorySession } from "@/lib/routing/public-experience-session";

export default async function StorekeeperInventorySectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  if (!isStorekeeperSection(section)) {
    notFound();
  }

  const session = await readStorekeeperInventorySession();

  return (
    <StorekeeperWorkspace
      section={section as StorekeeperSectionId}
      userLabel={session.userLabel}
      tenantSlug={session.tenantSlug}
    />
  );
}

import { notFound } from "next/navigation";

import { LibraryWorkspace } from "@/components/library/library-workspace";
import {
  isLibrarySection,
  type LibrarySectionId,
} from "@/lib/library/library-data";
import { readLibrarianLibrarySession } from "@/lib/routing/public-experience-session";

export default async function LibrarianLibrarySectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  if (!isLibrarySection(section)) {
    notFound();
  }

  const session = await readLibrarianLibrarySession();

  return (
    <LibraryWorkspace
      section={section as LibrarySectionId}
      userLabel={session.userLabel}
      tenantSlug={session.tenantSlug}
    />
  );
}

import { redirect } from "next/navigation";

import { getPublicEntryRedirectPath } from "@/lib/routing/public-entry-session";

export default async function HomePage() {
  const redirectPath = await getPublicEntryRedirectPath();

  redirect(redirectPath ?? "/login");
}

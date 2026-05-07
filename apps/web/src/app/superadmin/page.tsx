import { SuperadminPages } from "@/components/platform/superadmin-pages";
import { readPublicSuperadminSession } from "@/lib/routing/public-experience-session";

export default async function SuperadminHomePage() {
  await readPublicSuperadminSession();
  return <SuperadminPages routeMode="public" />;
}

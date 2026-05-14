import { AuthStatePage } from "@/components/auth/auth-state-page";

export default function ForbiddenPage() {
  return <AuthStatePage kind="access-denied" />;
}

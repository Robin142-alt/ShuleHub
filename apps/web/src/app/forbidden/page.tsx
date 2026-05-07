import Link from "next/link";

import { Card } from "@/components/ui/card";

export default function ForbiddenPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-10 md:px-6 lg:px-8">
      <div className="mx-auto max-w-[720px]">
        <Card className="p-8 md:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
            Access restricted
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-foreground">
            This route is no longer available.
          </h1>
          <p className="mt-4 text-sm leading-7 text-muted">
            The mixed legacy dashboard has been retired. Use the dedicated
            super admin, school, or portal login to enter the correct workspace.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/superadmin/login"
              className="rounded-xl border border-border bg-white px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-muted"
            >
              Super admin login
            </Link>
            <Link
              href="/school/login"
              className="rounded-xl border border-border bg-white px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-muted"
            >
              School login
            </Link>
            <Link
              href="/portal/login"
              className="rounded-xl border border-border bg-white px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-muted"
            >
              Portal login
            </Link>
          </div>
        </Card>
      </div>
    </main>
  );
}

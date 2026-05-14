"use client";

import Link from "next/link";

import { Card } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";

export function AdmissionsDashboardHome() {
  return (
    <div className="space-y-6">
      <section data-testid="core-widgets" className="grid gap-6 xl:grid-cols-12">
        <Card className="p-6 xl:col-span-7">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">
            Admissions queue
          </p>
          <h3 className="mt-2 text-xl font-semibold text-foreground">
            Pending approvals
          </h3>
          <div className="mt-6 rounded-xl border border-border bg-surface-muted px-4 py-4">
            <p className="text-sm font-semibold text-foreground">No pending approvals yet</p>
            <p className="mt-1 text-sm text-muted">Applications appear after the front office starts real admissions intake.</p>
          </div>
        </Card>

        <Card className="p-6 xl:col-span-5">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">
            Front office
          </p>
          <h3 className="mt-2 text-xl font-semibold text-foreground">
            Registration actions
          </h3>
          <div className="mt-6 space-y-3">
            <Link href="/dashboard/admissions/admissions" className={buttonClasses({ variant: "secondary", size: "md" })}>
              Open Admissions Workspace
            </Link>
            <Link href="/dashboard/admissions/admissions" className={buttonClasses({ variant: "primary", size: "md" })}>
              New Registration
            </Link>
            <Link href="/dashboard/admissions/admissions" className={buttonClasses({ variant: "secondary", size: "md" })}>
              Review Applications
            </Link>
          </div>
          <div className="mt-6 rounded-xl border border-border bg-surface-muted px-4 py-4">
            <p className="text-sm font-medium text-foreground">Student lookup is ready</p>
            <p className="mt-1 text-sm text-muted">
              Search becomes useful after real learners are registered.
            </p>
          </div>
        </Card>
      </section>

      <div data-testid="activity-feed-section">
        <Card className="p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">
            Recent applications
          </p>
          <h3 className="mt-2 text-lg font-semibold text-foreground">
            Daily admissions office flow
          </h3>
          <div className="mt-6 rounded-xl border border-border bg-surface-muted px-4 py-4">
            <p className="text-sm text-muted">Admissions activity appears after applications, registrations, and document reviews are created.</p>
          </div>
        </Card>
      </div>
    </div>
  );
}

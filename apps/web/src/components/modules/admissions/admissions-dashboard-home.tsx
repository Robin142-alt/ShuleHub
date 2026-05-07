"use client";

import Link from "next/link";

import { Card } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";

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
          <div className="mt-6 space-y-3">
            {[
              ["Brenda Atieno", "Grade 7 application awaiting final review", "warning"],
              ["Ian Mwangi", "Passport photo missing from file", "critical"],
              ["Mercy Chebet", "Approved and ready for registration", "ok"],
            ].map(([label, value, tone]) => (
              <div
                key={label}
                className="flex items-center justify-between rounded-xl border border-border bg-surface-muted px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold text-foreground">{label}</p>
                  <p className="mt-1 text-sm text-muted">{value}</p>
                </div>
                <StatusPill label={tone === "critical" ? "Missing docs" : tone === "ok" ? "Ready" : "Pending"} tone={tone as "warning" | "critical" | "ok"} />
              </div>
            ))}
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
            <p className="text-sm font-medium text-foreground">Instant student lookup is live</p>
            <p className="mt-1 text-sm text-muted">
              Search by learner name, admission number, or parent phone from the global search rail.
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
          <div className="mt-6 space-y-3">
            {[
              "APP-20260504-118 Brenda Atieno moved from interview to approved",
              "APP-20260504-112 Hassan Noor flagged for missing birth certificate",
              "ADM-G7-118 created for Brenda Atieno after registration",
            ].map((entry) => (
              <div key={entry} className="rounded-xl border border-border bg-surface-muted px-4 py-3 text-sm text-foreground">
                {entry}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

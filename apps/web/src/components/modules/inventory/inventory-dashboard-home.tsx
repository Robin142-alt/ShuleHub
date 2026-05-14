"use client";

import Link from "next/link";

import { Card } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";

export function InventoryDashboardHome() {
  return (
    <div className="space-y-6">
      <section data-testid="core-widgets" className="grid gap-6 xl:grid-cols-12">
        <Card className="p-6 xl:col-span-7">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">
            Store operations
          </p>
          <h3 className="mt-2 text-xl font-semibold text-foreground">
            Low stock alerts
          </h3>
          <div className="mt-6 rounded-xl border border-border bg-surface-muted px-4 py-4">
            <p className="text-sm font-semibold text-foreground">No stock alerts yet</p>
            <p className="mt-1 text-sm text-muted">Alerts appear after real inventory items and reorder levels are configured.</p>
          </div>
        </Card>

        <Card className="p-6 xl:col-span-5">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">
            Quick control
          </p>
          <h3 className="mt-2 text-xl font-semibold text-foreground">
            Keep stock moving
          </h3>
          <div className="mt-6 space-y-3">
            <Link href="/dashboard/storekeeper/inventory" className={buttonClasses({ variant: "secondary", size: "md" })}>
              Open Inventory Workspace
            </Link>
            <Link href="/dashboard/storekeeper/inventory" className={buttonClasses({ variant: "primary", size: "md" })}>
              Adjust Stock
            </Link>
            <Link href="/dashboard/storekeeper/inventory" className={buttonClasses({ variant: "secondary", size: "md" })}>
              Create Purchase Order
            </Link>
          </div>
          <div className="mt-6 rounded-xl border border-border bg-surface-muted px-4 py-4">
            <p className="text-sm font-medium text-foreground">0 pending requests</p>
            <p className="mt-1 text-sm text-muted">
              Department requests appear after real stock workflows begin.
            </p>
          </div>
        </Card>
      </section>

      <div data-testid="activity-feed-section">
        <Card className="p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">
            Purchase activity
          </p>
          <h3 className="mt-2 text-lg font-semibold text-foreground">
            Recent procurement lane
          </h3>
          <div className="mt-6 rounded-xl border border-border bg-surface-muted px-4 py-4">
            <p className="text-sm text-muted">Procurement activity appears after purchase orders, transfers, and incident records are created.</p>
          </div>
        </Card>
      </div>
    </div>
  );
}

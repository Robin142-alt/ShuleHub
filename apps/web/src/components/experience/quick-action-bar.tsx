import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { Card } from "@/components/ui/card";

export function QuickActionBar({
  actions,
}: {
  actions: Array<{
    id: string;
    label: string;
    description: string;
    href: string;
    icon: LucideIcon;
  }>;
}) {
  return (
    <Card className="p-5">
      <div className="flex flex-col gap-4 border-b border-border pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
            Quick actions
          </p>
          <p className="mt-2 text-lg font-semibold text-foreground">
            Keep routine work within one click
          </p>
          <p className="mt-1 text-sm leading-6 text-muted">
            Prioritized actions for the next operational step, not generic shortcuts.
          </p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {actions.map((action) => {
          const Icon = action.icon;

          return (
            <Link
              key={action.id}
              href={action.href}
              className="rounded-xl border border-border bg-surface-muted px-4 py-4 transition duration-150 hover:border-border-strong hover:bg-white"
            >
              <div className="flex items-start gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-white text-foreground shadow-sm">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{action.label}</p>
                  <p className="mt-1 text-sm leading-6 text-muted">{action.description}</p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </Card>
  );
}

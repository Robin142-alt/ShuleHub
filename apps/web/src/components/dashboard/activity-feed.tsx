import { Activity, MessageSquare, ReceiptText, UserPlus } from "lucide-react";
import Link from "next/link";

import { Card } from "@/components/ui/card";
import type { ActivityItem } from "@/lib/dashboard/types";

const iconMap = {
  payment: ReceiptText,
  attendance: Activity,
  student: UserPlus,
  communication: MessageSquare,
} as const;

export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  return (
    <Card data-testid="activity-feed" className="p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="section-title">
          Recent activity
        </h3>
        <span className="badge badge-neutral">
          {items.length} events
        </span>
      </div>

      <div className="space-y-0.5">
        {items.map((item) => {
          const Icon = iconMap[item.category];

          return (
            <Link
              key={item.id}
              href={item.href}
              data-testid="activity-item"
              className="flex items-start gap-3 rounded-[var(--radius-sm)] px-3 py-2 transition-colors hover:bg-surface-muted"
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-xs)] bg-surface-strong">
                <Icon className="h-3.5 w-3.5 text-accent" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-[13px] font-medium text-foreground">{item.title}</p>
                  <p className="shrink-0 text-[11px] text-muted">
                    {item.timeLabel}
                  </p>
                </div>
                <p className="mt-0.5 truncate text-[11px] text-muted">{item.detail}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </Card>
  );
}

import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import type { ExperienceActivityItem, ExperienceListItem } from "@/lib/experiences/types";

export function ActivityListCard({
  title,
  subtitle,
  items,
}: {
  title: string;
  subtitle: string;
  items: ExperienceActivityItem[];
}) {
  return (
    <Card className="p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
        Live activity
      </p>
      <p className="mt-2 text-lg font-semibold text-foreground">{title}</p>
      <p className="mt-1 text-sm leading-6 text-muted">{subtitle}</p>
      <div className="mt-5 space-y-3">
        {items.map((item) => (
          <div
            key={item.id}
            className="rounded-xl border border-border bg-surface-muted px-4 py-4 transition duration-150 hover:border-border-strong hover:bg-white"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{item.title}</p>
                <p className="mt-1 text-sm leading-6 text-muted">{item.detail}</p>
              </div>
              <StatusPill label={item.timeLabel} tone={item.tone} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function SimpleListCard({
  title,
  subtitle,
  items,
}: {
  title: string;
  subtitle: string;
  items: ExperienceListItem[];
}) {
  return (
    <Card className="p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
        Current queue
      </p>
      <p className="mt-2 text-lg font-semibold text-foreground">{title}</p>
      <p className="mt-1 text-sm leading-6 text-muted">{subtitle}</p>
      <div className="mt-5 space-y-3">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between gap-4 rounded-xl border border-border bg-surface-muted px-4 py-3 transition duration-150 hover:border-border-strong hover:bg-white"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{item.title}</p>
              <p className="mt-1 text-sm text-muted">{item.subtitle}</p>
            </div>
            <div className="shrink-0">
              {item.value ? (
                item.tone ? (
                  <StatusPill label={item.value} tone={item.tone} />
                ) : (
                  <p className="text-sm font-semibold text-foreground">{item.value}</p>
                )
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

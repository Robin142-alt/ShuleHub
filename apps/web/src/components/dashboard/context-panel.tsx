import { CapabilityGrid } from "@/components/dashboard/capability-grid";
import { Card } from "@/components/ui/card";
import type {
  CapabilityItem,
  ContextSection,
  DashboardRole,
} from "@/lib/dashboard/types";

export function ContextPanel({
  sections,
  capabilities,
  role,
}: {
  sections: ContextSection[];
  capabilities: CapabilityItem[];
  role: DashboardRole;
}) {
  return (
    <Card data-testid="context-panel" className="p-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">
            Context
          </p>
          <h3 className="mt-2 text-2xl font-black tracking-tight text-foreground">
            Current state in trend form
          </h3>
        </div>
        <p className="max-w-lg text-sm leading-6 text-muted">
          Trends are kept lightweight so the dashboard answers what is changing without blocking first paint.
        </p>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        {sections.map((section) => {
          const max = Math.max(...section.points.map((point) => point.value), 1);

          return (
            <div
              key={section.id}
              data-testid="context-chart"
              className="rounded-[24px] border border-border bg-surface-muted p-5"
            >
              <h4 className="text-lg font-bold tracking-tight text-foreground">
                {section.title}
              </h4>
              <p className="mt-2 text-sm leading-6 text-muted">
                {section.description}
              </p>
              <div className="mt-5 grid h-44 grid-cols-7 items-end gap-3">
                {section.points.map((point) => (
                  <div key={point.label} className="flex flex-col items-center gap-2">
                    <div className="flex h-32 w-full items-end rounded-full bg-surface-strong">
                      <div
                        className="w-full rounded-full bg-accent"
                        style={{ height: `${Math.max(10, (point.value / max) * 100)}%` }}
                      />
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-semibold text-foreground">
                        {point.label}
                      </p>
                      <p className="text-[11px] text-muted">{point.value}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-sm leading-6 text-muted">{section.footer}</p>
            </div>
          );
        })}
      </div>

      <CapabilityGrid role={role} capabilities={capabilities} />
    </Card>
  );
}

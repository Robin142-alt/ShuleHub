import { Card } from "@/components/ui/card";
import type { ExperienceChartPoint } from "@/lib/experiences/types";

export function ChartCard({
  title,
  subtitle,
  points,
}: {
  title: string;
  subtitle: string;
  points: ExperienceChartPoint[];
}) {
  const maxValue = Math.max(...points.map((point) => point.value), 1);

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-semibold text-foreground">{title}</p>
          <p className="mt-1 text-sm leading-6 text-muted">{subtitle}</p>
        </div>
      </div>

      <div className="mt-6">
        <div className="flex h-56 items-end gap-3">
          {points.map((point) => (
            <div key={point.label} className="flex min-w-0 flex-1 flex-col items-center gap-3">
              <div className="flex h-48 w-full items-end rounded-2xl bg-surface-muted px-2 py-2">
                <div
                  className="w-full rounded-xl bg-accent transition-all duration-150"
                  style={{ height: `${Math.max((point.value / maxValue) * 100, 10)}%` }}
                />
              </div>
              <div className="space-y-1 text-center">
                <p className="text-sm font-semibold text-foreground">{point.value}</p>
                <p className="text-xs text-muted">{point.label}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

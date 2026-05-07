import { Clock3 } from "lucide-react";

import { StatusPill } from "@/components/ui/status-pill";
import { WidgetShell } from "@/components/dashboard/widget-shell";
import type { AttendanceWidgetData } from "@/lib/dashboard/types";

export function AttendanceWidget({
  data,
}: {
  data: AttendanceWidgetData;
}) {
  return (
    <WidgetShell
      eyebrow="Attendance"
      title="Attendance pulse"
      description="Offline-first attendance capture with sync-aware visibility."
      className="xl:col-span-1"
      testId="attendance-widget"
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-[var(--radius)] bg-accent-soft/60 p-4">
          <p className="eyebrow text-accent">
            Today&apos;s rate
          </p>
          <p className="mt-2 metric-value">
            {data.attendanceRate}
          </p>
        </div>
        <div className="rounded-[var(--radius)] bg-surface-muted p-4">
          <p className="eyebrow">
            Unmarked
          </p>
          <p className="mt-2 metric-value">
            {data.unmarkedClasses}
          </p>
        </div>
        <div className="rounded-[var(--radius)] bg-surface-muted p-4">
          <p className="eyebrow">
            Absentees
          </p>
          <p className="mt-2 metric-value">
            {data.absentees}
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {data.classStatus.map((entry) => (
          <div
            key={entry.className}
            className="flex items-center justify-between rounded-[var(--radius-sm)] border border-border bg-surface-muted px-3.5 py-2.5"
          >
            <div className="flex items-center gap-2.5">
              <Clock3 className="h-3.5 w-3.5 text-muted" />
              <div>
                <p className="text-[13px] font-semibold text-foreground">
                  {entry.className}
                </p>
                <p className="text-[11px] text-muted">Morning roll call</p>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <p className="text-[13px] font-semibold text-foreground finance-number">{entry.value}</p>
              <StatusPill label={entry.status} tone={entry.status} compact />
            </div>
          </div>
        ))}
      </div>
    </WidgetShell>
  );
}

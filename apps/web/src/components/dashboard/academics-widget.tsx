import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { WidgetShell } from "@/components/dashboard/widget-shell";
import type { AcademicsWidgetData } from "@/lib/dashboard/types";

export function AcademicsWidget({
  data,
  href,
}: {
  data: AcademicsWidgetData;
  href: string;
}) {
  return (
    <WidgetShell
      eyebrow="Academics"
      title="CBC learning posture"
      description="Exams, grading queue, and performance across competency areas."
      className="xl:col-span-2"
      testId="academics-widget"
    >
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-[var(--radius)] bg-surface-muted p-4">
          <p className="eyebrow">
            Next exam
          </p>
          <p className="mt-2 metric-value-sm">{data.nextExam}</p>
        </div>
        <div className="rounded-[var(--radius)] bg-surface-muted p-4">
          <p className="eyebrow">
            Grading queue
          </p>
          <p className="mt-2 metric-value-sm">
            {data.gradingQueue}
          </p>
        </div>
        <div className="rounded-[var(--radius)] bg-surface-muted p-4">
          <p className="eyebrow">
            Trend
          </p>
          <p className="mt-2 metric-value-sm">
            {data.performanceTrend}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {data.subjects.map((subject) => (
          <div
            key={subject.subject}
            className="rounded-[var(--radius-sm)] border border-border bg-surface-muted p-3.5"
          >
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-semibold text-foreground">
                {subject.subject}
              </p>
              <p className="text-[13px] font-bold text-accent finance-number">{subject.value}%</p>
            </div>
            <div className="mt-2.5 h-1.5 rounded-full bg-surface-strong">
              <div
                className="h-1.5 rounded-full bg-accent transition-all duration-500"
                style={{ width: `${subject.value}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <Link
        href={href}
        className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-accent hover:underline"
      >
        Open academics
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </WidgetShell>
  );
}

import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";

export function WidgetShell({
  eyebrow,
  title,
  description,
  children,
  className = "",
  testId,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <Card data-testid={testId} className={`p-5 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">
            {eyebrow}
          </p>
          <h3 className="mt-1.5 section-title text-lg">
            {title}
          </h3>
        </div>
      </div>
      {description ? (
        <p className="mt-1 text-[13px] leading-relaxed text-muted line-clamp-2">{description}</p>
      ) : null}
      <div className="mt-4">{children}</div>
    </Card>
  );
}

"use client";

import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import type { StatusTone } from "@/lib/dashboard/types";

export interface WorkflowCardItem {
  id: string;
  title: string;
  detail: string;
  value?: string;
  tone?: StatusTone;
}

export function WorkflowCard({
  eyebrow,
  title,
  description,
  items,
  footer,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  items: WorkflowCardItem[];
  footer?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
            {eyebrow}
          </p>
          <h3 className="mt-2 text-lg font-semibold text-foreground">{title}</h3>
          <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
        </div>
        {action}
      </div>

      <div className="mt-5 space-y-3">
        {items.map((item) => (
          <div
            key={item.id}
            className="rounded-xl border border-border bg-surface-muted px-4 py-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{item.title}</p>
                <p className="mt-1 text-sm leading-6 text-muted">{item.detail}</p>
              </div>
              <div className="shrink-0">
                {item.tone ? (
                  <StatusPill label={item.value ?? item.tone} tone={item.tone} />
                ) : item.value ? (
                  <p className="text-sm font-semibold text-foreground">{item.value}</p>
                ) : null}
              </div>
            </div>
          </div>
        ))}
      </div>

      {footer ? <div className="mt-5">{footer}</div> : null}
    </Card>
  );
}

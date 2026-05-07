"use client";

import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import type { StatusTone } from "@/lib/dashboard/types";

export interface StatStripItem {
  id: string;
  label: string;
  value: string;
  helper: string;
  tone?: StatusTone;
}

export function StatStrip({ items }: { items: StatStripItem[] }) {
  return (
    <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
      {items.map((item) => (
        <Card key={item.id} className="p-5">
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
              {item.label}
            </p>
            {item.tone ? <StatusPill label={item.tone} tone={item.tone} /> : null}
          </div>
          <p className="mt-3 text-[1.85rem] font-bold leading-none text-foreground">{item.value}</p>
          <p className="mt-3 text-sm leading-6 text-muted">{item.helper}</p>
        </Card>
      ))}
    </section>
  );
}

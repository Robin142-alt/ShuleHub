import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { Sparkline } from "@/components/ui/sparkline";
import { maskValue } from "@/lib/dashboard/format";
import type { KpiCard } from "@/lib/dashboard/types";

export function KpiCards({ cards }: { cards: KpiCard[] }) {
  return (
    <section data-testid="kpi-strip" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card, index) => {
        const positive = card.trendDirection === "up";

        return (
          <Link
            key={card.id}
            href={card.href}
            data-testid="kpi-card"
            className={`group dashboard-card rounded-[var(--radius)] p-4 transition-all duration-150 hover:border-accent/20 hover:shadow-md widget-enter widget-enter-delay-${Math.min(index + 1, 4)}`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="eyebrow">
                {card.label}
              </p>
              <span
                className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  positive ? "bg-success-soft text-success" : "bg-warning-soft text-warning"
                }`}
              >
                {positive ? (
                  <ArrowUpRight className="h-3 w-3" />
                ) : (
                  <ArrowDownRight className="h-3 w-3" />
                )}
                {card.trendValue}
              </span>
            </div>
            <p
              data-testid="kpi-value"
              className="mt-2 text-[1.875rem] font-bold leading-none text-foreground finance-number"
            >
              {maskValue(card.value, Boolean(card.masked))}
            </p>
            <p className="mt-2 text-xs text-muted line-clamp-1">{card.helper}</p>
            <div className="mt-2.5">
              <Sparkline
                values={card.sparkline}
                colorClass={positive ? "text-success" : "text-warning"}
              />
            </div>
          </Link>
        );
      })}
    </section>
  );
}

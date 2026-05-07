import { ArrowRight } from "lucide-react";

import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import type { AlertItem } from "@/lib/dashboard/types";

export function AlertsPanel({ alerts }: { alerts: AlertItem[] }) {
  if (alerts.length === 0) {
    return null;
  }

  // Sort by severity: critical first
  const sortedAlerts = [...alerts].sort((a, b) => {
    const order = { critical: 0, warning: 1, ok: 2 };
    return (order[a.severity] ?? 2) - (order[b.severity] ?? 2);
  });

  return (
    <Card data-testid="alerts-panel" className="p-4 border-danger/15">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-danger animate-pulse" />
          <h2 className="section-title">
            {alerts.length} {alerts.length === 1 ? "item" : "items"} need attention
          </h2>
        </div>
      </div>
      <div className="grid gap-2 xl:grid-cols-3">
        {sortedAlerts.map((alert) => (
          <a
            key={alert.id}
            href={alert.href}
            data-testid="alert-card"
            className="group rounded-[var(--radius-sm)] border border-border bg-surface-muted/50 p-3.5 transition-all duration-150 hover:border-accent/20 hover:bg-surface hover:shadow-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <StatusPill label={alert.actionLabel} tone={alert.severity} compact />
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wider text-muted">
                  {alert.metricLabel}
                </p>
                <p className="mt-0.5 text-base font-bold text-foreground finance-number">
                  {alert.metricValue}
                </p>
              </div>
            </div>
            <h3 className="mt-2.5 text-[13px] font-semibold text-foreground">
              {alert.title}
            </h3>
            <p className="mt-1 text-[11px] text-muted line-clamp-2">
              {alert.description}
            </p>
            <div className="mt-2.5 flex items-center gap-1 text-[11px] font-semibold text-accent opacity-0 transition-opacity group-hover:opacity-100">
              <span>Resolve</span>
              <ArrowRight className="h-3 w-3" />
            </div>
          </a>
        ))}
      </div>
    </Card>
  );
}

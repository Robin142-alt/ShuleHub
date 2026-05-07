import { ArrowUpRight, CreditCard, ReceiptText, WalletCards } from "lucide-react";
import Link from "next/link";

import { StatusPill } from "@/components/ui/status-pill";
import { WidgetShell } from "@/components/dashboard/widget-shell";
import type { FinanceWidgetData } from "@/lib/dashboard/types";

const barColors = [
  "bg-accent",
  "bg-info",
  "bg-warning",
];

export function FinanceWidget({
  data,
  href,
  online,
  actionLabel,
}: {
  data: FinanceWidgetData;
  href: string;
  online: boolean;
  actionLabel: string;
}) {
  return (
    <WidgetShell
      eyebrow="Finance"
      title="Finance at a glance"
      description="Collections, outstanding fees, and M-PESA exceptions."
      className="xl:col-span-1"
      testId="finance-widget"
    >
      {/* Finance KPIs */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-[var(--radius)] bg-accent-soft/60 p-4">
          <div className="flex items-center gap-1.5 text-accent">
            <WalletCards className="h-3.5 w-3.5" />
            <span className="eyebrow !text-accent">
              Today
            </span>
          </div>
          <p className="mt-2 text-xl font-bold tracking-tight text-foreground finance-number">
            {data.collectionsToday}
          </p>
        </div>
        <div className="rounded-[var(--radius)] bg-surface-muted p-4">
          <div className="flex items-center gap-1.5 text-muted">
            <ReceiptText className="h-3.5 w-3.5" />
            <span className="eyebrow">
              Outstanding
            </span>
          </div>
          <p className="mt-2 text-xl font-bold tracking-tight text-foreground finance-number">
            {data.outstandingInvoices}
          </p>
        </div>
        <div className="rounded-[var(--radius)] bg-surface-muted p-4">
          <div className="flex items-center gap-1.5 text-muted">
            <CreditCard className="h-3.5 w-3.5" />
            <span className="eyebrow">
              Failed
            </span>
          </div>
          <p className="mt-2 text-xl font-bold tracking-tight text-foreground finance-number">
            {data.failedPayments}
          </p>
        </div>
      </div>

      {/* Collection Mix */}
      <div className="mt-4 rounded-[var(--radius)] border border-border bg-surface-muted/50 p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="section-title">
            Collection mix
          </p>
          <StatusPill
            label={online ? "Online" : "Locked offline"}
            tone={online ? "ok" : "critical"}
            compact
          />
        </div>
        <div className="space-y-2.5">
          {data.collectionMix.map((entry, index) => (
            <div key={entry.label} className="space-y-1">
              <div className="flex items-center justify-between text-[13px]">
                <span className="font-medium text-foreground">{entry.label}</span>
                <span className="text-[12px] font-semibold text-muted finance-number">{entry.value}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-surface-strong">
                <div
                  className={`h-1.5 rounded-full ${barColors[index % barColors.length]} transition-all duration-500`}
                  style={{ width: `${entry.value}%` }}
                />
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-muted">{data.trendLabel}</p>
      </div>

      {/* CTA */}
      <div className="mt-4">
        <Link
          href={href}
          className="inline-flex items-center gap-2 rounded-[var(--radius-sm)] bg-accent px-3.5 py-2 text-[13px] font-semibold text-white shadow-sm transition-all hover:bg-accent-hover hover:shadow active:scale-[0.98]"
        >
          {actionLabel}
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </WidgetShell>
  );
}

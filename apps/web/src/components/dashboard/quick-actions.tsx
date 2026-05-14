import {
  ArrowUpRight,
  CreditCard,
  FileSpreadsheet,
  MessageSquareText,
  ReceiptText,
  UserPlus,
} from "lucide-react";
import { useRouter } from "next/navigation";

import { Card } from "@/components/ui/card";
import type { DashboardRole, QuickActionItem } from "@/lib/dashboard/types";

const actionIconMap = {
  "add-student": UserPlus,
  "record-payment": CreditCard,
  "send-sms": MessageSquareText,
  "create-invoice": ReceiptText,
  "print-report": FileSpreadsheet,
  "view-child": ArrowUpRight,
} as const;

export function QuickActions({
  actions,
  online,
  role,
  onAction,
}: {
  actions: QuickActionItem[];
  online: boolean;
  role: DashboardRole;
  onAction: (action: QuickActionItem) => void;
}) {
  const router = useRouter();

  return (
    <Card data-testid="quick-actions" className="p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="section-title">
          Quick actions
        </h3>
        <span className="badge badge-neutral">
          {online ? "All available" : "Limited offline"}
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {actions.slice(0, 4).map((action) => {
          const Icon =
            actionIconMap[action.id as keyof typeof actionIconMap] ?? ArrowUpRight;
          const disabled = !online && !action.offlineAllowed;

          return (
            <button
              key={action.id}
              type="button"
              data-testid="quick-action"
              onClick={() => {
                onAction(action);
                router.push(`/dashboard/${role}/${action.href}`);
              }}
              disabled={disabled}
              className={`group flex items-center gap-3 rounded-[var(--radius-sm)] border px-3 py-2.5 text-left transition-all duration-150 ${
                disabled
                  ? "cursor-not-allowed border-border/50 bg-surface-muted/30 opacity-50"
                  : "border-border bg-surface hover:border-accent/20 hover:bg-accent-ghost active:scale-[0.98]"
              }`}
            >
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-xs)] ${
                disabled ? "bg-surface-strong" : "bg-accent-soft"
              }`}>
                <Icon className={`h-4 w-4 ${disabled ? "text-muted" : "text-accent"}`} />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-[13px] font-semibold text-foreground">
                  {action.label}
                </h4>
                {!action.offlineAllowed ? (
                  <p className="text-[10px] uppercase tracking-wider text-muted">
                    Online only
                  </p>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

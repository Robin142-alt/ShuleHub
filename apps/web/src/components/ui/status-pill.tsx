import { AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";

import type { StatusTone, SyncState } from "@/lib/dashboard/types";

const toneMap: Record<StatusTone, { icon: typeof ShieldAlert; className: string }> = {
  critical: {
    icon: ShieldAlert,
    className: "bg-danger/10 text-danger",
  },
  warning: {
    icon: AlertTriangle,
    className: "bg-warning/10 text-warning",
  },
  ok: {
    icon: CheckCircle2,
    className: "bg-success/10 text-success",
  },
};

const syncMap: Record<SyncState, StatusTone> = {
  synced: "ok",
  pending: "warning",
  failed: "critical",
};

export function StatusPill({
  label,
  tone,
  compact = false,
}: {
  label: string;
  tone: StatusTone | SyncState;
  compact?: boolean;
}) {
  const resolved = tone in syncMap ? syncMap[tone as SyncState] : (tone as StatusTone);
  const entry = toneMap[resolved];
  const Icon = entry.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold leading-tight whitespace-nowrap ${entry.className}`}
    >
      <Icon className={compact ? "h-3 w-3" : "h-3 w-3"} />
      {label}
    </span>
  );
}

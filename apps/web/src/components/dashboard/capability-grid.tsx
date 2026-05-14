import {
  BriefcaseBusiness,
  ClipboardList,
  CreditCard,
  FileSpreadsheet,
  GraduationCap,
  MessageSquareMore,
  Package,
  Settings2,
  ShieldCheck,
  Users,
} from "lucide-react";
import Link from "next/link";

import { StatusPill } from "@/components/ui/status-pill";
import type { CapabilityItem, DashboardRole } from "@/lib/dashboard/types";

const iconMap = {
  students: Users,
  academics: GraduationCap,
  finance: CreditCard,
  inventory: Package,
  admissions: ClipboardList,
  communication: MessageSquareMore,
  staff: BriefcaseBusiness,
  reports: FileSpreadsheet,
  settings: Settings2,
} as const;

export function CapabilityGrid({
  role,
  capabilities,
}: {
  role: DashboardRole;
  capabilities: CapabilityItem[];
}) {
  return (
    <div data-testid="capability-grid" className="mt-8">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">
            System Surface
          </p>
          <h4 className="mt-2 text-2xl font-black tracking-tight text-foreground">
            Everything this role can operate
          </h4>
        </div>
        <p className="max-w-2xl text-sm leading-6 text-muted">
          The dashboard exposes the ERP surface area directly so operators can reach core systems in one or two clicks without hunting through modules.
        </p>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {capabilities.map((capability) => {
          const Icon = iconMap[capability.category];

          return (
            <Link
              key={capability.id}
              href={`/dashboard/${role}/${capability.href}`}
              data-testid="capability-card"
              className="rounded-[24px] border border-border bg-surface p-5 transition hover:-translate-y-0.5 hover:border-accent/35"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft">
                  <Icon className="h-5 w-5 text-accent" />
                </div>
                <StatusPill label={capability.label} tone={capability.status} />
              </div>
              <h5 className="mt-5 text-lg font-bold tracking-tight text-foreground">
                {capability.label}
              </h5>
              <p className="mt-3 text-sm leading-6 text-muted">
                {capability.description}
              </p>
              <div className="mt-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                <ShieldCheck className="h-3.5 w-3.5" />
                Tenant-scoped capability
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

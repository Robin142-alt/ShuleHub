"use client";

import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import type { StatusTone } from "@/lib/dashboard/types";

export interface ModuleShellSection {
  id: string;
  label: string;
  description: string;
  badge?: string;
  tone?: StatusTone;
}

export function ModuleShell({
  eyebrow,
  title,
  description,
  actions,
  meta,
  sections,
  activeSection,
  onSectionChange,
  children,
  sidebarFooter,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
  meta?: ReactNode;
  sections: ModuleShellSection[];
  activeSection: string;
  onSectionChange: (sectionId: string) => void;
  children: ReactNode;
  sidebarFooter?: ReactNode;
}) {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        actions={actions}
        meta={meta}
      />

      <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
        <Card className="h-fit p-3 xl:sticky xl:top-6">
          <div className="border-b border-border px-3 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
              Module Sections
            </p>
            <p className="mt-2 text-sm leading-6 text-muted">
              Move between daily queues, controls, and school-facing records without leaving
              the workspace.
            </p>
          </div>

          <div className="space-y-1 px-2 py-3">
            {sections.map((section) => {
              const active = section.id === activeSection;

              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => onSectionChange(section.id)}
                  className={`w-full rounded-xl border px-3 py-3 text-left transition duration-150 ${
                    active
                      ? "border-accent/20 bg-accent-soft text-accent"
                      : "border-transparent bg-transparent hover:border-border hover:bg-surface-muted"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{section.label}</p>
                      <p className="mt-1 text-xs leading-5 text-muted">{section.description}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {section.badge ? (
                        section.tone ? (
                          <StatusPill label={section.badge} tone={section.tone} />
                        ) : (
                          <span className="rounded-full bg-surface px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                            {section.badge}
                          </span>
                        )
                      ) : null}
                      <ChevronRight className="h-4 w-4" />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {sidebarFooter ? (
            <div className="border-t border-border px-3 py-3">{sidebarFooter}</div>
          ) : null}
        </Card>

        <div className="min-w-0 space-y-6">{children}</div>
      </div>
    </div>
  );
}

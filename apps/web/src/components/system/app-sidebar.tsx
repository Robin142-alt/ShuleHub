"use client";

import Link from "next/link";

import { Card } from "@/components/ui/card";
import type {
  ExperienceNavItem,
  ExperienceProfile,
} from "@/lib/experiences/types";

type SidebarVariant = "platform" | "school" | "portal";

const variantStyles: Record<
  SidebarVariant,
  {
    shell: string;
    active: string;
    idle: string;
    profileCard: string;
  }
> = {
  platform: {
    shell:
      "bg-white lg:bg-slate-950 lg:text-slate-50 lg:border-slate-900/80 lg:shadow-[0_1px_2px_rgba(15,23,42,0.32)]",
    active: "bg-emerald-500/12 text-foreground lg:bg-white/10 lg:text-white",
    idle: "text-muted hover:bg-surface-muted hover:text-foreground lg:text-slate-300 lg:hover:bg-white/6 lg:hover:text-white",
    profileCard:
      "border-border bg-surface lg:border-white/10 lg:bg-white/5 lg:text-slate-100",
  },
  school: {
    shell:
      "bg-white lg:rounded-2xl lg:border lg:border-border lg:shadow-[0_1px_2px_rgba(15,23,42,0.06)]",
    active: "bg-accent-soft text-foreground",
    idle: "text-muted hover:bg-surface-muted hover:text-foreground",
    profileCard: "border-border bg-surface",
  },
  portal: {
    shell:
      "bg-white lg:rounded-2xl lg:border lg:border-border lg:shadow-[0_1px_2px_rgba(15,23,42,0.06)]",
    active: "bg-emerald-50 text-foreground",
    idle: "text-muted hover:bg-surface-muted hover:text-foreground",
    profileCard: "border-border bg-emerald-50/60",
  },
};

export function AppSidebar({
  variant,
  brand,
  navItems,
  activeHref,
  profile,
  mobileOpen,
  onClose,
}: {
  variant: SidebarVariant;
  brand: { title: string; subtitle: string };
  navItems: ExperienceNavItem[];
  activeHref: string;
  profile: ExperienceProfile;
  mobileOpen: boolean;
  onClose: () => void;
}) {
  const styles = variantStyles[variant];
  const groupedItems = navItems.reduce<Array<{ group: string; items: ExperienceNavItem[] }>>(
    (groups, item) => {
      const groupLabel = item.group ?? "Workspace";
      const existingGroup = groups.find((entry) => entry.group === groupLabel);

      if (existingGroup) {
        existingGroup.items.push(item);
        return groups;
      }

      groups.push({ group: groupLabel, items: [item] });
      return groups;
    },
    [],
  );

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 w-[240px] transform border-r border-border px-4 py-5 shadow-sm transition duration-150 lg:static lg:translate-x-0 ${styles.shell} ${
        mobileOpen ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted lg:text-inherit/60">
            Workspace
          </p>
          <p className="mt-2 text-lg font-semibold text-foreground lg:text-inherit">
            {brand.title}
          </p>
          <p className="mt-1 text-sm text-muted lg:text-inherit/70">
            {brand.subtitle}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-border px-3 py-2 text-sm font-medium text-muted lg:hidden"
        >
          Close
        </button>
      </div>

      <nav className="mt-6 space-y-5">
        {groupedItems.map((group) => (
          <div key={group.group} className="space-y-1.5">
            <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted lg:text-inherit/50">
              {group.group}
            </p>
            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive = activeHref === item.href;

              return (
                <Link
                  key={item.id}
                  href={item.href}
                  onClick={onClose}
                  className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition duration-150 ${
                    isActive ? styles.active : styles.idle
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {item.badge ? (
                    <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-semibold text-muted lg:bg-white/10 lg:text-inherit">
                      {item.badge}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <Card className={`mt-6 p-4 ${styles.profileCard}`}>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted lg:text-inherit/70">
          Active session
        </p>
        <p className="mt-3 text-sm font-semibold text-foreground lg:text-inherit">
          {profile.name}
        </p>
        <p className="mt-1 text-sm text-muted lg:text-inherit/70">
          {profile.roleLabel}
        </p>
        <p className="mt-3 text-xs uppercase tracking-[0.16em] text-muted lg:text-inherit/60">
          {profile.contextLabel}
        </p>
      </Card>
    </aside>
  );
}

"use client";

import { Bell, Menu, Search } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import type { ExperienceNavItem, ExperienceProfile } from "@/lib/experiences/types";

function SidebarNav({
  navItems,
  activeHref,
  onNavigate,
}: {
  navItems: ExperienceNavItem[];
  activeHref: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="space-y-1.5">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = activeHref === item.href;

        return (
          <Link
            key={item.id}
            href={item.href}
            onClick={onNavigate}
            className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition duration-150 ${
              isActive
                ? "bg-accent-soft text-foreground"
                : "text-muted hover:bg-surface-muted hover:text-foreground"
            }`}
          >
            <span className="flex min-w-0 items-center gap-3">
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </span>
            {item.badge ? (
              <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-semibold text-muted">
                {item.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

export function WorkspaceShell({
  brand,
  navItems,
  activeHref,
  topLabel,
  title,
  subtitle,
  actions,
  profile,
  status,
  children,
}: {
  brand: { title: string; subtitle: string };
  navItems: ExperienceNavItem[];
  activeHref: string;
  topLabel: string;
  title: string;
  subtitle: string;
  actions?: ReactNode;
  profile: ExperienceProfile;
  status?: { label: string; tone: "ok" | "warning" | "critical" };
  children: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto grid min-h-screen max-w-[1400px] gap-6 px-4 py-4 md:px-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:px-8">
        <aside
          className={`fixed inset-y-0 left-0 z-40 w-[240px] transform border-r border-border bg-white px-4 py-5 shadow-sm transition duration-150 lg:static lg:translate-x-0 lg:rounded-2xl lg:border lg:shadow-[0_1px_2px_rgba(15,23,42,0.06)] ${
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-lg font-semibold text-foreground">{brand.title}</p>
              <p className="mt-1 text-sm text-muted">{brand.subtitle}</p>
            </div>
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="rounded-xl border border-border px-3 py-2 text-sm font-medium text-muted lg:hidden"
            >
              Close
            </button>
          </div>

          <div className="mt-6">
            <SidebarNav
              navItems={navItems}
              activeHref={activeHref}
              onNavigate={() => setMobileOpen(false)}
            />
          </div>

          <Card className="mt-6 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
              Signed in
            </p>
            <p className="mt-3 text-sm font-semibold text-foreground">{profile.name}</p>
            <p className="mt-1 text-sm text-muted">{profile.roleLabel}</p>
            <p className="mt-3 text-xs uppercase tracking-[0.16em] text-muted">
              {profile.contextLabel}
            </p>
          </Card>
        </aside>

        {mobileOpen ? (
          <button
            type="button"
            aria-label="Close sidebar backdrop"
            onClick={() => setMobileOpen(false)}
            className="fixed inset-0 z-30 bg-slate-950/30 lg:hidden"
          />
        ) : null}

        <div className="min-w-0">
          <header className="sticky top-4 z-20 mb-6 rounded-2xl border border-border bg-white px-4 py-3 shadow-sm md:px-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <button
                  type="button"
                  onClick={() => setMobileOpen(true)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface lg:hidden"
                >
                  <Menu className="h-4 w-4 text-foreground" />
                </button>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                    {topLabel}
                  </p>
                  <h1 className="mt-1 text-2xl font-bold text-foreground">{title}</h1>
                  <p className="mt-1 max-w-3xl text-sm leading-6 text-muted">{subtitle}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                <label className="flex min-w-[240px] items-center gap-2 rounded-xl border border-border bg-surface-muted px-3 py-2">
                  <Search className="h-4 w-4 text-muted" />
                  <input
                    type="search"
                    placeholder="Search records, reports, or families"
                    className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
                  />
                </label>
                {status ? <StatusPill label={status.label} tone={status.tone} /> : null}
                <button
                  type="button"
                  aria-label="Notifications"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface"
                >
                  <Bell className="h-4 w-4 text-foreground" />
                </button>
                {actions}
              </div>
            </div>
          </header>

          <main className="space-y-6">{children}</main>
        </div>
      </div>
    </div>
  );
}

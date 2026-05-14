"use client";

import {
  BarChart3,
  ClipboardList,
  GraduationCap,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Settings,
  Smartphone,
  Users,
  Wallet,
  X,
  Package,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { getRoleSidebar, roleLabels } from "@/lib/dashboard/role-config";
import type { DashboardRole } from "@/lib/dashboard/types";

const iconMap = {
  dashboard: LayoutDashboard,
  students: Users,
  inventory: Package,
  admissions: ClipboardList,
  finance: Wallet,
  mpesa: Smartphone,
  academics: GraduationCap,
  communication: MessageSquare,
  reports: BarChart3,
  settings: Settings,
} as const;

function SidebarContent({
  role,
  onNavigate,
}: {
  role: DashboardRole;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const items = getRoleSidebar(role);

  // Separate main items from bottom items (settings)
  const mainItems = items.filter((item) => item.id !== "settings");
  const bottomItems = items.filter((item) => item.id === "settings");

  return (
    <>
      {/* Brand */}
      <div className="border-b border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] bg-accent text-white shadow-sm">
            <span className="text-sm font-bold tracking-tight">S</span>
          </div>
          <div className="min-w-0">
            <p className="truncate text-[14px] font-semibold text-foreground tracking-tight">
              ShuleHub
            </p>
            <p className="truncate text-[11px] text-muted">
              {roleLabels[role]}
            </p>
          </div>
        </div>
      </div>

      {/* Navigation Label */}
      <div className="px-5 pt-4 pb-1">
        <p className="eyebrow">Navigation</p>
      </div>

      {/* Main Nav */}
      <nav className="flex-1 custom-scrollbar overflow-y-auto px-3 pb-3">
        <div className="space-y-0.5">
          {mainItems.map((item) => {
            const Icon = iconMap[item.id as keyof typeof iconMap] ?? LayoutDashboard;
            const href =
              item.href === "dashboard"
                ? `/dashboard/${role}`
                : `/dashboard/${role}/${item.href}`;
            const active = pathname === href;

            return (
              <Link
                key={item.id}
                href={href}
                onClick={onNavigate}
                className={`flex items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2 text-[13px] font-medium transition-all duration-150 ${
                  active
                    ? "bg-accent-soft text-accent shadow-sm"
                    : "text-muted-strong hover:bg-surface-strong hover:text-foreground"
                }`}
              >
                <Icon className={`h-[18px] w-[18px] shrink-0 ${active ? "text-accent" : ""}`} />
                <span>{item.label}</span>
                {active ? (
                  <div className="ml-auto h-1.5 w-1.5 rounded-full bg-accent" />
                ) : null}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Bottom section */}
      <div className="border-t border-border px-3 py-3 space-y-0.5">
        {bottomItems.map((item) => {
          const Icon = iconMap[item.id as keyof typeof iconMap] ?? Settings;
          const href = `/dashboard/${role}/${item.href}`;
          const active = pathname === href;

          return (
            <Link
              key={item.id}
              href={href}
              onClick={onNavigate}
              className={`flex items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2 text-[13px] font-medium transition-all duration-150 ${
                active
                  ? "bg-accent-soft text-accent"
                  : "text-muted-strong hover:bg-surface-strong hover:text-foreground"
              }`}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2 text-[13px] font-medium text-muted-strong transition-all duration-150 hover:bg-surface-strong hover:text-foreground"
        >
          <HelpCircle className="h-[18px] w-[18px] shrink-0" />
          <span>Help & Support</span>
        </button>
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2 text-[13px] font-medium text-danger/80 transition-all duration-150 hover:bg-danger-soft hover:text-danger"
        >
          <LogOut className="h-[18px] w-[18px] shrink-0" />
          <span>Sign out</span>
        </button>
      </div>
    </>
  );
}

export function Sidebar({
  role,
  mobileOpen,
  onMobileClose,
}: {
  role: DashboardRole;
  mobileOpen: boolean;
  onMobileClose: () => void;
}) {
  return (
    <>
      {/* Desktop sidebar — fixed left panel */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[var(--sidebar-width)] overflow-hidden border-r border-border bg-surface md:flex md:flex-col">
        <SidebarContent role={role} />
      </aside>

      {/* Mobile overlay */}
      {mobileOpen ? (
        <div
          className="fixed inset-0 z-40 bg-[#0f172a]/30 backdrop-blur-[2px] md:hidden"
          onClick={onMobileClose}
        >
          <aside
            className="slide-in-sidebar h-full w-[280px] overflow-hidden border-r border-border bg-surface shadow-lg"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <p className="text-sm font-semibold text-foreground">Navigation</p>
              <button
                type="button"
                onClick={onMobileClose}
                className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] border border-border text-muted transition-colors hover:bg-surface-strong"
                aria-label="Close sidebar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex h-[calc(100%-49px)] flex-col">
              <SidebarContent role={role} onNavigate={onMobileClose} />
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}

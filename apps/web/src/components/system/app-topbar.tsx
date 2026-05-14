"use client";

import { Bell, Menu, Search } from "lucide-react";
import { startTransition, useDeferredValue, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { StatusPill } from "@/components/ui/status-pill";
import type {
  ExperienceNavItem,
  ExperienceNotificationItem,
} from "@/lib/experiences/types";

type TopbarVariant = "platform" | "school" | "portal";

const searchPlaceholderByVariant: Record<TopbarVariant, string> = {
  platform: "Search tenants, billing, or incidents",
  school: "Search students, fees, or support",
  portal: "Search fees, results, or messages",
};

const shellStyles: Record<TopbarVariant, string> = {
  platform:
    "bg-white lg:border-slate-900/10 lg:bg-white lg:shadow-[0_1px_2px_rgba(15,23,42,0.10)]",
  school: "bg-white",
  portal: "bg-white",
};

export function AppTopbar({
  variant,
  navItems,
  notifications = [],
  topLabel,
  title,
  subtitle,
  actions,
  status,
  onOpenSidebar,
}: {
  variant: TopbarVariant;
  navItems: ExperienceNavItem[];
  notifications?: ExperienceNotificationItem[];
  topLabel: string;
  title: string;
  subtitle: string;
  actions?: ReactNode;
  status?: { label: string; tone: "ok" | "warning" | "critical" };
  onOpenSidebar: () => void;
}) {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [showSearchPanel, setShowSearchPanel] = useState(false);
  const [showNotificationsPanel, setShowNotificationsPanel] = useState(false);
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const normalizedSearchTerm = deferredSearchTerm.trim().toLowerCase();
  const filteredSearchItems =
    normalizedSearchTerm.length > 0
      ? navItems
          .filter((item) =>
            `${item.label} ${item.group ?? ""}`.toLowerCase().includes(normalizedSearchTerm),
          )
          .slice(0, 6)
      : [];

  const runNavigation = (href: string) => {
    setSearchTerm("");
    setShowSearchPanel(false);
    setShowNotificationsPanel(false);

    startTransition(() => {
      router.push(href);
    });
  };

  return (
    <header
      className={`sticky top-4 z-20 mb-6 rounded-2xl border border-border px-4 py-3 shadow-sm md:px-5 ${shellStyles[variant]}`}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <button
            type="button"
            onClick={onOpenSidebar}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface lg:hidden"
          >
            <Menu className="h-4 w-4 text-foreground" />
          </button>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
              {topLabel}
            </p>
            <h1 className="mt-1 text-2xl font-bold text-foreground">{title}</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted">{subtitle}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <div className="relative min-w-[240px]">
            <label className="flex items-center gap-2 rounded-xl border border-border bg-surface-muted px-3 py-2 transition duration-150 focus-within:border-border-strong focus-within:bg-white">
              <Search className="h-4 w-4 text-muted" />
              <input
                type="search"
                aria-label="Workspace search"
                placeholder={searchPlaceholderByVariant[variant]}
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                onFocus={() => {
                  setShowSearchPanel(true);
                  setShowNotificationsPanel(false);
                }}
                onBlur={() => {
                  window.setTimeout(() => setShowSearchPanel(false), 120);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && filteredSearchItems[0]) {
                    event.preventDefault();
                    runNavigation(filteredSearchItems[0].href);
                  }
                }}
                className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
              />
            </label>
            {showSearchPanel && normalizedSearchTerm ? (
              <div
                data-testid="workspace-search-panel"
                className="fade-in-panel absolute left-0 right-0 top-[calc(100%+6px)] z-30 rounded-2xl border border-border bg-surface p-2 shadow-lg"
              >
                {filteredSearchItems.length > 0 ? (
                  filteredSearchItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => runNavigation(item.href)}
                      className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition duration-150 hover:bg-surface-muted"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">{item.label}</p>
                        <p className="text-xs text-muted">{item.group ?? "Workspace"}</p>
                      </div>
                      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                        Open
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="rounded-xl px-3 py-3 text-sm text-muted">
                    No workspace results for &ldquo;{deferredSearchTerm}&rdquo;.
                  </div>
                )}
              </div>
            ) : null}
          </div>
          {status ? <StatusPill label={status.label} tone={status.tone} /> : null}
          <div className="relative">
            <button
              type="button"
              aria-label="Notifications"
              aria-expanded={showNotificationsPanel}
              onClick={() => {
                setShowNotificationsPanel((value) => !value);
                setShowSearchPanel(false);
              }}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface transition duration-150 hover:border-border-strong hover:bg-surface-muted"
            >
              <Bell className="h-4 w-4 text-foreground" />
            </button>
            {showNotificationsPanel ? (
              <div
                data-testid="workspace-notifications-panel"
                className="fade-in-panel absolute right-0 top-[calc(100%+6px)] z-30 w-[320px] rounded-2xl border border-border bg-surface p-2 shadow-lg"
              >
                <div className="flex items-center justify-between gap-3 px-2 py-1">
                  <p className="text-sm font-semibold text-foreground">Notifications</p>
                  <StatusPill
                    label={`${notifications.length}`}
                    tone={notifications.some((item) => item.tone === "critical") ? "critical" : "ok"}
                    compact
                  />
                </div>
                <div className="custom-scrollbar max-h-[300px] space-y-1 overflow-y-auto">
                  {notifications.length > 0 ? (
                    notifications.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          if (item.href) {
                            runNavigation(item.href);
                            return;
                          }

                          setShowNotificationsPanel(false);
                        }}
                        className="flex w-full items-start justify-between gap-3 rounded-xl px-3 py-2 text-left transition duration-150 hover:bg-surface-muted"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground">{item.title}</p>
                          <p className="mt-1 text-xs leading-5 text-muted">{item.detail}</p>
                          <p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-muted">
                            {item.timeLabel}
                          </p>
                        </div>
                        <StatusPill label={item.tone} tone={item.tone} compact />
                      </button>
                    ))
                  ) : (
                    <div className="rounded-xl px-3 py-4 text-sm text-muted">
                      No notifications are open for this workspace.
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
          {actions}
        </div>
      </div>
    </header>
  );
}

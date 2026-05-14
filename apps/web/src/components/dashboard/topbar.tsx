"use client";

import {
  Bell,
  CircleAlert,
  ChevronDown,
  CircleUserRound,
  LoaderCircle,
  LogIn,
  LogOut,
  Menu,
  Search,
  ShieldCheck,
  Wifi,
  WifiOff,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useDeferredValue, useState } from "react";

import { StatusPill } from "@/components/ui/status-pill";
import type { LiveAuthUser } from "@/lib/dashboard/api-client";
import { getRoleSidebar } from "@/lib/dashboard/role-config";
import { isProductionReadyHref } from "@/lib/features/module-readiness";
import type {
  AlertItem,
  CapabilityItem,
  DashboardRole,
  NotificationItem,
  QuickActionItem,
  SyncIndicator,
  TenantOption,
} from "@/lib/dashboard/types";

type SelectorOption = {
  id: string;
  label: string;
};

type SearchItem = {
  id: string;
  label: string;
  description: string;
  href: string;
  kind: "module" | "action" | "alert" | "notification" | "capability" | "student";
};

function normalizeSearchableText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function Topbar({
  role,
  tenantId,
  tenants,
  notifications,
  alerts,
  quickActions,
  capabilities,
  sync,
  online,
  pageTitle,
  tenantName,
  onTenantChange,
  currentTerm,
  academicYear,
  termOptions,
  yearOptions,
  liveApiConfigured,
  liveUser,
  liveSessionLoading,
  liveSessionSubmitting,
  liveSessionError,
  onLiveLogin,
  onLiveLogout,
  onOpenSidebar,
  supplementalSearchItems = [],
}: {
  role: DashboardRole;
  tenantId: string;
  tenants: TenantOption[];
  notifications: NotificationItem[];
  alerts: AlertItem[];
  quickActions: QuickActionItem[];
  capabilities: CapabilityItem[];
  sync: SyncIndicator;
  online: boolean;
  pageTitle: string;
  pageDescription: string;
  tenantName: string;
  tenantCounty: string;
  onTenantChange: (tenantId: string) => void;
  currentTerm: string;
  academicYear: string;
  termOptions: SelectorOption[];
  yearOptions: SelectorOption[];
  liveApiConfigured: boolean;
  liveUser: LiveAuthUser | null;
  liveSessionLoading: boolean;
  liveSessionSubmitting: boolean;
  liveSessionError: string | null;
  onLiveLogin: (email: string, password: string) => Promise<void>;
  onLiveLogout: () => void;
  onOpenSidebar: () => void;
  supplementalSearchItems?: SearchItem[];
}) {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [showSearchPanel, setShowSearchPanel] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showSyncPanel, setShowSyncPanel] = useState(false);
  const [showProfilePanel, setShowProfilePanel] = useState(false);
  const [selectedTerm, setSelectedTerm] = useState(currentTerm);
  const [selectedYear, setSelectedYear] = useState(academicYear);
  const [liveEmail, setLiveEmail] = useState("");
  const [livePassword, setLivePassword] = useState("");
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const normalizedSearchTerm = normalizeSearchableText(deferredSearchTerm);

  const searchItems: SearchItem[] = [
    ...getRoleSidebar(role).map((item) => ({
      id: `module-${item.id}`,
      label: item.label,
      description: `${item.label} workspace`,
      href:
        item.href === "dashboard"
          ? `/dashboard/${role}`
          : `/dashboard/${role}/${item.href}`,
      kind: "module" as const,
    })),
    ...quickActions.map((action) => ({
      id: `action-${action.id}`,
      label: action.label,
      description: action.description,
      href: `/dashboard/${role}/${action.href}`,
      kind: "action" as const,
    })),
    ...alerts.map((alert) => ({
      id: `alert-${alert.id}`,
      label: alert.title,
      description: alert.description,
      href: alert.href,
      kind: "alert" as const,
    })),
    ...notifications.map((notification) => ({
      id: `notification-${notification.id}`,
      label: notification.title,
      description: `Notification - ${notification.timeLabel}`,
      href: notification.href,
      kind: "notification" as const,
    })),
    ...capabilities.map((capability) => ({
      id: `capability-${capability.id}`,
      label: capability.label,
      description: capability.description,
      href: `/dashboard/${role}/${capability.href}`,
      kind: "capability" as const,
    })),
    ...supplementalSearchItems,
  ].filter((item) => isProductionReadyHref(item.href));

  const filteredSearchItems = searchItems
    .filter((item) => {
      if (!normalizedSearchTerm) {
        return false;
      }

      return normalizeSearchableText(
        `${item.label} ${item.description} ${item.kind}`,
      ).includes(normalizedSearchTerm);
    })
    .slice(0, 6);

  const closeFloatingPanels = () => {
    setShowSearchPanel(false);
    setShowNotifications(false);
    setShowSyncPanel(false);
    setShowProfilePanel(false);
  };

  const runSearchNavigation = (href: string) => {
    setSearchTerm("");
    closeFloatingPanels();

    startTransition(() => {
      router.push(href);
    });
  };

  const handleLiveLogin = async () => {
    if (!liveEmail.trim() || !livePassword.trim()) {
      return;
    }

    try {
      await onLiveLogin(liveEmail.trim(), livePassword);
      setLivePassword("");
    } catch {
      return;
    }
  };

  const unresolvedNotifications = notifications.filter(
    (n) => n.severity === "critical" || n.severity === "warning",
  ).length;

  return (
    <div
      data-testid="topbar"
      className="flex items-center gap-3 rounded-[var(--radius)] border border-border bg-surface px-4 py-2.5 shadow-xs"
    >
      {/* Mobile menu button */}
      <button
        type="button"
        onClick={onOpenSidebar}
        aria-label="Open sidebar"
        className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] text-muted transition-colors hover:bg-surface-strong hover:text-foreground md:hidden"
      >
        <Menu className="h-4 w-4" />
      </button>

      {/* Left: Page context */}
      <div className="hidden min-w-0 md:block">
        <div className="flex items-center gap-2">
          <p className="text-[13px] font-semibold text-foreground truncate">{tenantName}</p>
          <span className="text-border">·</span>
          <p className="text-[13px] text-muted truncate">{pageTitle}</p>
        </div>
      </div>

      {/* Mobile: tenant name only */}
      <p className="text-[13px] font-semibold text-foreground truncate md:hidden">{tenantName}</p>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Search */}
      <div className="relative hidden sm:block sm:w-56 lg:w-64">
        <label className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-border bg-surface-muted px-3 py-1.5">
          <Search className="h-3.5 w-3.5 text-muted" />
          <input
            type="search"
            aria-label="Global search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            onFocus={() => {
              setShowSearchPanel(true);
              setShowNotifications(false);
              setShowSyncPanel(false);
              setShowProfilePanel(false);
            }}
            onBlur={() => {
              window.setTimeout(() => setShowSearchPanel(false), 120);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && filteredSearchItems[0]) {
                event.preventDefault();
                runSearchNavigation(filteredSearchItems[0].href);
              }
            }}
            placeholder="Search students, payments, or modules"
            className="w-full bg-transparent text-[13px] outline-none placeholder:text-muted"
          />
          <kbd className="hidden rounded border border-border bg-surface px-1.5 py-0.5 text-[10px] font-medium text-muted lg:inline">
            ⌘K
          </kbd>
        </label>

        {showSearchPanel && normalizedSearchTerm ? (
          <div
            data-testid="search-panel"
            className="fade-in-panel absolute left-0 right-0 top-[calc(100%+4px)] z-20 rounded-[var(--radius)] border border-border bg-surface p-1 shadow-lg"
          >
            {filteredSearchItems.length === 0 ? (
              <div className="rounded-[var(--radius-sm)] px-3 py-3 text-[13px] text-muted">
                No results for &ldquo;{deferredSearchTerm}&rdquo;
              </div>
            ) : (
              filteredSearchItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  data-testid="search-result"
                  onClick={() => runSearchNavigation(item.href)}
                  className="flex w-full items-center justify-between gap-3 rounded-[var(--radius-sm)] px-3 py-2 text-left transition-colors hover:bg-surface-muted"
                >
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-foreground">{item.label}</p>
                    <p className="text-[11px] text-muted truncate">{item.description}</p>
                  </div>
                  <span className="badge badge-neutral shrink-0">
                    {item.kind}
                  </span>
                </button>
              ))
            )}
          </div>
        ) : null}
      </div>

      {/* Term/Year selector — hidden on small screens */}
      <div className="hidden items-center rounded-[var(--radius-sm)] border border-border bg-surface-muted lg:flex">
        <select
          aria-label="Select term"
          value={selectedTerm}
          onChange={(event) => setSelectedTerm(event.target.value)}
          className="bg-transparent px-2 py-1.5 text-[12px] font-medium text-foreground outline-none"
        >
          {termOptions.map((option) => (
            <option key={option.id} value={option.label}>
              {option.label}
            </option>
          ))}
        </select>
        <span className="text-border text-xs">|</span>
        <select
          aria-label="Select academic year"
          value={selectedYear}
          onChange={(event) => setSelectedYear(event.target.value)}
          className="bg-transparent px-2 py-1.5 text-[12px] font-medium text-foreground outline-none"
        >
          {yearOptions.map((option) => (
            <option key={option.id} value={option.label}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {/* Tenant selector — single line */}
      <label className="hidden items-center rounded-[var(--radius-sm)] border border-border bg-surface-muted px-2 py-1.5 lg:flex">
        <select
          aria-label="Switch tenant"
          value={tenantId}
          onChange={(event) => onTenantChange(event.target.value)}
          className="bg-transparent text-[12px] font-medium text-foreground outline-none"
        >
          {tenants.map((tenant) => (
            <option key={tenant.id} value={tenant.id}>
              {tenant.name}
            </option>
          ))}
        </select>
        <ChevronDown className="h-3 w-3 text-muted ml-1" />
      </label>

      {/* Sync indicator */}
      <div className="relative">
        <button
          type="button"
          aria-label={online ? "Current sync status" : "Offline queue status"}
          aria-expanded={showSyncPanel}
          onClick={() => {
            setShowSyncPanel((value) => !value);
            setShowNotifications(false);
            setShowProfilePanel(false);
          }}
          className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] text-muted transition-colors hover:bg-surface-strong"
        >
          {online ? (
            <Wifi className="h-4 w-4 text-success" />
          ) : (
            <WifiOff className="h-4 w-4 text-warning" />
          )}
        </button>

        {showSyncPanel ? (
          <div
            data-testid="sync-panel"
            className="fade-in-panel absolute right-0 top-[calc(100%+4px)] z-20 w-[260px] rounded-[var(--radius)] border border-border bg-surface p-3.5 shadow-lg"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="section-title">Sync status</p>
              <StatusPill label={online ? sync.label : "Offline mode active"} tone={online ? sync.state : "warning"} />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="rounded-[var(--radius-sm)] bg-surface-muted px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Pending</p>
                <p className="mt-1 text-base font-bold text-foreground finance-number">{sync.pendingCount}</p>
              </div>
              <div className="rounded-[var(--radius-sm)] bg-surface-muted px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Failed</p>
                <p className="mt-1 text-base font-bold text-foreground finance-number">{sync.failedCount}</p>
              </div>
              <div className="rounded-[var(--radius-sm)] bg-surface-muted px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Last sync</p>
                <p className="mt-1 text-xs font-medium text-foreground">{sync.lastSyncedAt}</p>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Notifications */}
      <div className="relative">
        <button
          type="button"
          aria-label="Open notifications"
          aria-expanded={showNotifications}
          onClick={() => {
            setShowNotifications((value) => !value);
            setShowSyncPanel(false);
            setShowProfilePanel(false);
          }}
          className="relative inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] text-muted transition-colors hover:bg-surface-strong"
        >
          <Bell className="h-4 w-4" />
          {unresolvedNotifications > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
              {unresolvedNotifications}
            </span>
          ) : null}
        </button>

        {showNotifications ? (
          <div
            data-testid="notifications-panel"
            className="fade-in-panel absolute right-0 top-[calc(100%+4px)] z-20 w-[300px] rounded-[var(--radius)] border border-border bg-surface p-2.5 shadow-lg"
          >
            <div className="mb-2 flex items-center justify-between gap-3 px-1">
              <p className="section-title">Notifications</p>
              <span className="badge badge-neutral">{notifications.length}</span>
            </div>
            <div className="custom-scrollbar max-h-[280px] space-y-1 overflow-y-auto">
              {notifications.map((notification) => (
                <Link
                  key={notification.id}
                  href={notification.href}
                  className="block rounded-[var(--radius-sm)] px-3 py-2 transition-colors hover:bg-surface-muted"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-foreground truncate">
                        {notification.title}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted">
                        {notification.timeLabel}
                      </p>
                    </div>
                    <StatusPill label={notification.severity} tone={notification.severity} compact />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {/* Profile/Live Data */}
      <div className="relative">
        <button
          type="button"
          aria-label="Open live data profile"
          aria-expanded={showProfilePanel}
          onClick={() => {
            setShowProfilePanel((value) => !value);
            setShowNotifications(false);
            setShowSyncPanel(false);
            setShowSearchPanel(false);
          }}
          className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-sm)] px-2 transition-colors hover:bg-surface-strong"
        >
          {liveUser ? (
            <ShieldCheck className="h-4 w-4 text-success" />
          ) : (
            <CircleUserRound className="h-4 w-4 text-muted" />
          )}
          <span className="hidden text-[12px] font-medium text-foreground lg:inline">
            {liveUser ? liveUser.display_name.split(" ")[0] : "Live"}
          </span>
        </button>

        {showProfilePanel ? (
          <div
            data-testid="live-profile-panel"
            className="fade-in-panel absolute right-0 top-[calc(100%+4px)] z-20 w-[290px] rounded-[var(--radius)] border border-border bg-surface p-3.5 shadow-lg"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="section-title">Production service</p>
                <p className="mt-0.5 text-[11px] text-muted">
                  Tenant-scoped live data
                </p>
              </div>
              <StatusPill
                label={
                  liveSessionLoading
                    ? "Checking"
                    : liveUser
                      ? "Connected"
                      : liveApiConfigured
                        ? "Ready"
                        : "Unavailable"
                }
                tone={
                  liveSessionLoading
                    ? "warning"
                    : liveUser
                      ? "ok"
                      : liveApiConfigured
                        ? "warning"
                        : "critical"
                }
              />
            </div>

            {liveSessionError ? (
              <div className="mt-3 flex gap-2 rounded-[var(--radius-sm)] border border-danger/20 bg-danger-soft px-3 py-2">
                <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" />
                <p className="text-[13px] text-foreground">{liveSessionError}</p>
              </div>
            ) : null}

            {liveUser ? (
              <div className="mt-3 space-y-3">
                <div className="rounded-[var(--radius-sm)] bg-surface-muted px-3 py-2.5">
                  <p className="text-[13px] font-semibold text-foreground">
                    {liveUser.display_name}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted">{liveUser.email}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <StatusPill label={liveUser.role} tone="ok" />
                    <StatusPill label={liveUser.tenant_id ?? "Platform"} tone="warning" />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onLiveLogout();
                    setShowProfilePanel(false);
                  }}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2 text-[13px] font-semibold text-foreground transition-colors hover:bg-surface-muted"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Disconnect
                </button>
              </div>
            ) : liveApiConfigured ? (
              <div className="mt-3 space-y-2">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted">
                    Email
                  </span>
                  <input
                    type="email"
                    value={liveEmail}
                    onChange={(event) => setLiveEmail(event.target.value)}
                    placeholder="School account email"
                    className="input-base"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted">
                    Password
                  </span>
                  <input
                    type="password"
                    value={livePassword}
                    onChange={(event) => setLivePassword(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void handleLiveLogin();
                      }
                    }}
                    placeholder="Enter password"
                    className="input-base"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void handleLiveLogin()}
                  disabled={
                    liveSessionLoading ||
                    liveSessionSubmitting ||
                    !liveEmail.trim() ||
                    !livePassword.trim()
                  }
                  className="inline-flex w-full items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-accent px-3 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {liveSessionSubmitting ? (
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <LogIn className="h-3.5 w-3.5" />
                  )}
                  {liveSessionSubmitting ? "Connecting..." : "Connect"}
                </button>
              </div>
            ) : (
              <div className="mt-3 rounded-[var(--radius-sm)] bg-surface-muted px-3 py-2.5">
                <p className="text-[13px] text-muted">
                  Live account access is currently unavailable for this workspace.
                </p>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

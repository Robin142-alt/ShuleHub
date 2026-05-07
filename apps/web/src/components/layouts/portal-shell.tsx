"use client";

import {
  Bell,
  BookOpen,
  CalendarCheck,
  Download,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Wallet,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

const portalNavItems = [
  { id: "dashboard", label: "Dashboard", href: "", icon: LayoutDashboard },
  { id: "fees", label: "Fees", href: "/fees", icon: Wallet },
  { id: "academics", label: "Academics", href: "/academics", icon: BookOpen },
  { id: "attendance", label: "Attendance", href: "/attendance", icon: CalendarCheck },
  { id: "messages", label: "Messages", href: "/messages", icon: MessageSquare, badge: "2" },
  { id: "downloads", label: "Downloads", href: "/downloads", icon: Download },
  { id: "notifications", label: "Notifications", href: "/notifications", icon: Bell, badge: "3" },
];

export function PortalShell({
  viewer,
  studentName,
  schoolName,
  userName,
  onLogout,
  children,
}: {
  viewer: string;
  studentName?: string;
  schoolName?: string;
  userName?: string;
  onLogout?: () => void;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const basePath = `/portal/${viewer}`;

  return (
    <div className="min-h-screen bg-[#f0f4ff]">
      {/* Desktop Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[240px] flex-col border-r border-blue-100/60 bg-white lg:flex">
        {/* Brand */}
        <div className="border-b border-blue-100/60 px-5 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-sky-600 shadow-sm shadow-blue-200">
              <span className="text-sm font-bold text-white">SH</span>
            </div>
            <div className="min-w-0">
              <p className="truncate text-[14px] font-semibold text-[#1a1d26]">ShuleHub Portal</p>
              <p className="text-[11px] text-[#8b8f9a]">{viewer === "parent" ? "Family access" : "Student access"}</p>
            </div>
          </div>
        </div>

        {/* Student info */}
        <div className="border-b border-blue-100/60 px-5 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8b8f9a]">
            {viewer === "parent" ? "Your child" : "Your profile"}
          </p>
          <p className="mt-2 text-sm font-semibold text-[#1a1d26]">{studentName ?? "Aisha Njeri"}</p>
          <p className="mt-1 text-[12px] text-[#8b8f9a]">Grade 7 Hope • {schoolName ?? "Greenfield Academy"}</p>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-3 custom-scrollbar">
          <div className="space-y-1">
            {portalNavItems.map((item) => {
              const Icon = item.icon;
              const href = item.href ? `${basePath}${item.href}` : basePath;
              const isActive = item.href === "" ? pathname === basePath : pathname.startsWith(`${basePath}${item.href}`);
              return (
                <Link key={item.id} href={href} className={`group flex items-center justify-between rounded-2xl px-4 py-3 text-[14px] font-medium transition-all duration-150 ${isActive ? "bg-blue-50 text-blue-700 shadow-sm shadow-blue-100" : "text-[#5a5e6a] hover:bg-[#f3f5fc] hover:text-[#1a1d26]"}`}>
                  <span className="flex items-center gap-3">
                    <Icon className={`h-5 w-5 shrink-0 ${isActive ? "text-blue-600" : "text-[#9ca0ab]"}`} />
                    <span>{item.label}</span>
                  </span>
                  {item.badge ? (
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${isActive ? "bg-blue-100 text-blue-700" : "bg-[#f0f2f5] text-[#8b8f9a]"}`}>{item.badge}</span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Bottom */}
        <div className="border-t border-blue-100/60 px-3 py-3">
          <button type="button" onClick={onLogout} className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-[14px] font-medium text-red-500/70 transition hover:bg-red-50 hover:text-red-600">
            <LogOut className="h-5 w-5 shrink-0" /><span>Sign out</span>
          </button>
        </div>
        <div className="border-t border-blue-100/60 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-sky-500 text-xs font-bold text-white shadow-sm">{(userName ?? "MN").slice(0, 2).toUpperCase()}</div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-[#1a1d26]">{userName ?? "Margaret Njeri"}</p>
              <p className="text-[11px] text-[#8b8f9a]">{viewer === "parent" ? "Parent" : "Student"}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile Overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-[#1a1d26]/30 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="slide-in-sidebar absolute inset-y-0 left-0 w-[280px] border-r border-blue-100/60 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-blue-100/60 px-5 py-4">
              <p className="text-sm font-semibold text-[#1a1d26]">Menu</p>
              <button type="button" onClick={() => setMobileOpen(false)} className="rounded-xl border border-blue-100 p-2 text-[#8b8f9a]"><X className="h-4 w-4" /></button>
            </div>
            <div className="border-b border-blue-100/60 px-5 py-4">
              <p className="text-sm font-semibold text-[#1a1d26]">{studentName ?? "Aisha Njeri"}</p>
              <p className="mt-1 text-[12px] text-[#8b8f9a]">Grade 7 Hope</p>
            </div>
            <nav className="px-3 py-3">
              <div className="space-y-1">
                {portalNavItems.map((item) => {
                  const Icon = item.icon;
                  const href = item.href ? `${basePath}${item.href}` : basePath;
                  const isActive = item.href === "" ? pathname === basePath : pathname.startsWith(`${basePath}${item.href}`);
                  return (
                    <Link key={item.id} href={href} onClick={() => setMobileOpen(false)} className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-[14px] font-medium transition ${isActive ? "bg-blue-50 text-blue-700" : "text-[#5a5e6a]"}`}>
                      <Icon className="h-5 w-5 shrink-0" /><span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </nav>
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="lg:pl-[240px]">
        {/* Topbar — minimal, mobile-first */}
        <header className="sticky top-0 z-20 border-b border-blue-100/60 bg-white/95 backdrop-blur-lg">
          <div className="mx-auto flex h-[56px] max-w-[960px] items-center justify-between gap-4 px-4 md:px-6">
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setMobileOpen(true)} className="rounded-xl border border-blue-100 p-2.5 text-[#5a5e6a] lg:hidden"><Menu className="h-4 w-4" /></button>
              <p className="text-sm font-semibold text-[#1a1d26] lg:hidden">{schoolName ?? "Greenfield Academy"}</p>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" className="relative rounded-xl border border-blue-100 p-2.5 text-[#5a5e6a] transition hover:bg-blue-50">
                <Bell className="h-4 w-4" />
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[9px] font-bold text-white">3</span>
              </button>
            </div>
          </div>
        </header>

        {/* Page Content — narrower max-width for mobile-first feel */}
        <main className="mx-auto max-w-[960px] px-4 py-5 md:px-6">
          <div className="page-enter">{children}</div>
        </main>
      </div>
    </div>
  );
}

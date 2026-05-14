"use client";

import {
  BarChart3,
  Bell,
  BookOpen,
  ChevronDown,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Search,
  Settings,
  Smartphone,
  UserPlus,
  Users,
  Wallet,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

const schoolNavItems = [
  { id: "dashboard", label: "Dashboard", href: "", icon: LayoutDashboard },
  { id: "students", label: "Students", href: "/students", icon: Users },
  { id: "admissions", label: "Admissions", href: "/admissions", icon: UserPlus },
  { id: "finance", label: "Finance", href: "/finance", icon: Wallet },
  { id: "mpesa", label: "MPESA", href: "/mpesa", icon: Smartphone },
  { id: "academics", label: "Academics", href: "/academics", icon: GraduationCap },
  { id: "exams", label: "Exams", href: "/exams", icon: BookOpen },
  { id: "reports", label: "Reports", href: "/reports", icon: BarChart3 },
  { id: "communication", label: "Communication", href: "/communication", icon: MessageSquare },
  { id: "settings", label: "Settings", href: "/settings", icon: Settings },
];

export function SchoolShell({
  role,
  schoolName,
  schoolCounty,
  userName,
  userRole,
  onLogout,
  children,
}: {
  role: string;
  schoolName?: string;
  schoolCounty?: string;
  userName?: string;
  userRole?: string;
  onLogout?: () => void;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const basePath = `/school/${role}`;
  const mainItems = schoolNavItems.filter((i) => i.id !== "settings");
  const bottomItems = schoolNavItems.filter((i) => i.id === "settings");

  return (
    <div className="min-h-screen bg-[#f7f8fa]">
      {/* Desktop Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-[#e8eaed] bg-white lg:flex">
        <div className="border-b border-[#e8eaed] px-5 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-sm">
              <span className="text-sm font-bold text-white">{(schoolName ?? "GF").slice(0, 2).toUpperCase()}</span>
            </div>
            <div className="min-w-0">
              <p className="truncate text-[14px] font-semibold text-[#1a1d26]">{schoolName ?? "School workspace"}</p>
              <p className="text-[11px] text-[#8b8f9a]">{schoolCounty ?? "Secure tenant access"}</p>
            </div>
          </div>
        </div>
        <div className="border-b border-[#e8eaed] px-5 py-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8b8f9a]">Current term</span>
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">Term 2, 2026</span>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-3 custom-scrollbar">
          <div className="space-y-0.5">
            {mainItems.map((item) => {
              const Icon = item.icon;
              const href = item.href ? `${basePath}${item.href}` : basePath;
              const isActive = item.href === "" ? pathname === basePath : pathname.startsWith(`${basePath}${item.href}`);
              return (
                <Link key={item.id} href={href} className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-150 ${isActive ? "bg-emerald-50 text-emerald-700 shadow-sm shadow-emerald-100" : "text-[#5a5e6a] hover:bg-[#f3f4f6] hover:text-[#1a1d26]"}`}>
                  <Icon className={`h-[18px] w-[18px] shrink-0 ${isActive ? "text-emerald-600" : "text-[#9ca0ab]"}`} />
                  <span>{item.label}</span>
                  {isActive && <div className="ml-auto h-1.5 w-1.5 rounded-full bg-emerald-500" />}
                </Link>
              );
            })}
          </div>
        </nav>
        <div className="border-t border-[#e8eaed] px-3 py-3 space-y-1">
          {bottomItems.map((item) => {
            const Icon = item.icon;
            const href = `${basePath}${item.href}`;
            return (
              <Link key={item.id} href={href} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium text-[#5a5e6a] hover:bg-[#f3f4f6]">
                <Icon className="h-[18px] w-[18px] shrink-0" /><span>{item.label}</span>
              </Link>
            );
          })}
          <button type="button" onClick={onLogout} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium text-red-500/70 transition hover:bg-red-50 hover:text-red-600">
            <LogOut className="h-[18px] w-[18px] shrink-0" /><span>Sign out</span>
          </button>
        </div>
        <div className="border-t border-[#e8eaed] px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 text-xs font-bold text-white shadow-sm">{(userName ?? "WM").slice(0, 2).toUpperCase()}</div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-[#1a1d26]">{userName ?? "Dr. Wanjiku Muthoni"}</p>
              <p className="text-[11px] text-[#8b8f9a]">{userRole ?? "Principal"}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile Overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-[#1a1d26]/40 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="slide-in-sidebar absolute inset-y-0 left-0 w-[280px] border-r border-[#e8eaed] bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#e8eaed] px-5 py-4">
              <p className="text-sm font-semibold text-[#1a1d26]">{schoolName ?? "School workspace"}</p>
              <button type="button" onClick={() => setMobileOpen(false)} className="rounded-lg border border-[#e8eaed] p-2 text-[#8b8f9a]"><X className="h-4 w-4" /></button>
            </div>
            <nav className="px-3 py-3">
              <div className="space-y-0.5">
                {schoolNavItems.map((item) => {
                  const Icon = item.icon;
                  const href = item.href ? `${basePath}${item.href}` : basePath;
                  const isActive = item.href === "" ? pathname === basePath : pathname.startsWith(`${basePath}${item.href}`);
                  return (
                    <Link key={item.id} href={href} onClick={() => setMobileOpen(false)} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition ${isActive ? "bg-emerald-50 text-emerald-700" : "text-[#5a5e6a]"}`}>
                      <Icon className="h-[18px] w-[18px] shrink-0" /><span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </nav>
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="lg:pl-[248px]">
        <header className="sticky top-0 z-20 border-b border-[#e8eaed] bg-white/95 backdrop-blur-lg">
          <div className="mx-auto flex h-[56px] max-w-[1360px] items-center justify-between gap-4 px-4 md:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setMobileOpen(true)} className="rounded-xl border border-[#e8eaed] p-2.5 text-[#5a5e6a] lg:hidden"><Menu className="h-4 w-4" /></button>
              <div className="hidden items-center gap-2 md:flex">
                <div className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8b8f9a]">School synced</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <label className="hidden items-center gap-2 rounded-xl border border-[#e8eaed] bg-[#f7f8fa] px-3.5 py-2 md:flex">
                <Search className="h-4 w-4 text-[#9ca0ab]" />
                <input type="search" placeholder="Search students, payments…" className="w-[200px] bg-transparent text-sm text-[#1a1d26] outline-none placeholder:text-[#b0b4be]" />
              </label>
              <button type="button" className="relative rounded-xl border border-[#e8eaed] p-2.5 text-[#5a5e6a] transition hover:bg-[#f3f4f6]">
                <Bell className="h-4 w-4" />
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[9px] font-bold text-white">4</span>
              </button>
              <button type="button" className="hidden items-center gap-2 rounded-xl border border-[#e8eaed] px-3 py-2 text-sm text-[#5a5e6a] md:flex">
                <span>{userName ?? "Dr. Wanjiku"}</span>
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-[1360px] px-4 py-5 md:px-6 lg:px-8">
          <div className="page-enter">{children}</div>
        </main>
      </div>
    </div>
  );
}

"use client";

import { useState, type ReactNode } from "react";

import { AppFrame } from "@/components/system/app-frame";
import { AppSidebar } from "@/components/system/app-sidebar";
import { AppTopbar } from "@/components/system/app-topbar";
import type {
  ExperienceNavItem,
  ExperienceNotificationItem,
  ExperienceProfile,
} from "@/lib/experiences/types";

export function ErpShell({
  brand,
  navItems,
  activeHref,
  topLabel,
  title,
  subtitle,
  actions,
  notifications,
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
  notifications?: ExperienceNotificationItem[];
  profile: ExperienceProfile;
  status?: { label: string; tone: "ok" | "warning" | "critical" };
  children: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <AppFrame
      sidebar={
        <AppSidebar
          variant="school"
          brand={brand}
          navItems={navItems}
          activeHref={activeHref}
          profile={profile}
          mobileOpen={mobileOpen}
          onClose={() => setMobileOpen(false)}
        />
      }
      backdrop={
        mobileOpen ? (
          <button
            type="button"
            aria-label="Close sidebar backdrop"
            onClick={() => setMobileOpen(false)}
            className="fixed inset-0 z-30 bg-slate-950/30 lg:hidden"
          />
        ) : null
      }
      topbar={
        <AppTopbar
          variant="school"
          navItems={navItems}
          notifications={notifications}
          topLabel={topLabel}
          title={title}
          subtitle={subtitle}
          actions={actions}
          status={status}
          onOpenSidebar={() => setMobileOpen(true)}
        />
      }
    >
      {children}
    </AppFrame>
  );
}

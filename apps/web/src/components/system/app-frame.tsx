"use client";

import type { ReactNode } from "react";

export function AppFrame({
  sidebar,
  topbar,
  backdrop,
  children,
}: {
  sidebar: ReactNode;
  topbar: ReactNode;
  backdrop?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto grid min-h-screen max-w-[1400px] gap-6 px-4 py-4 md:px-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:px-8">
        {sidebar}
        {backdrop}
        <div className="min-w-0">
          {topbar}
          <main className="space-y-6">{children}</main>
        </div>
      </div>
    </div>
  );
}

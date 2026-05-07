"use client";

import { useState } from "react";
import type { ReactNode } from "react";

export interface TabItem {
  id: string;
  label: string;
  panel: ReactNode;
}

export function Tabs({
  items,
  defaultTab,
}: {
  items: TabItem[];
  defaultTab?: string;
}) {
  const [activeTab, setActiveTab] = useState(defaultTab ?? items[0]?.id ?? "");

  return (
    <div className="space-y-5">
      <div
        role="tablist"
        className="flex flex-wrap gap-1 rounded-[var(--radius-sm)] border border-border bg-surface-muted p-1"
      >
        {items.map((item) => {
          const active = item.id === activeTab;

          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(item.id)}
              className={`rounded-[var(--radius-xs)] px-3.5 py-1.5 text-[13px] font-semibold transition-all duration-150 ${
                active
                  ? "bg-surface text-foreground shadow-sm"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      <div className="page-enter">{items.find((item) => item.id === activeTab)?.panel}</div>
    </div>
  );
}

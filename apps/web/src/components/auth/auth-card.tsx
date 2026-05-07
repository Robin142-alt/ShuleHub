import type { ReactNode } from "react";

export function AuthCard({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="rounded-[28px] border border-border bg-white p-6 shadow-[0_12px_32px_rgba(15,23,42,0.08)] md:p-8">
      {children}
    </div>
  );
}

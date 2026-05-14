import type { ReactNode } from "react";

export function AuthCard({
  children,
  size = "default",
}: {
  children: ReactNode;
  size?: "default" | "wide";
}) {
  return (
    <div
      className={`border border-slate-200/80 bg-white/[0.92] shadow-[0_24px_80px_rgba(15,23,42,0.12)] backdrop-blur-xl ${
        size === "wide" ? "rounded-[30px] p-5 sm:p-7" : "rounded-[28px] p-5 sm:p-7 md:p-8"
      }`}
    >
      {children}
    </div>
  );
}

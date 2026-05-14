import { LoaderCircle, ShieldCheck } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";

export function AuthSubmitButton({
  busy,
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  busy?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={busy || props.disabled}
      className={`group relative inline-flex h-14 w-full items-center justify-center overflow-hidden rounded-2xl bg-slate-950 px-4 text-sm font-bold text-white shadow-[0_18px_40px_rgba(15,23,42,0.22)] transition duration-200 hover:-translate-y-0.5 hover:bg-emerald-700 disabled:cursor-not-allowed disabled:translate-y-0 disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none ${className}`}
    >
      <span className="absolute inset-0 translate-x-[-120%] bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.28),transparent)] transition duration-700 group-hover:translate-x-[120%]" />
      <span className="relative inline-flex items-center gap-2">
        {busy ? (
          <LoaderCircle className="h-4 w-4 animate-spin" />
        ) : (
          <ShieldCheck className="h-4 w-4" />
        )}
        {children}
      </span>
    </button>
  );
}

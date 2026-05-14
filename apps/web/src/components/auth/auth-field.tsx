import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";

export const SecureInput = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & {
    label: string;
    error?: string;
    hint?: string;
  }
>(function SecureInput(
  {
    label,
    error,
    hint,
    className = "",
    id,
    ...props
  },
  ref,
) {
  const inputId =
    id ??
    `auth-${label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")}`;
  const helperId = `${inputId}-helper`;

  return (
    <div className="space-y-2">
      <label className="relative block" htmlFor={inputId}>
        <input
          {...props}
          ref={ref}
          id={inputId}
          aria-invalid={Boolean(error)}
          aria-describedby={error || hint ? helperId : undefined}
          placeholder={props.placeholder ?? " "}
          className={`peer h-14 w-full rounded-2xl border bg-white px-4 pb-2 pt-5 text-sm font-medium text-slate-950 outline-none transition duration-200 placeholder:text-transparent hover:border-slate-300 focus:border-emerald-500 focus:shadow-[0_0_0_4px_rgba(16,185,129,0.12)] disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 ${
            error ? "border-red-400" : "border-slate-200"
          } ${className}`}
        />
        <span className="pointer-events-none absolute left-4 top-2 text-[11px] font-semibold text-slate-500 transition-all duration-200 peer-placeholder-shown:top-[18px] peer-placeholder-shown:text-sm peer-placeholder-shown:font-medium peer-focus:top-2 peer-focus:text-[11px] peer-focus:font-semibold peer-focus:text-emerald-700">
          {label}
        </span>
      </label>
      {error ? (
        <p id={helperId} className="text-sm font-medium text-red-600">
          {error}
        </p>
      ) : hint ? (
        <p id={helperId} className="text-sm leading-6 text-slate-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
});

export const AuthField = SecureInput;

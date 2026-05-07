import type { InputHTMLAttributes } from "react";

export function AuthField({
  label,
  error,
  hint,
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-foreground">
        {label}
      </span>
      <input
        {...props}
        className={`h-[52px] w-full rounded-2xl border bg-surface px-4 text-sm text-foreground outline-none transition duration-150 placeholder:text-muted focus:border-accent ${
          error ? "border-danger" : "border-border"
        } ${className}`}
      />
      {error ? (
        <p className="mt-2 text-sm text-danger">{error}</p>
      ) : hint ? (
        <p className="mt-2 text-sm text-muted">{hint}</p>
      ) : null}
    </label>
  );
}

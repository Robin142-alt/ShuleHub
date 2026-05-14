import type { InputHTMLAttributes } from "react";

export function AuthCheckbox({
  label,
  description,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  description?: string;
}) {
  return (
    <label className="flex items-start gap-3">
      <input
        {...props}
        type="checkbox"
        className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
      />
      <span className="min-w-0">
        <span className="block text-sm font-bold text-slate-900">{label}</span>
        {description ? (
          <span className="mt-1 block text-sm leading-6 text-slate-500">
            {description}
          </span>
        ) : null}
      </span>
    </label>
  );
}

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
        className="mt-0.5 h-4 w-4 rounded border-border text-accent focus:ring-accent"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">{label}</span>
        {description ? (
          <span className="mt-1 block text-sm leading-6 text-muted">
            {description}
          </span>
        ) : null}
      </span>
    </label>
  );
}

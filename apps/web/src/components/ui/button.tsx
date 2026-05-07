import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

export function buttonClasses({
  variant = "primary",
  size = "md",
  block = false,
  className = "",
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  className?: string;
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-[var(--radius-sm)] font-semibold transition-all duration-150 focus-ring disabled:cursor-not-allowed disabled:opacity-50";

  const variantClasses: Record<ButtonVariant, string> = {
    primary:
      "bg-accent text-white hover:bg-accent-hover active:scale-[0.98] shadow-sm hover:shadow",
    secondary:
      "border border-border bg-surface text-foreground hover:bg-surface-strong hover:border-border-strong active:scale-[0.98]",
    danger:
      "bg-danger text-white hover:bg-danger-hover active:scale-[0.98] shadow-sm",
    ghost:
      "bg-transparent text-muted-strong hover:bg-surface-strong hover:text-foreground",
  };

  const sizeClasses: Record<ButtonSize, string> = {
    sm: "h-7 px-2.5 text-[12px]",
    md: "h-8 px-3.5 text-[13px]",
    lg: "h-9 px-4 text-[13px]",
  };

  return [base, variantClasses[variant], sizeClasses[size], block ? "w-full" : "", className]
    .filter(Boolean)
    .join(" ");
}

export function Button({
  variant,
  size,
  block,
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
}) {
  return (
    <button
      type={type}
      className={buttonClasses({ variant, size, block, className })}
      {...props}
    />
  );
}

"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import type { InputHTMLAttributes } from "react";

export function AuthPasswordField({
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
  const [visible, setVisible] = useState(false);

  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-foreground">
        {label}
      </span>
      <div
        className={`flex h-[52px] items-center rounded-2xl border bg-surface px-4 transition duration-150 focus-within:border-accent ${
          error ? "border-danger" : "border-border"
        }`}
      >
        <input
          {...props}
          type={visible ? "text" : "password"}
          className={`w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted ${className}`}
        />
        <button
          type="button"
          onClick={() => setVisible((value) => !value)}
          aria-label={visible ? "Hide password" : "Show password"}
          className="ml-3 inline-flex h-8 w-8 items-center justify-center rounded-full text-muted transition duration-150 hover:bg-surface-muted hover:text-foreground"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {error ? (
        <p className="mt-2 text-sm text-danger">{error}</p>
      ) : hint ? (
        <p className="mt-2 text-sm text-muted">{hint}</p>
      ) : null}
    </label>
  );
}

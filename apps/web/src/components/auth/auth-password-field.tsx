"use client";

import { Eye, EyeOff, Keyboard } from "lucide-react";
import { forwardRef, useState } from "react";
import type { InputHTMLAttributes, KeyboardEvent } from "react";

export const PasswordField = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & {
    label: string;
    error?: string;
    hint?: string;
  }
>(function PasswordField(
  {
    label,
    error,
    hint,
    className = "",
    id,
    onKeyUp,
    onBlur,
    ...props
  },
  ref,
) {
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const inputId =
    id ??
    `auth-${label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")}`;
  const helperId = `${inputId}-helper`;

  function handleKeyUp(event: KeyboardEvent<HTMLInputElement>) {
    setCapsLock(event.getModifierState("CapsLock"));
    onKeyUp?.(event);
  }

  return (
    <div className="space-y-2">
      <div className="group relative">
        <div
          className={`flex h-14 items-center rounded-2xl border bg-white px-4 transition duration-200 hover:border-slate-300 focus-within:border-emerald-500 focus-within:shadow-[0_0_0_4px_rgba(16,185,129,0.12)] ${
            error ? "border-red-400" : "border-slate-200"
          }`}
        >
          <input
            {...props}
            ref={ref}
            id={inputId}
            type={visible ? "text" : "password"}
            aria-invalid={Boolean(error)}
            aria-describedby={error || hint || capsLock ? helperId : undefined}
            placeholder={props.placeholder ?? " "}
            onKeyUp={handleKeyUp}
            onBlur={(event) => {
              setCapsLock(false);
              onBlur?.(event);
            }}
            className={`peer h-full w-full bg-transparent pb-1 pt-5 text-sm font-medium text-slate-950 outline-none placeholder:text-transparent ${className}`}
          />
          <button
            type="button"
            onClick={() => setVisible((value) => !value)}
            aria-label={visible ? "Hide password" : "Show password"}
            className="ml-3 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
          >
            {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <label
          htmlFor={inputId}
          className="pointer-events-none absolute left-4 top-2 text-[11px] font-semibold text-slate-500 transition duration-200 group-focus-within:text-emerald-700"
        >
          {label}
        </label>
      </div>
      {capsLock ? (
        <p id={helperId} className="flex items-center gap-2 text-sm font-medium text-amber-700">
          <Keyboard className="h-4 w-4" />
          Caps Lock is on.
        </p>
      ) : error ? (
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

export const AuthPasswordField = PasswordField;

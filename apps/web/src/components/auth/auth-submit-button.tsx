import { LoaderCircle } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";

export function AuthSubmitButton({
  busy,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  busy?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={busy || props.disabled}
      className="inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-accent px-4 text-sm font-semibold text-white transition duration-150 hover:bg-[#15803d] disabled:cursor-not-allowed disabled:opacity-70"
    >
      {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
      {children}
    </button>
  );
}

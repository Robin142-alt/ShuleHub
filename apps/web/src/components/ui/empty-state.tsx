import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

export function EmptyState({
  eyebrow = "Nothing yet",
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius)] border border-dashed border-border bg-surface-muted/50 px-6 py-10 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-surface-strong">
        <Inbox className="h-5 w-5 text-muted" />
      </div>
      <p className="mt-4 eyebrow">
        {eyebrow}
      </p>
      <h3 className="mt-2 text-[15px] font-semibold text-foreground">{title}</h3>
      <p className="mt-1.5 text-[13px] leading-relaxed text-muted max-w-sm mx-auto">{description}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

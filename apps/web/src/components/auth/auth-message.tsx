import { AlertTriangle, CheckCircle2, Info } from "lucide-react";

type AuthMessageTone = "success" | "error" | "info";

export function AuthMessage({
  tone,
  title,
  description,
}: {
  tone: AuthMessageTone;
  title: string;
  description: string;
}) {
  const Icon =
    tone === "success" ? CheckCircle2 : tone === "error" ? AlertTriangle : Info;

  const toneClasses =
    tone === "success"
      ? "border-success/20 bg-accent-soft/60 text-foreground"
      : tone === "error"
        ? "border-danger/20 bg-danger/5 text-foreground"
        : "border-border bg-surface-muted text-foreground";

  return (
    <div className={`rounded-2xl border px-4 py-4 ${toneClasses}`}>
      <div className="flex items-start gap-3">
        <Icon
          className={`mt-0.5 h-4 w-4 shrink-0 ${
            tone === "error"
              ? "text-danger"
              : tone === "success"
                ? "text-success"
                : "text-muted"
          }`}
        />
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="mt-1 text-sm leading-6 text-muted">{description}</p>
        </div>
      </div>
    </div>
  );
}

import { AlertTriangle, CheckCircle2, Info, ShieldAlert } from "lucide-react";

type AuthMessageTone = "success" | "error" | "info" | "warning";

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
    tone === "success"
      ? CheckCircle2
      : tone === "error"
        ? ShieldAlert
        : tone === "warning"
          ? AlertTriangle
          : Info;

  const toneClasses =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-950"
      : tone === "error"
        ? "border-red-200 bg-red-50 text-red-950"
        : tone === "warning"
          ? "border-amber-200 bg-amber-50 text-amber-950"
          : "border-slate-200 bg-slate-50 text-slate-950";

  const iconClasses =
    tone === "success"
      ? "text-emerald-600"
      : tone === "error"
        ? "text-red-600"
        : tone === "warning"
          ? "text-amber-600"
          : "text-slate-500";

  return (
    <div className={`rounded-2xl border px-4 py-4 ${toneClasses}`} role={tone === "error" ? "alert" : "status"}>
      <div className="flex items-start gap-3">
        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${iconClasses}`} />
        <div>
          <p className="text-sm font-bold">{title}</p>
          <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
        </div>
      </div>
    </div>
  );
}

import type { ReactNode } from "react";
import { CheckCircle2, LockKeyhole, ShieldCheck } from "lucide-react";

type AuthHighlight = {
  id: string;
  title: string;
  description: string;
};

type AuthTrustNote = {
  id: string;
  label: string;
  icon?: "shield" | "lock" | "check";
};

function resolveTrustIcon(icon: AuthTrustNote["icon"]) {
  if (icon === "lock") {
    return LockKeyhole;
  }

  if (icon === "check") {
    return CheckCircle2;
  }

  return ShieldCheck;
}

function AuthHero({
  eyebrow,
  title,
  description,
  badge,
  highlights,
  trustNotes,
  logoMark,
  helper,
}: {
  eyebrow: string;
  title: string;
  description: string;
  badge: string;
  highlights: AuthHighlight[];
  trustNotes: AuthTrustNote[];
  logoMark: string;
  helper: string;
}) {
  return (
    <section className="relative overflow-hidden border-b border-border bg-surface-muted px-6 py-8 lg:border-b-0 lg:border-r lg:px-10 lg:py-10">
      <div className="absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top_left,rgba(22,163,74,0.12),transparent_56%)]" />
      <div className="relative flex h-full flex-col justify-between gap-8">
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-base font-semibold text-foreground shadow-sm">
              {logoMark}
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
                {eyebrow}
              </p>
              <p className="mt-1 text-sm font-medium text-foreground">{badge}</p>
            </div>
          </div>

          <div className="max-w-xl space-y-4">
            <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
              {title}
            </h1>
            <p className="text-sm leading-7 text-muted md:text-base">
              {description}
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
          {highlights.map((highlight) => (
            <div
              key={highlight.id}
              className="rounded-2xl border border-border bg-white/80 px-4 py-4 shadow-sm backdrop-blur"
            >
              <p className="text-sm font-semibold text-foreground">
                {highlight.title}
              </p>
              <p className="mt-2 text-sm leading-6 text-muted">
                {highlight.description}
              </p>
            </div>
          ))}
        </div>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {trustNotes.map((note) => {
              const Icon = resolveTrustIcon(note.icon);

              return (
                <span
                  key={note.id}
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-white px-3 py-2 text-xs font-semibold text-foreground shadow-sm"
                >
                  <Icon className="h-3.5 w-3.5 text-accent" />
                  {note.label}
                </span>
              );
            })}
          </div>
          <p className="max-w-xl text-sm leading-6 text-muted">{helper}</p>
        </div>
      </div>
    </section>
  );
}

export function AuthShell({
  eyebrow,
  heroTitle,
  heroDescription,
  badge,
  logoMark,
  helper,
  highlights,
  trustNotes,
  children,
}: {
  eyebrow: string;
  heroTitle: string;
  heroDescription: string;
  badge: string;
  logoMark: string;
  helper: string;
  highlights: AuthHighlight[];
  trustNotes: AuthTrustNote[];
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-background px-4 py-4 md:px-6 md:py-6">
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-[1400px] items-stretch">
        <div className="grid w-full overflow-hidden rounded-[32px] border border-border bg-white shadow-[0_16px_48px_rgba(15,23,42,0.08)] lg:grid-cols-[1.08fr_0.92fr]">
          <AuthHero
            eyebrow={eyebrow}
            title={heroTitle}
            description={heroDescription}
            badge={badge}
            logoMark={logoMark}
            helper={helper}
            highlights={highlights}
            trustNotes={trustNotes}
          />

          <section className="flex items-center justify-center px-5 py-8 md:px-8 md:py-10 lg:px-10">
            <div className="w-full max-w-md auth-enter">{children}</div>
          </section>
        </div>
      </div>
    </main>
  );
}

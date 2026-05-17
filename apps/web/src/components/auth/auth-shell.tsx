"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  CheckCircle2,
  LockKeyhole,
  Moon,
  ShieldCheck,
  Sparkles,
  SunMedium,
  Wifi,
} from "lucide-react";

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

function AnimatedBackground({ dark }: { dark: boolean }) {
  return (
    <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
      <div
        className={`absolute inset-0 ${
          dark
            ? "bg-[linear-gradient(135deg,#020617_0%,#0f172a_44%,#064e3b_100%)]"
            : "bg-[linear-gradient(135deg,#ecfdf5_0%,#ffffff_48%,#e0f2fe_100%)]"
        }`}
      />
      <div
        className={`absolute inset-0 ${
          dark
            ? "bg-[linear-gradient(90deg,rgba(16,185,129,0.14)_0%,transparent_36%,rgba(14,165,233,0.12)_100%)]"
            : "bg-[linear-gradient(90deg,rgba(16,185,129,0.10)_0%,transparent_42%,rgba(14,165,233,0.10)_100%)]"
        }`}
      />
      <div
        className={`absolute inset-0 ${
          dark
            ? "bg-[linear-gradient(180deg,rgba(255,255,255,0.08)_0%,transparent_34%,rgba(2,6,23,0.18)_100%)]"
            : "bg-[linear-gradient(180deg,rgba(255,255,255,0.72)_0%,transparent_40%,rgba(236,253,245,0.55)_100%)]"
        }`}
      />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] bg-[size:44px_44px] opacity-40" />
    </div>
  );
}

function TrustIndicators({
  notes,
  dark,
}: {
  notes: AuthTrustNote[];
  dark: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {notes.map((note) => {
        const Icon = resolveTrustIcon(note.icon);

        return (
          <span
            key={note.id}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold ${
              dark
                ? "border-white/10 bg-white/[0.08] text-emerald-50"
                : "border-slate-200 bg-white/80 text-slate-700"
            } shadow-sm backdrop-blur`}
          >
            <Icon className={dark ? "h-3.5 w-3.5 text-emerald-300" : "h-3.5 w-3.5 text-emerald-600"} />
            {note.label}
          </span>
        );
      })}
    </div>
  );
}

function SecurityStrip({ dark }: { dark: boolean }) {
  const items = [
    { icon: ShieldCheck, label: "Email verified" },
    { icon: Activity, label: "Audit trail" },
    { icon: Wifi, label: "Session health" },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {items.map((item) => {
        const Icon = item.icon;

        return (
          <div
            key={item.label}
            className={`rounded-2xl border px-4 py-3 ${
              dark
                ? "border-white/10 bg-white/[0.06] text-slate-200"
                : "border-slate-200 bg-white/70 text-slate-700"
            }`}
          >
            <Icon className="h-4 w-4 text-emerald-500" />
            <p className="mt-2 text-xs font-semibold">{item.label}</p>
          </div>
        );
      })}
    </div>
  );
}

function AuthHero({
  eyebrow,
  title,
  description,
  badge,
  trustNotes,
  logoMark,
  helper,
  dark,
}: {
  eyebrow: string;
  title: string;
  description: string;
  badge: string;
  trustNotes: AuthTrustNote[];
  logoMark: string;
  helper: string;
  dark: boolean;
}) {
  return (
    <section className="relative isolate hidden overflow-hidden p-8 text-slate-950 lg:flex lg:min-h-[calc(100vh-32px)] lg:flex-col lg:justify-between xl:p-10">
      <AnimatedBackground dark={dark} />
      <div className="relative z-10 space-y-8">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl text-sm font-bold shadow-sm ${
                dark ? "bg-white text-slate-950" : "bg-slate-950 text-white"
              }`}
            >
              {logoMark}
            </span>
            <div>
              <p className={dark ? "text-sm font-semibold text-white" : "text-sm font-semibold text-slate-950"}>
                ShuleHub ERP
              </p>
              <p className={dark ? "mt-1 text-xs text-slate-300" : "mt-1 text-xs text-slate-500"}>
                {badge}
              </p>
            </div>
          </div>
          <div
            className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold ${
              dark
                ? "border border-white/10 bg-white/[0.08] text-emerald-100"
                : "border border-slate-200 bg-white/80 text-slate-700"
            }`}
          >
            <Sparkles className="h-3.5 w-3.5 text-emerald-500" />
            {eyebrow}
          </div>
        </div>

        <div className="max-w-2xl space-y-5">
          <motion.h1
            className={dark ? "text-4xl font-bold leading-[1.08] text-white xl:text-5xl" : "text-4xl font-bold leading-[1.08] text-slate-950 xl:text-5xl"}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          >
            {title}
          </motion.h1>
          <motion.p
            className={dark ? "max-w-xl text-base leading-7 text-slate-300" : "max-w-xl text-base leading-7 text-slate-600"}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08, duration: 0.4, ease: "easeOut" }}
          >
            {description}
          </motion.p>
        </div>
      </div>

      <div className="relative z-10 space-y-5">
        <SecurityStrip dark={dark} />
        <TrustIndicators notes={trustNotes} dark={dark} />
        <p className={dark ? "max-w-2xl text-sm leading-6 text-slate-300" : "max-w-2xl text-sm leading-6 text-slate-600"}>
          {helper}
        </p>
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
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const dark = theme === "dark";

  return (
    <main
      className={`min-h-screen px-3 py-3 transition-colors duration-300 md:px-4 md:py-4 ${
        dark ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-950"
      }`}
    >
      <div
        className={`mx-auto grid min-h-[calc(100vh-24px)] max-w-[1500px] overflow-hidden rounded-[32px] border shadow-2xl lg:grid-cols-[1.1fr_0.9fr] ${
          dark
            ? "border-white/10 bg-slate-950 shadow-emerald-950/30"
            : "border-white bg-white shadow-slate-300/40"
        }`}
      >
        <AuthHero
          eyebrow={eyebrow}
          title={heroTitle}
          description={heroDescription}
          badge={badge}
          logoMark={logoMark}
          helper={helper}
          trustNotes={trustNotes}
          dark={dark}
        />

        <section
          className={`relative flex min-h-[calc(100vh-24px)] items-center justify-center overflow-hidden px-4 py-6 transition-colors duration-300 sm:px-6 md:px-8 lg:min-h-full ${
            dark
              ? "bg-slate-950"
              : "bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)]"
          }`}
        >
          <div
            aria-hidden="true"
            className={`absolute inset-x-0 top-0 h-40 lg:hidden ${
              dark
                ? "bg-[linear-gradient(180deg,rgba(16,185,129,0.22),transparent_72%)]"
                : "bg-[linear-gradient(180deg,rgba(16,185,129,0.16),transparent_72%)]"
            }`}
          />
          <button
            type="button"
            onClick={() => setTheme((value) => (value === "light" ? "dark" : "light"))}
            className={`absolute right-4 top-4 z-20 inline-flex h-10 w-10 items-center justify-center rounded-full border transition hover:scale-[1.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 ${
              dark
                ? "border-white/10 bg-white/[0.08] text-white hover:bg-white/[0.12]"
                : "border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50"
            }`}
            aria-label={dark ? "Use light theme" : "Use dark theme"}
          >
            {dark ? <SunMedium className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <motion.div
            className="relative z-10 w-full max-w-[480px]"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
          >
            {children}
          </motion.div>
        </section>
      </div>
    </main>
  );
}

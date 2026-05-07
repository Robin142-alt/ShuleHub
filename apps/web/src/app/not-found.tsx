import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <div className="dashboard-card w-full max-w-xl rounded-[32px] p-10 text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-muted">
          ShuleHub ERP
        </p>
        <h1 className="mt-4 text-4xl font-black tracking-tight text-foreground">
          Page not found
        </h1>
        <p className="mt-4 text-base leading-7 text-muted">
          The dashboard route you requested does not exist. Return to the
          default admin workspace.
        </p>
        <Link
          href="/dashboard/admin"
          className="mt-8 inline-flex rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90"
        >
          Open dashboard
        </Link>
      </div>
    </main>
  );
}

import { Activity, AlertCircle, Clock3 } from "lucide-react";

import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { getDashboardApiBaseUrl } from "@/lib/dashboard/api-client";
import type { LiveSystemStatusPayload } from "@/lib/support/support-live";

export const dynamic = "force-dynamic";

type PublicStatusIncidentView = {
  id: string;
  title: string;
  impact: string;
  status: string;
  update_summary?: string | null;
  updated_at?: string | null;
};

type PublicStatusView = {
  components: Array<{
    id: string;
    name: string;
    status: string;
    uptime: string;
    latency: string;
    tone: "ok" | "warning" | "critical";
  }>;
  incidents: PublicStatusIncidentView[];
  historicalIncidents: PublicStatusIncidentView[];
  generatedAt: string;
  unavailable: boolean;
};

export default async function PublicSupportStatusPage({
  searchParams,
}: {
  searchParams?: { subscribed?: string; token?: string; unsubscribed?: string };
}) {
  const status = await fetchPublicStatus();
  const activeIncidents = status.incidents.filter((incident) => incident.status !== "resolved");
  const unsubscribeToken = searchParams?.token?.trim() ?? "";
  const subscriptionMessage = searchParams?.subscribed === "1"
    ? "Subscribed"
    : searchParams?.subscribed === "0"
      ? "Try again"
      : null;
  const unsubscribeMessage = searchParams?.unsubscribed === "1"
    ? "Unsubscribed"
    : searchParams?.unsubscribed === "0"
      ? "Try again"
      : null;
  const overallTone = status.unavailable
    ? "warning"
    : status.components.some((component) => component.tone === "critical")
      ? "critical"
      : status.components.some((component) => component.tone === "warning")
        ? "warning"
        : "ok";
  const overallLabel = overallTone === "ok"
    ? "Operational"
    : overallTone === "critical"
      ? "Major outage"
      : "Degraded";

  return (
    <main className="min-h-screen bg-app text-foreground">
      <section className="border-b border-border bg-surface">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-6 py-10 md:px-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-sm)] bg-accent text-accent-foreground">
                  <Activity className="h-5 w-5" />
                </span>
                <p className="text-sm font-semibold uppercase tracking-[0.14em] text-muted">
                  Shule Hub Status
                </p>
              </div>
              <h1 className="mt-5 text-3xl font-semibold tracking-normal text-foreground md:text-4xl">
                Platform status
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <StatusPill label={overallLabel} tone={overallTone} />
              <span className="text-sm text-muted">Updated {status.generatedAt}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-6xl gap-6 px-6 py-8 md:px-8 xl:grid-cols-[1fr_0.78fr]">
        <div className="space-y-4">
          {status.components.map((component) => (
            <Card key={component.id} className="p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">{component.name}</h2>
                  <p className="mt-1 text-sm text-muted">
                    Uptime {component.uptime} - Latency {component.latency}
                  </p>
                </div>
                <StatusPill label={component.status} tone={component.tone} />
              </div>
            </Card>
          ))}
        </div>

        <aside className="space-y-4">
          <Card className="p-5">
            <AlertCircle className="h-5 w-5 text-warning" />
            <h2 className="mt-4 text-lg font-semibold text-foreground">Incidents</h2>
            {activeIncidents.length > 0 ? (
              <div className="mt-4 space-y-4">
                {activeIncidents.map((incident) => (
                  <div key={incident.id} className="border-t border-border pt-4 first:border-t-0 first:pt-0">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-foreground">{incident.title}</p>
                      <StatusPill label={formatStatusLabel(incident.status)} tone={incidentTone(incident.impact)} compact />
                    </div>
                    <p className="mt-2 text-sm leading-6 text-muted">
                      {incident.update_summary ?? "No update summary has been published."}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm leading-6 text-muted">
                No active incidents are published.
              </p>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="text-lg font-semibold text-foreground">Email updates</h2>
            <form action="/api/support/public/status-subscriptions" method="post" className="mt-4 flex flex-col gap-3">
              <input type="hidden" name="locale" value="en-KE" />
              <label htmlFor="status-email" className="text-sm font-medium text-foreground">
                Email address
              </label>
              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  id="status-email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  className="min-h-11 flex-1 rounded-[var(--radius-sm)] border border-border bg-surface px-3 text-sm text-foreground outline-none transition focus:border-accent"
                  placeholder="you@example.com"
                />
                <button
                  type="submit"
                  className="min-h-11 rounded-[var(--radius-sm)] bg-accent px-4 text-sm font-semibold text-accent-foreground transition hover:opacity-90"
                >
                  Subscribe
                </button>
              </div>
              {subscriptionMessage ? (
                <p className="text-sm text-muted">{subscriptionMessage}</p>
              ) : null}
            </form>
          </Card>

          {unsubscribeToken || unsubscribeMessage ? (
            <Card className="p-5">
              <h2 className="text-lg font-semibold text-foreground">Unsubscribe</h2>
              {unsubscribeToken ? (
                <form
                  action="/api/support/public/status-subscriptions/unsubscribe"
                  method="post"
                  className="mt-4 flex flex-col gap-3"
                >
                  <input type="hidden" name="token" value={unsubscribeToken} />
                  <button
                    type="submit"
                    className="min-h-11 rounded-[var(--radius-sm)] bg-danger px-4 text-sm font-semibold text-white transition hover:opacity-90"
                  >
                    Unsubscribe
                  </button>
                </form>
              ) : null}
              {unsubscribeMessage ? (
                <p className="mt-3 text-sm text-muted">{unsubscribeMessage}</p>
              ) : null}
            </Card>
          ) : null}

          <Card className="p-5">
            <Clock3 className="h-5 w-5 text-muted" />
            <h2 className="mt-4 text-lg font-semibold text-foreground">Status history</h2>
            {status.historicalIncidents.length > 0 ? (
              <div className="mt-4 space-y-4">
                {status.historicalIncidents.map((incident) => (
                  <div key={incident.id} className="border-t border-border pt-4 first:border-t-0 first:pt-0">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-foreground">{incident.title}</p>
                      <StatusPill label={formatStatusLabel(incident.status)} tone="ok" compact />
                    </div>
                    <p className="mt-2 text-sm leading-6 text-muted">
                      {incident.update_summary ?? "Resolved."}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm leading-6 text-muted">
                No resolved incidents are published.
              </p>
            )}
          </Card>
        </aside>
      </section>
    </main>
  );
}

async function fetchPublicStatus(): Promise<PublicStatusView> {
  const baseUrl = getDashboardApiBaseUrl();

  if (!baseUrl) {
    return emptyStatus(true);
  }

  try {
    const response = await fetch(`${baseUrl}/support/public/system-status`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return emptyStatus(true);
    }

    const payload = (await response.json()) as LiveSystemStatusPayload | { data: LiveSystemStatusPayload };
    const data = "data" in payload ? payload.data : payload;
    const allIncidents = data.incidents ?? [];
    const activeIncidents = data.active_incidents
      ?? allIncidents.filter((incident) => incident.status !== "resolved");
    const historicalIncidents = data.historical_incidents
      ?? allIncidents.filter((incident) => incident.status === "resolved");

    return {
      components: (data.components ?? []).map((component) => ({
        id: component.id,
        name: component.name,
        status: formatStatusLabel(component.status),
        uptime: formatUptime(component.uptime_percent),
        latency: formatLatency(component.latency_ms),
        tone: componentTone(component.status),
      })),
      incidents: activeIncidents,
      historicalIncidents,
      generatedAt: formatGeneratedAt(data.generated_at ?? new Date().toISOString()),
      unavailable: false,
    };
  } catch {
    return emptyStatus(true);
  }
}

function emptyStatus(unavailable: boolean): PublicStatusView {
  return {
    components: [
          {
            id: "status-api",
            name: "Status feed",
            status: unavailable ? "Live status temporarily unavailable" : "Operational",
            uptime: unavailable ? "Checking" : "Tracked",
            latency: unavailable ? "Checking" : "Tracked",
            tone: unavailable ? "warning" : "ok",
          },
    ],
    incidents: [],
    historicalIncidents: [],
    generatedAt: formatGeneratedAt(new Date().toISOString()),
    unavailable,
  };
}

function componentTone(status: string): "ok" | "warning" | "critical" {
  if (status === "major_outage") return "critical";
  if (status === "degraded" || status === "partial_outage" || status === "maintenance") {
    return "warning";
  }
  return "ok";
}

function incidentTone(impact: string): "ok" | "warning" | "critical" {
  if (impact === "critical") return "critical";
  if (impact === "major" || impact === "minor") return "warning";
  return "ok";
}

function formatStatusLabel(status: string) {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatUptime(value?: number | string | null) {
  if (value === null || value === undefined || value === "") {
    return "Checking";
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${numeric.toFixed(2)}%` : String(value);
}

function formatLatency(value?: number | string | null) {
  if (value === null || value === undefined || value === "") {
    return "Checking";
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${Math.round(numeric)}ms` : String(value);
}

function formatGeneratedAt(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "now";
  }

  return new Intl.DateTimeFormat("en-KE", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

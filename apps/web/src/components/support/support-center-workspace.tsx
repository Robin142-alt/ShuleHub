"use client";

import { useMemo, useState } from "react";
import {
  AlertCircle,
  BookOpenCheck,
  Clock3,
  FileUp,
  MessageSquareText,
  Paperclip,
  Send,
} from "lucide-react";

import { MetricGrid } from "@/components/experience/metric-grid";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { StatusPill } from "@/components/ui/status-pill";
import {
  buildAttachmentPath,
  createSupportTickets,
  knowledgeBaseArticles,
  priorityTone,
  statusTone,
  supportCategories,
  supportModules,
  systemStatusComponents,
  type SupportPriority,
  type SupportTicket,
} from "@/lib/support/support-data";

type SchoolSupportView =
  | "support-new-ticket"
  | "support-my-tickets"
  | "support-knowledge-base"
  | "support-system-status";

function createBrowserContext() {
  return {
    requestId: "req-local-support",
    browser: "Chrome 124",
    device: "Windows laptop",
    pageUrl: "/support-new-ticket",
    appVersion: "2026.05.08",
    errorLogs: ["No client errors captured in the last 5 minutes"],
  };
}

export function SupportCenterWorkspace({
  tenantSlug = "barakaacademy",
  defaultView,
}: {
  tenantSlug?: string | null;
  defaultView: SchoolSupportView;
}) {
  const normalizedTenantSlug = tenantSlug ?? "barakaacademy";
  const seededTickets = useMemo(
    () => createSupportTickets().filter((ticket) => ticket.tenantSlug === normalizedTenantSlug),
    [normalizedTenantSlug],
  );
  const [tickets, setTickets] = useState<SupportTicket[]>(seededTickets);
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<(typeof supportCategories)[number]>("MPESA");
  const [priority, setPriority] = useState<SupportPriority>("Medium");
  const [moduleAffected, setModuleAffected] = useState<(typeof supportModules)[number]>("MPESA");
  const [description, setDescription] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [createdAttachmentPath, setCreatedAttachmentPath] = useState<string | null>(null);
  const context = createBrowserContext();

  function submitTicket() {
    if (!subject.trim() || !description.trim()) {
      setFormError("Subject and description are required before support can triage the ticket.");
      return;
    }

    const ticketNumber = `SUP-2026-${String(145 + tickets.length + 1).padStart(6, "0")}`;
    const attachmentPath = selectedFile
      ? buildAttachmentPath(normalizedTenantSlug, ticketNumber, selectedFile.name)
      : null;
    const newTicket: SupportTicket = {
      id: `ticket-${Date.now()}`,
      ticketNumber,
      tenantId: `tenant-${normalizedTenantSlug}`,
      tenantSlug: normalizedTenantSlug,
      schoolName: "Baraka Academy",
      subject: subject.trim(),
      category,
      priority,
      moduleAffected,
      description: description.trim(),
      status: priority === "Critical" ? "Escalated" : "Open",
      owner: priority === "Critical" ? "Support escalation desk" : "Unassigned",
      requester: "School admin",
      updatedAt: "now",
      firstResponseDue: priority === "Critical" ? "15 min" : "4 hr",
      resolutionDue: priority === "Critical" ? "4 hr" : "2 days",
      context: {
        ...context,
        pageUrl: `/school/admin/${moduleAffected.toLowerCase().replace(/\s+/g, "-")}`,
      },
      attachments: attachmentPath
        ? [
            {
              id: `attachment-${Date.now()}`,
              name: selectedFile?.name ?? "attachment",
              type: selectedFile?.type || "application/octet-stream",
              size: selectedFile ? `${Math.max(1, Math.ceil(selectedFile.size / 1024))} KB` : "0 KB",
              storedPath: attachmentPath,
            },
          ]
        : [],
      messages: [
        {
          id: `message-${Date.now()}`,
          author: "School admin",
          authorType: "school",
          body: description.trim(),
          createdAt: "now",
        },
      ],
      internalNotes: [],
    };

    setTickets((current) => [newTicket, ...current]);
    setFormError(null);
    setSuccessMessage(`Ticket ${ticketNumber} created and ${newTicket.status.toLowerCase()}.`);
    setCreatedAttachmentPath(attachmentPath);
    setSubject("");
    setDescription("");
    setSelectedFile(null);
  }

  const columns: DataTableColumn<SupportTicket>[] = [
    {
      id: "ticket",
      header: "Ticket",
      render: (row) => (
        <div>
          <p className="font-semibold">{row.ticketNumber}</p>
          <p className="mt-1 text-xs text-muted">{row.subject}</p>
        </div>
      ),
    },
    { id: "module", header: "Module", render: (row) => row.moduleAffected },
    { id: "priority", header: "Priority", render: (row) => <StatusPill label={row.priority} tone={priorityTone(row.priority)} /> },
    { id: "status", header: "Status", render: (row) => <StatusPill label={row.status} tone={statusTone(row.status)} /> },
    { id: "updated", header: "Updated", render: (row) => row.updatedAt },
  ];

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
              Support Center
            </p>
            <h2 className="mt-2 text-2xl font-bold text-foreground">Support Center</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Raise issues, send screenshots or logs, follow ticket progress, and keep every support conversation attached to your school tenant.
            </p>
          </div>
          <StatusPill label="Tenant isolated" tone="ok" />
        </div>
      </Card>

      {defaultView === "support-new-ticket" ? (
        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <Card className="p-5">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-foreground">
                <MessageSquareText className="h-5 w-5" />
              </span>
              <div>
                <p className="text-lg font-semibold text-foreground">New Ticket</p>
                <p className="mt-1 text-sm text-muted">Support receives the issue with tenant, user, browser, device, and page context.</p>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              {formError ? (
                <div role="alert" className="rounded-[var(--radius-sm)] border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-foreground">
                  {formError}
                </div>
              ) : null}
              {successMessage ? (
                <div aria-live="polite" className="rounded-[var(--radius-sm)] border border-success/20 bg-success/10 px-4 py-3 text-sm text-foreground">
                  {successMessage}
                </div>
              ) : null}
              <label className="space-y-2 text-sm text-foreground">
                <span className="font-medium">Ticket subject</span>
                <input
                  aria-label="Ticket subject"
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  className="input-base"
                  placeholder="Short summary of the issue"
                />
              </label>
              <div className="grid gap-4 md:grid-cols-3">
                <label className="space-y-2 text-sm text-foreground">
                  <span className="font-medium">Category</span>
                  <select aria-label="Category" value={category} onChange={(event) => setCategory(event.target.value as typeof category)} className="input-base">
                    {supportCategories.map((item) => <option key={item}>{item}</option>)}
                  </select>
                </label>
                <label className="space-y-2 text-sm text-foreground">
                  <span className="font-medium">Priority</span>
                  <select aria-label="Priority" value={priority} onChange={(event) => setPriority(event.target.value as SupportPriority)} className="input-base">
                    {["Low", "Medium", "High", "Critical"].map((item) => <option key={item}>{item}</option>)}
                  </select>
                </label>
                <label className="space-y-2 text-sm text-foreground">
                  <span className="font-medium">Module affected</span>
                  <select aria-label="Module affected" value={moduleAffected} onChange={(event) => setModuleAffected(event.target.value as typeof moduleAffected)} className="input-base">
                    {supportModules.map((item) => <option key={item}>{item}</option>)}
                  </select>
                </label>
              </div>
              <label className="space-y-2 text-sm text-foreground">
                <span className="font-medium">Description</span>
                <textarea
                  aria-label="Description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  className="input-base min-h-32"
                  placeholder="What happened, who is affected, and what you expected instead"
                />
              </label>
              <label className="block space-y-2 text-sm text-foreground">
                <span className="font-medium">Attachments</span>
                <input
                  aria-label="Attachments"
                  type="file"
                  onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                  className="input-base"
                />
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={submitTicket}>
                  <Send className="h-4 w-4" />
                  Submit ticket
                </Button>
                {selectedFile ? (
                  <span className="inline-flex items-center gap-2 text-sm text-muted">
                    <Paperclip className="h-4 w-4" />
                    {selectedFile.name}
                  </span>
                ) : null}
              </div>
              {createdAttachmentPath ? (
                <div className="rounded-[var(--radius-sm)] border border-border bg-surface-muted px-4 py-3 text-sm text-foreground">
                  <span className="font-semibold">Stored path:</span> {createdAttachmentPath}
                </div>
              ) : null}
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-info-soft text-foreground">
                <FileUp className="h-5 w-5" />
              </span>
              <div>
                <p className="text-lg font-semibold text-foreground">Auto-captured context</p>
                <p className="mt-1 text-sm text-muted">Sent with the ticket to reduce back-and-forth diagnosis.</p>
              </div>
            </div>
            <dl className="mt-5 space-y-3">
              {[
                ["Request ID", context.requestId],
                ["Browser", context.browser],
                ["Device", context.device],
                ["Current page", context.pageUrl],
                ["App version", context.appVersion],
              ].map(([label, value]) => (
                <div key={label} className="rounded-[var(--radius-sm)] border border-border bg-surface-muted px-4 py-3">
                  <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{label}</dt>
                  <dd className="mt-1 break-words text-sm font-semibold text-foreground">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>
      ) : null}

      {defaultView === "support-my-tickets" ? (
        <div className="space-y-6">
          <MetricGrid
            items={[
              { id: "open", label: "Open tickets", value: String(tickets.filter((ticket) => ticket.status !== "Closed" && ticket.status !== "Resolved").length), helper: "Visible only to your school tenant" },
              { id: "critical", label: "Critical escalations", value: String(tickets.filter((ticket) => ticket.priority === "Critical").length), helper: "Instant support notification" },
              { id: "response", label: "Next response due", value: "15m", helper: "Based on active ticket SLA" },
            ]}
          />
          <DataTable
            title="My Tickets"
            subtitle="Threaded support history, attachments, and status tracking for this school."
            columns={columns}
            rows={tickets}
            getRowKey={(row) => row.id}
          />
        </div>
      ) : null}

      {defaultView === "support-knowledge-base" ? (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {knowledgeBaseArticles.map((article) => (
            <Card key={article.id} className="p-5">
              <BookOpenCheck className="h-5 w-5 text-foreground" />
              <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-muted">{article.category}</p>
              <h3 className="mt-2 text-lg font-semibold text-foreground">{article.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted">{article.summary}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {article.tags.map((tag) => (
                  <span key={tag} className="badge badge-neutral">{tag}</span>
                ))}
              </div>
            </Card>
          ))}
        </div>
      ) : null}

      {defaultView === "support-system-status" ? (
        <div className="grid gap-6 xl:grid-cols-[1fr_0.85fr]">
          <DataTable
            title="System Status"
            subtitle="Quickly see whether an issue is platform-wide before opening duplicate tickets."
            columns={[
              { id: "name", header: "Component", render: (row) => row.name },
              { id: "status", header: "Status", render: (row) => <StatusPill label={row.status} tone={row.status === "Degraded" ? "warning" : "ok"} /> },
              { id: "uptime", header: "Uptime", render: (row) => row.uptime },
              { id: "latency", header: "Latency", render: (row) => row.latency },
            ]}
            rows={systemStatusComponents}
            getRowKey={(row) => row.id}
          />
          <Card className="p-5">
            <AlertCircle className="h-5 w-5 text-warning" />
            <p className="mt-4 text-lg font-semibold text-foreground">Current incident note</p>
            <p className="mt-2 text-sm leading-6 text-muted">
              MPESA callbacks are degraded for a subset of providers. Schools can keep collecting payments while support monitors callback replay and reconciliation.
            </p>
            <div className="mt-5 flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-muted" />
              <span className="text-sm text-muted">Updated 8 minutes ago</span>
            </div>
          </Card>
        </div>
      ) : null}

      {defaultView === "support-new-ticket" ? (
        <DataTable
          title="Recent tickets"
          subtitle="Your school's current support history stays visible after each submission."
          columns={columns}
          rows={tickets}
          getRowKey={(row) => row.id}
        />
      ) : null}
    </div>
  );
}

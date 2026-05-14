"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Modal } from "@/components/ui/modal";
import { StatusPill } from "@/components/ui/status-pill";
import { isDashboardApiConfigured } from "@/lib/dashboard/api-client";
import { getSupportAppVersion } from "@/lib/support/app-version";
import {
  knowledgeBaseArticles,
  priorityTone,
  statusTone,
  supportCategories,
  supportModules,
  systemStatusComponents,
  type SupportAttachment,
  type SupportMessage,
  type SupportPriority,
  type SupportTicket,
} from "@/lib/support/support-data";
import {
  createSupportTicketLive,
  fetchKnowledgeBaseLive,
  fetchSupportCategoriesLive,
  fetchSupportTicketDetailLive,
  fetchSupportTicketsLive,
  fetchSystemStatusLive,
  replyToSupportTicketLive,
  uploadSupportAttachmentLive,
} from "@/lib/support/support-live";

type SchoolSupportView =
  | "support-new-ticket"
  | "support-my-tickets"
  | "support-knowledge-base"
  | "support-system-status";

function createBrowserContext(defaultView: SchoolSupportView, moduleAffected = "Support") {
  const userAgent =
    typeof navigator === "undefined" || !navigator.userAgent.includes("Chrome")
      ? "Chrome 124"
      : navigator.userAgent;
  const path =
    typeof window === "undefined"
      ? `/support/${defaultView}`
      : `${window.location.pathname}${window.location.search}`;

  return {
    requestId:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : "req-local-support",
    browser: userAgent,
    device:
      typeof navigator !== "undefined" && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)
        ? "Mobile device"
        : "Windows laptop",
    pageUrl: moduleAffected === "Support" ? path : `/school/admin/${moduleAffected.toLowerCase().replace(/\s+/g, "-")}`,
    appVersion: getSupportAppVersion(),
    errorLogs: ["No client errors captured in the last 5 minutes"],
  };
}

function upsertTicket(tickets: SupportTicket[], nextTicket: SupportTicket) {
  const existing = tickets.some((ticket) => ticket.id === nextTicket.id);
  return existing
    ? tickets.map((ticket) => (ticket.id === nextTicket.id ? nextTicket : ticket))
    : [nextTicket, ...tickets];
}

export function SupportCenterWorkspace({
  tenantSlug = null,
  defaultView,
}: {
  tenantSlug?: string | null;
  defaultView: SchoolSupportView;
}) {
  const normalizedTenantSlug = tenantSlug?.trim() ?? "";
  const apiConfigured = isDashboardApiConfigured();
  const queryClient = useQueryClient();
  const [localTickets, setLocalTickets] = useState<SupportTicket[]>([]);
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<string>("MPESA");
  const [priority, setPriority] = useState<SupportPriority>("Medium");
  const [moduleAffected, setModuleAffected] = useState<string>("MPESA");
  const [description, setDescription] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [createdAttachmentPath, setCreatedAttachmentPath] = useState<string | null>(null);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [schoolReply, setSchoolReply] = useState("");
  const [replyError, setReplyError] = useState<string | null>(null);
  const context = useMemo(
    () => createBrowserContext(defaultView, moduleAffected),
    [defaultView, moduleAffected],
  );
  const ticketsQueryKey = ["support-tickets", normalizedTenantSlug] as const;
  const ticketDetailQueryKey = ["support-ticket-detail", normalizedTenantSlug, selectedTicketId] as const;

  const liveTicketsQuery = useQuery({
    queryKey: ticketsQueryKey,
    queryFn: () => fetchSupportTicketsLive({ tenantSlug: normalizedTenantSlug, audience: "school" }),
    enabled: apiConfigured && Boolean(normalizedTenantSlug),
    retry: false,
    placeholderData: (previous) => previous,
  });
  const liveCategoriesQuery = useQuery({
    queryKey: ["support-categories", normalizedTenantSlug],
    queryFn: () => fetchSupportCategoriesLive(normalizedTenantSlug),
    enabled: apiConfigured && Boolean(normalizedTenantSlug),
    retry: false,
  });
  const liveKnowledgeBaseQuery = useQuery({
    queryKey: ["support-kb", normalizedTenantSlug],
    queryFn: () => fetchKnowledgeBaseLive(normalizedTenantSlug),
    enabled: apiConfigured && Boolean(normalizedTenantSlug) && defaultView === "support-knowledge-base",
    retry: false,
  });
  const liveSystemStatusQuery = useQuery({
    queryKey: ["support-status", normalizedTenantSlug],
    queryFn: () => fetchSystemStatusLive(normalizedTenantSlug),
    enabled: apiConfigured && Boolean(normalizedTenantSlug) && defaultView === "support-system-status",
    retry: false,
  });
  const liveTicketDetailQuery = useQuery({
    queryKey: ticketDetailQueryKey,
    queryFn: () =>
      fetchSupportTicketDetailLive({
        ticketId: selectedTicketId!,
        tenantSlug: normalizedTenantSlug,
        audience: "school",
      }),
    enabled: apiConfigured && Boolean(normalizedTenantSlug) && Boolean(selectedTicketId),
    retry: false,
  });
  const isLiveMode = Boolean(apiConfigured && liveTicketsQuery.data);
  const tickets = liveTicketsQuery.data ?? localTickets;
  const selectedTicket = liveTicketDetailQuery.data
    ?? tickets.find((ticket) => ticket.id === selectedTicketId)
    ?? null;
  const categoryOptions = liveCategoriesQuery.data?.length
    ? liveCategoriesQuery.data
    : [...supportCategories];
  const knowledgeArticles = liveKnowledgeBaseQuery.data?.length
    ? liveKnowledgeBaseQuery.data
    : knowledgeBaseArticles;
  const systemStatus = liveSystemStatusQuery.data?.components?.length
    ? liveSystemStatusQuery.data.components
    : systemStatusComponents;
  const currentIncident = liveSystemStatusQuery.data?.incidents?.[0];

  async function submitTicket() {
    if (!subject.trim() || !description.trim()) {
      setFormError("Subject and description are required before support can triage the ticket.");
      return;
    }

    if (!normalizedTenantSlug) {
      setFormError("A school workspace is required before support can create a tenant-scoped ticket.");
      return;
    }

    if (!apiConfigured) {
      setFormError("Support ticket creation is temporarily unavailable for this workspace.");
      return;
    }

    try {
      const liveTicket = await createSupportTicketLive({
        tenantSlug: normalizedTenantSlug,
        subject: subject.trim(),
        category,
        priority,
        moduleAffected,
        description: description.trim(),
        browser: context.browser,
        device: context.device,
        currentPageUrl: context.pageUrl,
        appVersion: context.appVersion,
        errorLogs: context.errorLogs,
      });
      const attachment = selectedFile
        ? await uploadSupportAttachmentLive({
            tenantSlug: normalizedTenantSlug,
            ticketId: liveTicket.id,
            file: selectedFile,
          })
        : null;
      const savedTicket = attachment
        ? { ...liveTicket, attachments: [attachment] }
        : liveTicket;

      queryClient.setQueryData<SupportTicket[]>(ticketsQueryKey, (current = []) =>
        upsertTicket(current, savedTicket),
      );
      setLocalTickets((current) => upsertTicket(current, savedTicket));
      setSuccessMessage(`Ticket ${savedTicket.ticketNumber} created and ${savedTicket.status.toLowerCase()}.`);
      setCreatedAttachmentPath(attachment?.storedPath ?? null);
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Unable to create the live support ticket.",
      );
      return;
    }

    setFormError(null);
    setSubject("");
    setDescription("");
    setSelectedFile(null);
  }

  async function sendSchoolReply() {
    if (!selectedTicket || !schoolReply.trim()) {
      return;
    }

    const body = schoolReply.trim();
    setReplyError(null);

    if (isLiveMode) {
      try {
        const response = await replyToSupportTicketLive({
          tenantSlug: normalizedTenantSlug,
          audience: "school",
          ticketId: selectedTicket.id,
          body,
        });

        applyTicketConversationUpdate(selectedTicket.id, response.ticket.status, response.message);
        setSchoolReply("");
        void queryClient.invalidateQueries({ queryKey: ticketsQueryKey });
        return;
      } catch (error) {
        setReplyError(
          error instanceof Error
            ? error.message
            : "Unable to send this support reply.",
        );
      }
    }

    applyTicketConversationUpdate(selectedTicket.id, "In Progress", {
      id: `school-reply-${selectedTicket.messages.length + 1}`,
      author: "School admin",
      authorType: "school",
      body,
      createdAt: "now",
    });
    setSchoolReply("");
  }

  function applyTicketConversationUpdate(ticketId: string, status: SupportTicket["status"], message: SupportMessage) {
    const updater = (ticket: SupportTicket): SupportTicket =>
      ticket.id === ticketId
        ? {
            ...ticket,
            status,
            updatedAt: "now",
            messages: [...ticket.messages, message],
          }
        : ticket;

    setLocalTickets((current) => current.map(updater));
    queryClient.setQueryData<SupportTicket[]>(ticketsQueryKey, (current) =>
      current ? current.map(updater) : current,
    );
    queryClient.setQueryData<SupportTicket>(ticketDetailQueryKey, (current) =>
      current ? updater(current) : current,
    );
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
    {
      id: "action",
      header: "Action",
      render: (row) => (
        <Button size="sm" variant="secondary" onClick={() => setSelectedTicketId(row.id)}>
          Open {row.ticketNumber}
        </Button>
      ),
      className: "text-right",
      headerClassName: "text-right",
    },
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
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill label="Tenant isolated" tone="ok" />
            <StatusPill label={isLiveMode ? "Support connected" : "Support connection required"} tone={isLiveMode ? "ok" : "warning"} />
          </div>
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
                  <select aria-label="Category" value={category} onChange={(event) => setCategory(event.target.value)} className="input-base">
                    {categoryOptions.map((item) => <option key={item}>{item}</option>)}
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
                  <select aria-label="Module affected" value={moduleAffected} onChange={(event) => setModuleAffected(event.target.value)} className="input-base">
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
                <Button onClick={submitTicket} disabled={liveTicketsQuery.isFetching}>
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
              { id: "response", label: "Next response due", value: tickets[0]?.firstResponseDue ?? "None", helper: "Based on active ticket SLA" },
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
          {knowledgeArticles.map((article) => (
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
              { id: "status", header: "Status", render: (row) => <StatusPill label={row.status} tone={row.status === "Operational" ? "ok" : "warning"} /> },
              { id: "uptime", header: "Uptime", render: (row) => row.uptime },
              { id: "latency", header: "Latency", render: (row) => row.latency },
            ]}
            rows={systemStatus}
            getRowKey={(row) => row.id}
          />
          <Card className="p-5">
            <AlertCircle className="h-5 w-5 text-warning" />
            <p className="mt-4 text-lg font-semibold text-foreground">Current incident note</p>
            <p className="mt-2 text-sm leading-6 text-muted">
              {currentIncident?.update_summary
                ?? "No active platform incident has been published by the live status service."}
            </p>
            <div className="mt-5 flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-muted" />
              <span className="text-sm text-muted">
                {currentIncident?.updated_at ? `Updated ${currentIncident.updated_at}` : "Status feed pending"}
              </span>
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

      <Modal
        open={Boolean(selectedTicket)}
        title="Ticket conversation"
        description={selectedTicket ? `${selectedTicket.ticketNumber} - ${selectedTicket.subject}` : undefined}
        size="lg"
        onClose={() => {
          setSelectedTicketId(null);
          setSchoolReply("");
          setReplyError(null);
        }}
        footer={
          <>
            <Button variant="secondary" onClick={() => setSelectedTicketId(null)}>
              Close
            </Button>
            <Button onClick={sendSchoolReply}>
              <Send className="h-4 w-4" />
              Send reply
            </Button>
          </>
        }
      >
        {selectedTicket ? (
          <div className="space-y-5">
            {replyError ? (
              <div role="alert" className="rounded-[var(--radius-sm)] border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-foreground">
                {replyError}
              </div>
            ) : null}
            <div className="grid gap-3 md:grid-cols-3">
              <SummaryTile label="Status" value={<StatusPill label={selectedTicket.status} tone={statusTone(selectedTicket.status)} />} />
              <SummaryTile label="Owner" value={selectedTicket.owner} />
              <SummaryTile label="Request ID" value={selectedTicket.context.requestId} />
            </div>
            <Conversation messages={selectedTicket.messages} />
            <Attachments attachments={selectedTicket.attachments} />
            <label className="space-y-2 text-sm text-foreground">
              <span className="font-medium">Reply to support</span>
              <textarea
                aria-label="Reply to support"
                value={schoolReply}
                onChange={(event) => setSchoolReply(event.target.value)}
                className="input-base min-h-24"
                placeholder="Add an update, answer a support question, or share what changed"
              />
            </label>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius-sm)] border border-border bg-surface-muted px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{label}</p>
      <div className="mt-2 text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}

function Conversation({ messages }: { messages: SupportMessage[] }) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-foreground">Conversation</p>
      {messages.length > 0 ? (
        messages.map((message) => (
          <div
            key={message.id}
            className={`rounded-[var(--radius-sm)] border px-4 py-3 ${
              message.authorType === "support"
                ? "border-accent/20 bg-accent-ghost"
                : "border-border bg-surface-muted"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-foreground">{message.author}</p>
              <span className="text-xs text-muted">{message.createdAt}</span>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted">{message.body}</p>
          </div>
        ))
      ) : (
        <p className="rounded-[var(--radius-sm)] border border-border bg-surface-muted px-4 py-3 text-sm text-muted">
          Conversation history is loading.
        </p>
      )}
    </div>
  );
}

function Attachments({ attachments }: { attachments: SupportAttachment[] }) {
  if (attachments.length === 0) {
    return null;
  }

  return (
    <div>
      <p className="text-sm font-semibold text-foreground">Attachments</p>
      <div className="mt-2 space-y-2">
        {attachments.map((attachment) => (
          <div key={attachment.id} className="flex items-center gap-3 rounded-[var(--radius-sm)] border border-border bg-surface-muted px-4 py-3 text-sm">
            <Paperclip className="h-4 w-4 text-muted" />
            <div className="min-w-0">
              <p className="font-semibold text-foreground">{attachment.name}</p>
              <p className="truncate text-xs text-muted">{attachment.storedPath}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

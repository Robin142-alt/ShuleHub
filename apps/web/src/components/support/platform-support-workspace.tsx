"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  BarChart3,
  Clock3,
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
import {
  createSupportTickets,
  priorityTone,
  statusTone,
  supportAnalytics,
  type SupportInternalNote,
  type SupportMessage,
  type SupportStatus,
  type SupportTicket,
} from "@/lib/support/support-data";
import {
  addSupportInternalNoteLive,
  escalateSupportTicketLive,
  fetchSupportAnalyticsLive,
  fetchSupportNotificationDeadLettersLive,
  fetchSupportTicketDetailLive,
  fetchSupportTicketsLive,
  mergeSupportTicketLive,
  replyToSupportTicketLive,
  type SupportNotificationDeliveryView,
  updateSupportTicketStatusLive,
} from "@/lib/support/support-live";

type PlatformSupportView =
  | "support"
  | "support-open"
  | "support-in-progress"
  | "support-escalated"
  | "support-resolved"
  | "support-sla"
  | "support-analytics";

const viewStatusMap: Partial<Record<PlatformSupportView, SupportStatus>> = {
  "support-open": "Open",
  "support-in-progress": "In Progress",
  "support-escalated": "Escalated",
  "support-resolved": "Resolved",
};

const supportStatuses: SupportStatus[] = [
  "Open",
  "In Progress",
  "Waiting for School",
  "Escalated",
  "Resolved",
  "Closed",
];

function upsertTicket(tickets: SupportTicket[], nextTicket: SupportTicket) {
  const exists = tickets.some((ticket) => ticket.id === nextTicket.id);
  return exists
    ? tickets.map((ticket) => (ticket.id === nextTicket.id ? { ...ticket, ...nextTicket } : ticket))
    : [nextTicket, ...tickets];
}

export function PlatformSupportWorkspace({
  defaultView,
}: {
  defaultView: PlatformSupportView;
}) {
  const apiConfigured = isDashboardApiConfigured();
  const queryClient = useQueryClient();
  const [localTickets, setLocalTickets] = useState(createSupportTickets);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<SupportStatus>("In Progress");
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [isSavingAction, setIsSavingAction] = useState(false);
  const ticketsQueryKey = ["platform-support-tickets"] as const;
  const detailQueryKey = ["platform-support-ticket-detail", selectedTicketId] as const;

  const liveTicketsQuery = useQuery({
    queryKey: ticketsQueryKey,
    queryFn: () => fetchSupportTicketsLive({ audience: "superadmin" }),
    enabled: apiConfigured,
    retry: false,
    placeholderData: (previous) => previous,
  });
  const liveAnalyticsQuery = useQuery({
    queryKey: ["platform-support-analytics"],
    queryFn: fetchSupportAnalyticsLive,
    enabled: apiConfigured,
    retry: false,
  });
  const liveDeadLettersQuery = useQuery({
    queryKey: ["platform-support-notification-dead-letters"],
    queryFn: fetchSupportNotificationDeadLettersLive,
    enabled: apiConfigured,
    retry: false,
  });
  const liveTicketDetailQuery = useQuery({
    queryKey: detailQueryKey,
    queryFn: () =>
      fetchSupportTicketDetailLive({
        ticketId: selectedTicketId!,
        audience: "superadmin",
      }),
    enabled: apiConfigured && Boolean(selectedTicketId),
    retry: false,
  });
  const isLiveMode = Boolean(apiConfigured && liveTicketsQuery.data);
  const tickets = liveTicketsQuery.data ?? localTickets;
  const selectedTicket = liveTicketDetailQuery.data
    ?? tickets.find((ticket) => ticket.id === selectedTicketId)
    ?? null;
  const analytics = liveAnalyticsQuery.data ?? supportAnalytics;
  const notificationDeadLetters = liveDeadLettersQuery.data ?? [];
  const filteredTickets = useMemo(() => {
    const mappedStatus = viewStatusMap[defaultView];

    if (!mappedStatus) {
      return tickets;
    }

    return tickets.filter((ticket) => ticket.status === mappedStatus);
  }, [defaultView, tickets]);

  function updateTicketState(nextTicket: SupportTicket) {
    setLocalTickets((currentTickets) => upsertTicket(currentTickets, nextTicket));
    queryClient.setQueryData<SupportTicket[]>(ticketsQueryKey, (current = []) =>
      upsertTicket(current, nextTicket),
    );
    queryClient.setQueryData<SupportTicket>(detailQueryKey, (current) =>
      current?.id === nextTicket.id ? { ...current, ...nextTicket } : current,
    );
  }

  function appendTicketMessage(ticketId: string, message: SupportMessage, status: SupportStatus) {
    const updater = (ticket: SupportTicket): SupportTicket =>
      ticket.id === ticketId
        ? {
            ...ticket,
            status,
            updatedAt: "now",
            messages: [...ticket.messages, message],
          }
        : ticket;

    setLocalTickets((currentTickets) => currentTickets.map(updater));
    queryClient.setQueryData<SupportTicket[]>(ticketsQueryKey, (current) =>
      current ? current.map(updater) : current,
    );
    queryClient.setQueryData<SupportTicket>(detailQueryKey, (current) =>
      current ? updater(current) : current,
    );
  }

  function appendInternalNote(ticketId: string, note: SupportInternalNote) {
    const updater = (ticket: SupportTicket): SupportTicket =>
      ticket.id === ticketId
        ? {
            ...ticket,
            internalNotes: [note, ...ticket.internalNotes],
          }
        : ticket;

    setLocalTickets((currentTickets) => currentTickets.map(updater));
    queryClient.setQueryData<SupportTicket[]>(ticketsQueryKey, (current) =>
      current ? current.map(updater) : current,
    );
    queryClient.setQueryData<SupportTicket>(detailQueryKey, (current) =>
      current ? updater(current) : current,
    );
  }

  async function runSupportAction(action: () => Promise<void>) {
    setActionError(null);
    setIsSavingAction(true);

    try {
      await action();
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Unable to complete this support action.",
      );
    } finally {
      setIsSavingAction(false);
    }
  }

  async function sendReply() {
    if (!selectedTicket || !reply.trim()) {
      return;
    }

    const body = reply.trim();

    await runSupportAction(async () => {
      if (isLiveMode) {
        const response = await replyToSupportTicketLive({
          audience: "superadmin",
          ticketId: selectedTicket.id,
          body,
          nextStatus: "Waiting for School",
        });

        appendTicketMessage(selectedTicket.id, response.message, response.ticket.status);
        void queryClient.invalidateQueries({ queryKey: ticketsQueryKey });
      } else {
        appendTicketMessage(selectedTicket.id, {
          id: `reply-${Date.now()}`,
          author: "Support agent",
          authorType: "support",
          body,
          createdAt: "now",
        }, "Waiting for School");
      }

      setReply("");
    });
  }

  async function saveInternalNote() {
    if (!selectedTicket || !internalNote.trim()) {
      return;
    }

    const body = internalNote.trim();

    await runSupportAction(async () => {
      if (isLiveMode) {
        const note = await addSupportInternalNoteLive({
          audience: "superadmin",
          ticketId: selectedTicket.id,
          note: body,
        });

        appendInternalNote(selectedTicket.id, note);
      } else {
        appendInternalNote(selectedTicket.id, {
          id: `note-${Date.now()}`,
          author: "Support agent",
          body,
          createdAt: "now",
        });
      }

      setInternalNote("");
    });
  }

  async function changeStatus(status: SupportStatus, reason?: string) {
    if (!selectedTicket) {
      return;
    }

    await runSupportAction(async () => {
      const nextTicket = isLiveMode
        ? await updateSupportTicketStatusLive({
            audience: "superadmin",
            ticketId: selectedTicket.id,
            status,
            reason,
          })
        : {
            ...selectedTicket,
            status,
            updatedAt: "now",
          };

      updateTicketState(nextTicket);
      void queryClient.invalidateQueries({ queryKey: ["platform-support-analytics"] });
    });
  }

  async function escalateTicket() {
    if (!selectedTicket) {
      return;
    }

    await runSupportAction(async () => {
      const nextTicket = isLiveMode
        ? await escalateSupportTicketLive({
            audience: "superadmin",
            ticketId: selectedTicket.id,
            reason: "Escalated from support command center",
          })
        : {
            ...selectedTicket,
            status: "Escalated" as SupportStatus,
            owner: selectedTicket.owner === "Unassigned" ? "Support escalation desk" : selectedTicket.owner,
            updatedAt: "now",
          };

      updateTicketState(nextTicket);
    });
  }

  async function mergeTicket() {
    if (!selectedTicket || !mergeTargetId.trim()) {
      return;
    }

    await runSupportAction(async () => {
      const nextTicket = isLiveMode
        ? await mergeSupportTicketLive({
            audience: "superadmin",
            ticketId: selectedTicket.id,
            targetTicketId: mergeTargetId.trim(),
            reason: "Duplicate merged from support command center",
          })
        : {
            ...selectedTicket,
            status: "Closed" as SupportStatus,
            updatedAt: "now",
          };

      updateTicketState(nextTicket);
      setMergeTargetId("");
    });
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
    { id: "tenant", header: "School", render: (row) => row.schoolName },
    { id: "module", header: "Module", render: (row) => row.moduleAffected },
    { id: "priority", header: "Priority", render: (row) => <StatusPill label={row.priority} tone={priorityTone(row.priority)} /> },
    { id: "status", header: "Status", render: (row) => <StatusPill label={row.status} tone={statusTone(row.status)} /> },
    { id: "owner", header: "Owner", render: (row) => row.owner },
    {
      id: "action",
      header: "Action",
      render: (row) => (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            setSelectedTicketId(row.id);
            setSelectedStatus(row.status);
          }}
        >
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
              Support
            </p>
            <h2 className="mt-2 text-2xl font-bold text-foreground">Support Command Center</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Global tenant support queue with threaded conversations, escalation visibility, assignment, internal notes, SLA monitoring, and recurring issue analytics.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill label={isLiveMode ? "Support connected" : "Support connection required"} tone={isLiveMode ? "ok" : "warning"} />
            <StatusPill label="Email queued" tone="warning" />
          </div>
        </div>
      </Card>

      <MetricGrid items={analytics.metrics} />

      {defaultView === "support-sla" ? (
        <div className="grid gap-6 lg:grid-cols-3">
          {tickets.map((ticket) => (
            <Card key={ticket.id} className="p-5">
              <Clock3 className="h-5 w-5 text-foreground" />
              <p className="mt-4 text-sm font-semibold text-foreground">{ticket.ticketNumber}</p>
              <p className="mt-1 text-sm text-muted">{ticket.schoolName}</p>
              <div className="mt-4 space-y-2 text-sm">
                <p><span className="font-semibold">First response:</span> {ticket.firstResponseDue}</p>
                <p><span className="font-semibold">Resolution:</span> {ticket.resolutionDue}</p>
              </div>
              <div className="mt-4"><StatusPill label={ticket.status} tone={statusTone(ticket.status)} /></div>
            </Card>
          ))}
        </div>
      ) : null}

      {defaultView === "support-analytics" ? (
        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <Card className="p-5">
            <BarChart3 className="h-5 w-5 text-foreground" />
            <p className="mt-4 text-lg font-semibold text-foreground">Ticket heatmap</p>
            <div className="mt-5 space-y-3">
              {analytics.heatmap.map((point) => (
                <div key={point.day} className="grid grid-cols-[44px_1fr_44px] items-center gap-3 text-sm">
                  <span className="font-medium text-foreground">{point.day}</span>
                  <div className="h-2 rounded-full bg-surface-strong">
                    <div className="h-2 rounded-full bg-accent" style={{ width: `${Math.min(100, point.tickets * 3)}%` }} />
                  </div>
                  <span className="text-right text-muted">{point.tickets}</span>
                </div>
              ))}
            </div>
          </Card>
          <RecurringIssuesCard issues={analytics.recurringIssues} />
        </div>
      ) : null}

      {defaultView !== "support-analytics" ? (
        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <DataTable
            title="Live support queue"
            subtitle="Search globally by ticket ID, school, module, subject, user, priority, or status."
            columns={columns}
            rows={filteredTickets}
            getRowKey={(row) => row.id}
          />
          <div className="space-y-6">
            <RecurringIssuesCard issues={analytics.recurringIssues} />
            <NotificationDeadLettersCard deadLetters={notificationDeadLetters} />
            <Card className="p-5">
              <AlertTriangle className="h-5 w-5 text-warning" />
              <p className="mt-4 text-lg font-semibold text-foreground">SLA breach risk</p>
              <p className="mt-2 text-sm leading-6 text-muted">
                Critical tickets without first response inside 15 minutes and high-priority tickets near resolution deadlines surface here before a school has to chase support.
              </p>
              <div className="mt-5 space-y-3">
                {tickets.slice(0, 2).map((ticket) => (
                  <div key={ticket.id} className="rounded-[var(--radius-sm)] border border-border bg-surface-muted px-4 py-3">
                    <p className="text-sm font-semibold text-foreground">{ticket.ticketNumber}</p>
                    <p className="mt-1 text-xs text-muted">{ticket.schoolName} - due {ticket.firstResponseDue}</p>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      ) : null}

      <Modal
        open={Boolean(selectedTicket)}
        title="Support ticket"
        description={selectedTicket ? `${selectedTicket.ticketNumber} - ${selectedTicket.schoolName}` : undefined}
        size="lg"
        onClose={() => {
          setSelectedTicketId(null);
          setReply("");
          setInternalNote("");
          setMergeTargetId("");
          setActionError(null);
        }}
        footer={
          <>
            <Button variant="secondary" onClick={() => setSelectedTicketId(null)}>
              Close
            </Button>
            <Button onClick={sendReply} disabled={isSavingAction}>
              <Send className="h-4 w-4" />
              Send reply
            </Button>
          </>
        }
      >
        {selectedTicket ? (
          <div className="space-y-5">
            {actionError ? (
              <div role="alert" className="rounded-[var(--radius-sm)] border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-foreground">
                {actionError}
              </div>
            ) : null}
            <div className="grid gap-3 md:grid-cols-3">
              <SummaryTile label="Status" value={<StatusPill label={selectedTicket.status} tone={statusTone(selectedTicket.status)} />} />
              <SummaryTile label="Owner" value={selectedTicket.owner} />
              <SummaryTile label="Request ID" value={selectedTicket.context.requestId} />
            </div>

            <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
              <label className="space-y-2 text-sm text-foreground">
                <span className="font-medium">Change status</span>
                <select
                  aria-label="Change status"
                  value={selectedStatus}
                  onChange={(event) => setSelectedStatus(event.target.value as SupportStatus)}
                  className="input-base"
                >
                  {supportStatuses.map((status) => <option key={status}>{status}</option>)}
                </select>
              </label>
              <Button className="self-end" variant="secondary" onClick={() => changeStatus(selectedStatus, "Manual support status update")} disabled={isSavingAction}>
                Apply
              </Button>
              <Button className="self-end" variant="danger" onClick={escalateTicket} disabled={isSavingAction}>
                Escalate
              </Button>
            </div>

            <Conversation messages={selectedTicket.messages} />
            <Attachments attachments={selectedTicket.attachments} />

            <div>
              <p className="text-sm font-semibold text-foreground">Internal notes</p>
              <div className="mt-2 space-y-2">
                {selectedTicket.internalNotes.length > 0 ? (
                  selectedTicket.internalNotes.map((note) => (
                    <div key={note.id} className="rounded-[var(--radius-sm)] border border-warning/20 bg-warning/10 px-4 py-3">
                      <p className="text-sm font-semibold text-foreground">{note.author}</p>
                      <p className="mt-2 text-sm leading-6 text-muted">{note.body}</p>
                    </div>
                  ))
                ) : (
                  <p className="rounded-[var(--radius-sm)] border border-border bg-surface-muted px-4 py-3 text-sm text-muted">
                    No private support notes yet.
                  </p>
                )}
              </div>
            </div>

            <label className="space-y-2 text-sm text-foreground">
              <span className="font-medium">Support reply</span>
              <textarea
                aria-label="Support reply"
                value={reply}
                onChange={(event) => setReply(event.target.value)}
                className="input-base min-h-24"
                placeholder="Write a clear update for the school"
              />
            </label>

            <div className="grid gap-3 md:grid-cols-[1fr_auto]">
              <label className="space-y-2 text-sm text-foreground">
                <span className="font-medium">Private internal note</span>
                <textarea
                  aria-label="Private internal note"
                  value={internalNote}
                  onChange={(event) => setInternalNote(event.target.value)}
                  className="input-base min-h-20"
                  placeholder="Add context only visible to support staff"
                />
              </label>
              <Button className="self-end" variant="secondary" onClick={saveInternalNote} disabled={isSavingAction}>
                Add note
              </Button>
            </div>

            <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
              <label className="space-y-2 text-sm text-foreground">
                <span className="font-medium">Merge duplicate into ticket ID</span>
                <input
                  aria-label="Merge duplicate into ticket ID"
                  value={mergeTargetId}
                  onChange={(event) => setMergeTargetId(event.target.value)}
                  className="input-base"
                  placeholder="Paste the duplicate ticket ID"
                />
              </label>
              <Button className="self-end" variant="secondary" onClick={mergeTicket} disabled={isSavingAction}>
                Merge
              </Button>
              <Button className="self-end" variant="secondary" onClick={() => changeStatus("Resolved", "Resolved from support command center")} disabled={isSavingAction}>
                Resolve
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function RecurringIssuesCard({ issues }: { issues: string[] }) {
  return (
    <Card className="p-5">
      <MessageSquareText className="h-5 w-5 text-foreground" />
      <p className="mt-4 text-lg font-semibold text-foreground">Recurring issues</p>
      <div className="mt-4 space-y-3">
        {issues.map((issue) => (
          <div key={issue} className="rounded-[var(--radius-sm)] border border-border bg-surface-muted px-4 py-3 text-sm font-medium text-foreground">
            {issue}
          </div>
        ))}
      </div>
    </Card>
  );
}

function NotificationDeadLettersCard({
  deadLetters,
}: {
  deadLetters: SupportNotificationDeliveryView[];
}) {
  return (
    <Card className="p-5">
      <AlertTriangle className="h-5 w-5 text-danger" />
      <div className="mt-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-semibold text-foreground">Notification dead letters</p>
          <p className="mt-1 text-sm text-muted">{deadLetters.length} failed deliveries</p>
        </div>
        <StatusPill label={deadLetters.length > 0 ? "Action needed" : "Clear"} tone={deadLetters.length > 0 ? "critical" : "ok"} />
      </div>
      <div className="mt-5 space-y-3">
        {deadLetters.length > 0 ? (
          deadLetters.slice(0, 3).map((item) => (
            <div key={item.id} className="rounded-[var(--radius-sm)] border border-danger/20 bg-danger/10 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">{item.ticketNumber}</p>
                <span className="text-xs font-medium uppercase text-muted">{item.channel}</span>
              </div>
              <p className="mt-1 text-xs text-muted">{item.schoolName} - {item.attempts} attempts</p>
              <p className="mt-2 text-sm leading-6 text-foreground">{item.error}</p>
            </div>
          ))
        ) : (
          <p className="rounded-[var(--radius-sm)] border border-border bg-surface-muted px-4 py-3 text-sm text-muted">
            No failed notification deliveries.
          </p>
        )}
      </div>
    </Card>
  );
}

function SummaryTile({ label, value }: { label: string; value: ReactNode }) {
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
      {messages.map((message) => (
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
      ))}
    </div>
  );
}

function Attachments({ attachments }: { attachments: SupportTicket["attachments"] }) {
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

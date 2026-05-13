"use client";

import { useMemo, useState } from "react";
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
import {
  createSupportTickets,
  priorityTone,
  statusTone,
  supportAnalytics,
  type SupportStatus,
  type SupportTicket,
} from "@/lib/support/support-data";

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

export function PlatformSupportWorkspace({
  defaultView,
}: {
  defaultView: PlatformSupportView;
}) {
  const [tickets, setTickets] = useState(createSupportTickets);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const selectedTicket = tickets.find((ticket) => ticket.id === selectedTicketId) ?? null;
  const filteredTickets = useMemo(() => {
    const mappedStatus = viewStatusMap[defaultView];

    if (!mappedStatus) {
      return tickets;
    }

    return tickets.filter((ticket) => ticket.status === mappedStatus);
  }, [defaultView, tickets]);

  function sendReply() {
    if (!selectedTicket || !reply.trim()) {
      return;
    }

    const body = reply.trim();

    setTickets((currentTickets) =>
      currentTickets.map((ticket) =>
        ticket.id === selectedTicket.id
          ? {
              ...ticket,
              status: "Waiting for School",
              updatedAt: "now",
              messages: [
                ...ticket.messages,
                {
                  id: `reply-${Date.now()}`,
                  author: "Support agent",
                  authorType: "support",
                  body,
                  createdAt: "now",
                },
              ],
            }
          : ticket,
      ),
    );
    setReply("");
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
              Support
            </p>
            <h2 className="mt-2 text-2xl font-bold text-foreground">Support Command Center</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Global tenant support queue with threaded conversations, escalation visibility, assignment, internal notes, SLA monitoring, and recurring issue analytics.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill label="In-app live" tone="ok" />
            <StatusPill label="Email queued" tone="warning" />
          </div>
        </div>
      </Card>

      <MetricGrid items={supportAnalytics.metrics} />

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
              {supportAnalytics.heatmap.map((point) => (
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
          <RecurringIssuesCard />
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
            <RecurringIssuesCard />
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
                    <p className="mt-1 text-xs text-muted">{ticket.schoolName} • due {ticket.firstResponseDue}</p>
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
        description={selectedTicket ? `${selectedTicket.ticketNumber} • ${selectedTicket.schoolName}` : undefined}
        size="lg"
        onClose={() => {
          setSelectedTicketId(null);
          setReply("");
        }}
        footer={
          <>
            <Button variant="secondary" onClick={() => setSelectedTicketId(null)}>
              Close
            </Button>
            <Button onClick={sendReply}>
              <Send className="h-4 w-4" />
              Send reply
            </Button>
          </>
        }
      >
        {selectedTicket ? (
          <div className="space-y-5">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-[var(--radius-sm)] border border-border bg-surface-muted px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Status</p>
                <div className="mt-2"><StatusPill label={selectedTicket.status} tone={statusTone(selectedTicket.status)} /></div>
              </div>
              <div className="rounded-[var(--radius-sm)] border border-border bg-surface-muted px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Owner</p>
                <p className="mt-2 text-sm font-semibold text-foreground">{selectedTicket.owner}</p>
              </div>
              <div className="rounded-[var(--radius-sm)] border border-border bg-surface-muted px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Request ID</p>
                <p className="mt-2 text-sm font-semibold text-foreground">{selectedTicket.context.requestId}</p>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-semibold text-foreground">Conversation</p>
              {selectedTicket.messages.map((message) => (
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

            {selectedTicket.attachments.length > 0 ? (
              <div>
                <p className="text-sm font-semibold text-foreground">Attachments</p>
                <div className="mt-2 space-y-2">
                  {selectedTicket.attachments.map((attachment) => (
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
            ) : null}

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
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function RecurringIssuesCard() {
  return (
    <Card className="p-5">
      <MessageSquareText className="h-5 w-5 text-foreground" />
      <p className="mt-4 text-lg font-semibold text-foreground">Recurring issues</p>
      <div className="mt-4 space-y-3">
        {supportAnalytics.recurringIssues.map((issue) => (
          <div key={issue} className="rounded-[var(--radius-sm)] border border-border bg-surface-muted px-4 py-3 text-sm font-medium text-foreground">
            {issue}
          </div>
        ))}
      </div>
    </Card>
  );
}

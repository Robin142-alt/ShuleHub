import type {
  SupportAttachment,
  SupportInternalNote,
  SupportMessage,
  SupportPriority,
  SupportStatus,
  SupportTicket,
} from "@/lib/support/support-data";
import { getCsrfToken } from "@/lib/auth/csrf-client";

export type LiveSupportTicketRecord = {
  id: string;
  tenant_id: string;
  ticket_number: string;
  subject: string;
  category: string;
  priority: SupportPriority;
  module_affected: string;
  description: string;
  status: SupportStatus;
  requester_user_id?: string | null;
  assigned_agent_id?: string | null;
  assigned_agent_name?: string | null;
  school_name?: string | null;
  first_response_due_at?: string | null;
  resolution_due_at?: string | null;
  context?: Record<string, unknown> | null;
  message_count?: number;
  attachment_count?: number;
  created_at: string;
  updated_at: string;
};

export type LiveSupportMessageRecord = {
  id: string;
  author_type: "school" | "support" | "system";
  body: string;
  created_at: string;
};

export type LiveSupportAttachmentRecord = {
  id: string;
  original_file_name: string;
  mime_type: string;
  size_bytes: number;
  stored_path: string;
};

export type LiveSupportInternalNoteRecord = {
  id: string;
  note: string;
  created_at: string;
};

export type LiveSupportTicketDetail = {
  ticket: LiveSupportTicketRecord;
  messages?: LiveSupportMessageRecord[];
  attachments?: LiveSupportAttachmentRecord[];
  internal_notes?: LiveSupportInternalNoteRecord[];
  status_logs?: unknown[];
};

export type LiveSupportCategoryRecord = {
  name: string;
};

export type LiveKnowledgeBaseArticle = {
  id: string;
  category: string;
  title: string;
  summary: string;
  tags?: string[];
};

export type LiveSystemStatusPayload = {
  components?: Array<{
    id: string;
    name: string;
    status: string;
    uptime_percent?: number | string | null;
    latency_ms?: number | string | null;
  }>;
  incidents?: Array<{
    id: string;
    title: string;
    impact: string;
    status: string;
    update_summary?: string | null;
    updated_at?: string | null;
  }>;
  active_incidents?: Array<{
    id: string;
    title: string;
    impact: string;
    status: string;
    update_summary?: string | null;
    updated_at?: string | null;
  }>;
  historical_incidents?: Array<{
    id: string;
    title: string;
    impact: string;
    status: string;
    update_summary?: string | null;
    updated_at?: string | null;
  }>;
  generated_at?: string;
};

export type LiveSupportAnalyticsPayload = {
  status_counts?: Array<{ status: SupportStatus; total: number }>;
  priority_counts?: Array<{ priority: SupportPriority; total: number }>;
  sla_breaches?: number;
  recurring_issues?: Array<{ category: string; module_affected: string; total: number }>;
  ticket_heatmap?: Array<{ day: string; total: number }>;
};

export type LiveSupportNotificationRecord = {
  id: string;
  tenant_id: string;
  ticket_id?: string | null;
  recipient_user_id?: string | null;
  recipient_type: "school" | "support";
  channel: "in_app" | "email" | "sms";
  title: string;
  body: string;
  delivery_status: string;
  delivery_attempts?: number | string | null;
  last_delivery_error?: string | null;
  next_delivery_attempt_at?: string | null;
  delivered_at?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  ticket_number?: string | null;
  ticket_subject?: string | null;
  school_name?: string | null;
};

export type SupportAnalyticsView = {
  metrics: Array<{ id: string; label: string; value: string; helper: string }>;
  recurringIssues: string[];
  heatmap: Array<{ day: string; tickets: number }>;
};

export type SupportNotificationDeliveryView = {
  id: string;
  ticketNumber: string;
  schoolName: string;
  title: string;
  channel: string;
  attempts: number;
  error: string;
  createdAt: string;
};

type ApiEnvelope<T> = {
  data: T;
  meta?: Record<string, unknown>;
};

function isEnvelope<T>(value: unknown): value is ApiEnvelope<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    "data" in value
  );
}

export function mapLiveSupportTicket(record: LiveSupportTicketRecord): SupportTicket {
  const context = normalizeContext(record.context);

  return {
    id: record.id,
    ticketNumber: record.ticket_number,
    tenantId: record.tenant_id,
    tenantSlug: record.tenant_id,
    schoolName: record.school_name ?? record.tenant_id,
    subject: record.subject,
    category: record.category,
    priority: record.priority,
    moduleAffected: record.module_affected,
    description: record.description,
    status: record.status,
    owner: record.assigned_agent_name ?? "Unassigned",
    requester: record.requester_user_id ?? "School user",
    updatedAt: formatSupportTimestamp(record.updated_at),
    firstResponseDue: formatSupportDue(record.first_response_due_at),
    resolutionDue: formatSupportDue(record.resolution_due_at),
    context,
    attachments: [],
    messages: [],
    internalNotes: [],
  };
}

export function mapLiveSupportTicketDetail(detail: LiveSupportTicketDetail): SupportTicket {
  const ticket = mapLiveSupportTicket(detail.ticket);

  return {
    ...ticket,
    attachments: (detail.attachments ?? []).map(mapLiveAttachment),
    messages: (detail.messages ?? []).map(mapLiveMessage),
    internalNotes: (detail.internal_notes ?? []).map(mapLiveInternalNote),
  };
}

export function mapLiveSupportCategories(records: LiveSupportCategoryRecord[]) {
  return records.map((record) => record.name);
}

export function mapLiveKnowledgeBase(records: LiveKnowledgeBaseArticle[]) {
  return records.map((record) => ({
    id: record.id,
    category: record.category,
    title: record.title,
    summary: record.summary,
    tags: record.tags ?? [],
  }));
}

export function mapLiveSystemStatus(payload: LiveSystemStatusPayload) {
  return {
    components: (payload.components ?? []).map((component) => ({
      id: component.id,
      name: component.name,
      status: component.status,
      uptime: formatUptime(component.uptime_percent),
      latency: formatLatency(component.latency_ms),
    })),
    incidents: payload.incidents ?? [],
  };
}

export function mapLiveSupportAnalytics(payload: LiveSupportAnalyticsPayload): SupportAnalyticsView {
  const statusCounts = payload.status_counts ?? [];
  const priorityCounts = payload.priority_counts ?? [];
  const unresolved = statusCounts
    .filter((item) => item.status !== "Resolved" && item.status !== "Closed")
    .reduce((total, item) => total + Number(item.total ?? 0), 0);
  const critical = priorityCounts
    .filter((item) => item.priority === "Critical")
    .reduce((total, item) => total + Number(item.total ?? 0), 0);

  return {
    metrics: [
      {
        id: "unresolved",
        label: "Unresolved tickets",
        value: String(unresolved),
        helper: "Open, in progress, waiting, and escalated",
      },
      {
        id: "breach",
        label: "SLA breach risk",
        value: String(payload.sla_breaches ?? 0),
        helper: "First response or resolution already overdue",
      },
      {
        id: "critical",
        label: "Critical tickets",
        value: String(critical),
        helper: "Instant escalation and support visibility",
      },
      {
        id: "response",
        label: "Queue source",
        value: "Live",
        helper: "Backed by the support ticket database",
      },
    ],
    recurringIssues: (payload.recurring_issues ?? []).map(
      (issue) => `${issue.category} in ${issue.module_affected}: ${issue.total} tickets`,
    ),
    heatmap: (payload.ticket_heatmap ?? []).map((point) => ({
      day: formatHeatmapDay(point.day),
      tickets: Number(point.total ?? 0),
    })),
  };
}

export function mapLiveSupportNotificationDeadLetter(
  record: LiveSupportNotificationRecord,
): SupportNotificationDeliveryView {
  return {
    id: record.id,
    ticketNumber: record.ticket_number ?? stringValue(record.metadata?.ticket_number, "Unlinked notification"),
    schoolName: record.school_name ?? record.tenant_id,
    title: record.title,
    channel: record.channel,
    attempts: Number(record.delivery_attempts ?? 0),
    error: record.last_delivery_error ?? "Delivery failed without a provider error.",
    createdAt: formatSupportTimestamp(record.created_at),
  };
}

export async function fetchSupportTicketsLive(input: {
  tenantSlug?: string | null;
  status?: SupportStatus;
  audience?: "school" | "superadmin";
}) {
  const params = new URLSearchParams();

  if (input.tenantSlug) params.set("tenantSlug", input.tenantSlug);
  if (input.status) params.set("status", input.status);
  if (input.audience) params.set("audience", input.audience);

  const records = await requestSupportProxy<LiveSupportTicketRecord[]>(
    `/tickets?${params.toString()}`,
  );

  return records.map(mapLiveSupportTicket);
}

export async function fetchSupportTicketDetailLive(input: {
  ticketId: string;
  tenantSlug?: string | null;
  audience?: "school" | "superadmin";
}) {
  const params = new URLSearchParams();

  if (input.tenantSlug) params.set("tenantSlug", input.tenantSlug);
  if (input.audience) params.set("audience", input.audience);

  const detail = await requestSupportProxy<LiveSupportTicketDetail>(
    `/tickets/${input.ticketId}?${params.toString()}`,
  );

  return mapLiveSupportTicketDetail(detail);
}

export async function createSupportTicketLive(input: {
  tenantSlug: string;
  subject: string;
  category: string;
  priority: SupportPriority;
  moduleAffected: string;
  description: string;
  browser: string;
  device: string;
  currentPageUrl: string;
  appVersion: string;
  errorLogs: string[];
}) {
  const response = await requestSupportProxy<{
    ticket: LiveSupportTicketRecord;
    initial_message: LiveSupportMessageRecord;
  }>("/tickets", {
    method: "POST",
    tenantSlug: input.tenantSlug,
    body: {
      subject: input.subject,
      category: input.category,
      priority: input.priority,
      module_affected: input.moduleAffected,
      description: input.description,
      browser: input.browser,
      device: input.device,
      current_page_url: input.currentPageUrl,
      app_version: input.appVersion,
      error_logs: input.errorLogs,
    },
  });

  return mapLiveSupportTicketDetail({
    ticket: response.ticket,
    messages: [response.initial_message],
    attachments: [],
    internal_notes: [],
    status_logs: [],
  });
}

export async function uploadSupportAttachmentLive(input: {
  tenantSlug: string;
  ticketId: string;
  file: File;
}) {
  const formData = new FormData();
  formData.set("file", input.file);

  const attachment = await requestSupportProxy<LiveSupportAttachmentRecord>(
    `/tickets/${input.ticketId}/attachments`,
    {
      method: "POST",
      tenantSlug: input.tenantSlug,
      formData,
    },
  );

  return mapLiveAttachment(attachment);
}

export async function replyToSupportTicketLive(input: {
  tenantSlug?: string | null;
  audience?: "school" | "superadmin";
  ticketId: string;
  body: string;
  nextStatus?: SupportStatus;
}) {
  const response = await requestSupportProxy<{
    ticket: LiveSupportTicketRecord;
    message: LiveSupportMessageRecord;
  }>(`/tickets/${input.ticketId}/messages`, {
    method: "POST",
    tenantSlug: input.tenantSlug,
    audience: input.audience,
    body: {
      body: input.body,
      ...(input.nextStatus ? { next_status: input.nextStatus } : {}),
    },
  });

  return {
    ticket: mapLiveSupportTicket(response.ticket),
    message: mapLiveMessage(response.message),
  };
}

export async function addSupportInternalNoteLive(input: {
  tenantSlug?: string | null;
  audience?: "superadmin";
  ticketId: string;
  note: string;
}) {
  const note = await requestSupportProxy<LiveSupportInternalNoteRecord>(
    `/tickets/${input.ticketId}/internal-notes`,
    {
      method: "POST",
      tenantSlug: input.tenantSlug,
      audience: input.audience,
      body: { note: input.note },
    },
  );

  return mapLiveInternalNote(note);
}

export async function updateSupportTicketStatusLive(input: {
  tenantSlug?: string | null;
  audience?: "superadmin";
  ticketId: string;
  status: SupportStatus;
  reason?: string;
}) {
  const ticket = await requestSupportProxy<LiveSupportTicketRecord>(
    `/tickets/${input.ticketId}/status`,
    {
      method: "PATCH",
      tenantSlug: input.tenantSlug,
      audience: input.audience,
      body: {
        status: input.status,
        ...(input.reason ? { reason: input.reason } : {}),
      },
    },
  );

  return mapLiveSupportTicket(ticket);
}

export async function escalateSupportTicketLive(input: {
  tenantSlug?: string | null;
  audience?: "superadmin";
  ticketId: string;
  reason?: string;
}) {
  const ticket = await requestSupportProxy<LiveSupportTicketRecord>(
    `/tickets/${input.ticketId}/escalate`,
    {
      method: "PATCH",
      tenantSlug: input.tenantSlug,
      audience: input.audience,
      body: { reason: input.reason ?? "Manual escalation from support workspace" },
    },
  );

  return mapLiveSupportTicket(ticket);
}

export async function mergeSupportTicketLive(input: {
  tenantSlug?: string | null;
  audience?: "superadmin";
  ticketId: string;
  targetTicketId: string;
  reason?: string;
}) {
  const ticket = await requestSupportProxy<LiveSupportTicketRecord>(
    `/tickets/${input.ticketId}/merge`,
    {
      method: "PATCH",
      tenantSlug: input.tenantSlug,
      audience: input.audience,
      body: {
        target_ticket_id: input.targetTicketId,
        ...(input.reason ? { reason: input.reason } : {}),
      },
    },
  );

  return mapLiveSupportTicket(ticket);
}

export async function fetchSupportCategoriesLive(tenantSlug: string) {
  const records = await requestSupportProxy<LiveSupportCategoryRecord[]>(
    `/categories?tenantSlug=${encodeURIComponent(tenantSlug)}`,
  );

  return mapLiveSupportCategories(records);
}

export async function fetchKnowledgeBaseLive(tenantSlug?: string | null) {
  const query = tenantSlug ? `?tenantSlug=${encodeURIComponent(tenantSlug)}` : "";
  const records = await requestSupportProxy<LiveKnowledgeBaseArticle[]>(
    `/knowledge-base${query}`,
  );

  return mapLiveKnowledgeBase(records);
}

export async function fetchSystemStatusLive(tenantSlug?: string | null) {
  const query = tenantSlug ? `?tenantSlug=${encodeURIComponent(tenantSlug)}` : "";
  const payload = await requestSupportProxy<LiveSystemStatusPayload>(
    `/system-status${query}`,
  );

  return mapLiveSystemStatus(payload);
}

export async function fetchPublicSystemStatusLive() {
  const payload = await requestPublicSupport<LiveSystemStatusPayload>(
    "/public/system-status",
  );

  return mapLiveSystemStatus(payload);
}

export async function fetchSupportAnalyticsLive() {
  const payload = await requestSupportProxy<LiveSupportAnalyticsPayload>(
    "/admin/analytics?audience=superadmin",
  );

  return mapLiveSupportAnalytics(payload);
}

export async function fetchSupportNotificationDeadLettersLive() {
  const records = await requestSupportProxy<LiveSupportNotificationRecord[]>(
    "/admin/notifications/dead-letter",
    { audience: "superadmin" },
  );

  return records.map(mapLiveSupportNotificationDeadLetter);
}

async function requestSupportProxy<T>(
  path: string,
  options?: {
    method?: "GET" | "POST" | "PATCH";
    tenantSlug?: string | null;
    audience?: "school" | "superadmin";
    body?: Record<string, unknown>;
    formData?: FormData;
  },
): Promise<T> {
  const params = new URLSearchParams();

  if (options?.tenantSlug) params.set("tenantSlug", options.tenantSlug);
  if (options?.audience) params.set("audience", options.audience);

  const method = options?.method ?? "GET";
  const csrfHeaders: Record<string, string> =
    method === "GET" ? {} : { "x-shulehub-csrf": await getCsrfToken() };
  const separator = path.includes("?") ? "&" : "?";
  const query = params.toString();
  const response = await fetch(`/api/support${path}${query ? `${separator}${query}` : ""}`, {
    method,
    credentials: "same-origin",
    headers: options?.formData
      ? csrfHeaders
      : {
          Accept: "application/json",
          ...csrfHeaders,
          ...(options?.body ? { "Content-Type": "application/json" } : {}),
        },
    body: options?.formData ?? (options?.body ? JSON.stringify(options.body) : undefined),
  });
  const payload = (await response.json().catch(() => null)) as
    | T
    | ApiEnvelope<T>
    | { message?: string }
    | null;

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "message" in payload && payload.message
        ? payload.message
        : "Support service is not available right now.";

    throw new Error(message);
  }

  return isEnvelope<T>(payload) ? payload.data : payload as T;
}

async function requestPublicSupport<T>(path: string): Promise<T> {
  const response = await fetch(`/api/support${path}`, {
    method: "GET",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
    },
  });
  const payload = (await response.json().catch(() => null)) as
    | T
    | ApiEnvelope<T>
    | { message?: string }
    | null;

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "message" in payload && payload.message
        ? payload.message
        : "System status is not available right now.";

    throw new Error(message);
  }

  return isEnvelope<T>(payload) ? payload.data : payload as T;
}

function mapLiveMessage(record: LiveSupportMessageRecord): SupportMessage {
  return {
    id: record.id,
    author: record.author_type === "support"
      ? "Support agent"
      : record.author_type === "system"
        ? "System"
        : "School user",
    authorType: record.author_type,
    body: record.body,
    createdAt: formatSupportTimestamp(record.created_at),
  };
}

function mapLiveAttachment(record: LiveSupportAttachmentRecord): SupportAttachment {
  return {
    id: record.id,
    name: record.original_file_name,
    type: record.mime_type,
    size: formatFileSize(record.size_bytes),
    storedPath: record.stored_path,
  };
}

function mapLiveInternalNote(record: LiveSupportInternalNoteRecord): SupportInternalNote {
  return {
    id: record.id,
    author: "Support team",
    body: record.note,
    createdAt: formatSupportTimestamp(record.created_at),
  };
}

function normalizeContext(context: Record<string, unknown> | null | undefined): SupportTicket["context"] {
  return {
    requestId: stringValue(context?.request_id, "Captured by API"),
    browser: stringValue(context?.browser, "Unknown browser"),
    device: stringValue(context?.device, "Unknown device"),
    pageUrl: stringValue(context?.current_page_url, "/"),
    appVersion: stringValue(context?.app_version, "unknown"),
    errorLogs: Array.isArray(context?.error_logs)
      ? context.error_logs.map((item) => String(item))
      : [],
  };
}

function stringValue(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function formatSupportTimestamp(value?: string | null) {
  const date = value ? new Date(value) : null;

  if (!date || Number.isNaN(date.getTime())) {
    return "now";
  }

  return new Intl.DateTimeFormat("en-KE", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Nairobi",
  }).format(date);
}

function formatSupportDue(value?: string | null) {
  const date = value ? new Date(value) : null;

  if (!date || Number.isNaN(date.getTime())) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-KE", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Nairobi",
  }).format(date);
}

function formatFileSize(bytes?: number | null) {
  return `${Math.max(1, Math.ceil(Number(bytes ?? 0) / 1024))} KB`;
}

function formatUptime(value?: number | string | null) {
  const numeric = Number(value);

  if (Number.isNaN(numeric)) {
    return "Unknown";
  }

  return `${numeric.toFixed(2)}%`;
}

function formatLatency(value?: number | string | null) {
  const numeric = Number(value);

  if (Number.isNaN(numeric)) {
    return "Unknown";
  }

  return `${Math.round(numeric)}ms`;
}

function formatHeatmapDay(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 3);
  }

  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: "UTC",
  }).format(date);
}

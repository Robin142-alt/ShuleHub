import { getCsrfToken } from "@/lib/auth/csrf-client";

export type DisciplineSeverity = "low" | "medium" | "high" | "critical";
export type DisciplineStatus =
  | "reported"
  | "under_review"
  | "pending_action"
  | "awaiting_parent_response"
  | "counselling_assigned"
  | "escalated"
  | "suspended"
  | "resolved"
  | "closed";

export interface DisciplineIncident {
  id: string;
  incident_number: string;
  title: string;
  severity: DisciplineSeverity;
  status: DisciplineStatus;
  student_id: string;
  class_id: string;
  academic_term_id: string;
  academic_year_id: string;
  offense_category_id: string;
  reporting_staff_id: string;
  assigned_staff_id: string | null;
  occurred_at: string;
  reported_at: string;
  location: string | null;
  description: string;
  action_taken: string | null;
  recommendations: string | null;
  parent_notification_status: string;
  behavior_points_delta: number;
  created_at: string;
  updated_at: string;
}

export interface OffenseCategory {
  id: string;
  code: string;
  name: string;
  description: string | null;
  default_severity: DisciplineSeverity;
  default_points: number;
  default_action_type: string | null;
  notify_parent_by_default: boolean;
  is_positive: boolean;
  is_active: boolean;
}

export interface DisciplineAnalytics {
  open_cases: number;
  severe_incidents: number;
  pending_approvals: number;
  repeat_offender_alerts: number;
  top_offenses: Array<{ offense: string; count: number }>;
  incidents_by_severity: Array<{ severity: string; count: number }>;
  incidents_by_status: Array<{ status: string; count: number }>;
  generated_at: string;
}

export interface DisciplineAction {
  id: string;
  action_type: string;
  status: string;
  title: string;
  assigned_staff_id: string | null;
  due_at: string | null;
  completed_at: string | null;
}

export interface DisciplineComment {
  id: string;
  visibility: "public" | "internal";
  body: string;
  author_user_id: string | null;
  created_at: string;
}

export interface DisciplineIncidentDetail {
  incident: DisciplineIncident;
  actions: DisciplineAction[];
  comments: DisciplineComment[];
  internal_visible: boolean;
}

export interface CounsellingDashboard {
  active_referrals: number;
  upcoming_sessions: number;
  improvement_cases: number;
  repeat_referrals: number;
  high_risk_students: number;
  followups_due: number;
  generated_at: string;
}

export interface CounsellingReferral {
  id: string;
  student_id: string;
  incident_id: string | null;
  risk_level: string;
  status: string;
  reason: string;
  created_at: string;
}

export interface CounsellingSession {
  id: string;
  student_id: string;
  referral_id: string | null;
  counsellor_user_id: string;
  scheduled_for: string;
  status: string;
  location: string | null;
  agenda: string | null;
  outcome_summary: string | null;
}

export interface CreateIncidentInput {
  student_id: string;
  class_id: string;
  academic_term_id: string;
  academic_year_id: string;
  offense_category_id: string;
  title: string;
  severity: DisciplineSeverity;
  occurred_at: string;
  location?: string;
  description: string;
  action_taken?: string;
  recommendations?: string;
  save_as_draft?: boolean;
}

export interface CreateOffenseCategoryInput {
  code: string;
  name: string;
  description?: string;
  default_severity: DisciplineSeverity;
  default_points: number;
  default_action_type?: string;
  notify_parent_by_default?: boolean;
  is_positive?: boolean;
}

async function disciplineRequest<T>(
  tenantSlug: string,
  path: string,
  options?: {
    method?: "GET" | "POST" | "PATCH";
    body?: object | FormData;
  },
): Promise<T> {
  const method = options?.method ?? "GET";
  const isFormData = typeof FormData !== "undefined" && options?.body instanceof FormData;
  const token = method === "GET" ? null : await getCsrfToken();
  const query = tenantSlug ? `?tenantSlug=${encodeURIComponent(tenantSlug)}` : "";
  const requestBody: BodyInit | undefined = isFormData
    ? options.body as FormData
    : options?.body
      ? JSON.stringify(options.body)
      : undefined;
  const response = await fetch(`/api/discipline/${path}${query}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(token ? { "x-csrf-token": token } : {}),
      ...(!isFormData && options?.body ? { "Content-Type": "application/json" } : {}),
    },
    body: requestBody,
    cache: "no-store",
  });

  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message);
  }

  return (await response.json()) as T;
}

async function counsellingRequest<T>(
  tenantSlug: string,
  path: string,
  options?: {
    method?: "GET" | "POST" | "PATCH";
    body?: object;
  },
): Promise<T> {
  const method = options?.method ?? "GET";
  const token = method === "GET" ? null : await getCsrfToken();
  const query = tenantSlug ? `?tenantSlug=${encodeURIComponent(tenantSlug)}` : "";
  const response = await fetch(`/api/counselling/${path}${query}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(token ? { "x-csrf-token": token } : {}),
      ...(options?.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options?.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });

  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message);
  }

  return (await response.json()) as T;
}

async function readErrorMessage(response: Response) {
  const fallback = `Request failed with status ${response.status}`;
  const payload = (await response.json().catch(() => null)) as { message?: string } | null;

  return payload?.message ?? fallback;
}

export function fetchDisciplineAnalytics(tenantSlug: string) {
  return disciplineRequest<DisciplineAnalytics>(tenantSlug, "analytics/overview");
}

export function fetchDisciplineIncidents(tenantSlug: string) {
  return disciplineRequest<DisciplineIncident[]>(tenantSlug, "incidents");
}

export function fetchParentDisciplineIncidents(tenantSlug: string) {
  return disciplineRequest<DisciplineIncident[]>(tenantSlug, "parent/incidents");
}

export function fetchDisciplineIncidentDetail(tenantSlug: string, incidentId: string) {
  return disciplineRequest<DisciplineIncidentDetail>(tenantSlug, `incidents/${incidentId}`);
}

export function fetchOffenseCategories(tenantSlug: string) {
  return disciplineRequest<OffenseCategory[]>(tenantSlug, "offense-categories");
}

export function createDisciplineIncident(tenantSlug: string, input: CreateIncidentInput) {
  return disciplineRequest<{ incident: DisciplineIncident }>(tenantSlug, "incidents", {
    method: "POST",
    body: input,
  });
}

export function updateDisciplineStatus(
  tenantSlug: string,
  incidentId: string,
  status: DisciplineStatus,
  reason?: string,
) {
  return disciplineRequest<DisciplineIncident>(tenantSlug, `incidents/${incidentId}/status`, {
    method: "POST",
    body: { status, reason },
  });
}

export function createDisciplineComment(
  tenantSlug: string,
  incidentId: string,
  body: string,
  visibility: "public" | "internal",
) {
  return disciplineRequest<DisciplineComment>(tenantSlug, `incidents/${incidentId}/comments`, {
    method: "POST",
    body: { body, visibility },
  });
}

export function createDisciplineAction(
  tenantSlug: string,
  incidentId: string,
  body: Record<string, unknown>,
) {
  return disciplineRequest<DisciplineAction>(tenantSlug, `incidents/${incidentId}/actions`, {
    method: "POST",
    body,
  });
}

export function createOffenseCategory(tenantSlug: string, input: CreateOffenseCategoryInput) {
  return disciplineRequest<OffenseCategory>(tenantSlug, "offense-categories", {
    method: "POST",
    body: input,
  });
}

export function exportDisciplineReport(
  tenantSlug: string,
  reportType: "incidents" | "behavior_summary" | "commendations" | "counselling_effectiveness",
  format: "pdf" | "csv" | "xlsx",
) {
  return disciplineRequest<{ status: string; report_type: string; format: string }>(
    tenantSlug,
    "reports/export",
    {
      method: "POST",
      body: { report_type: reportType, format },
    },
  );
}

export function generateDisciplineDocument(
  tenantSlug: string,
  incidentId: string,
  documentType:
    | "warning_letter"
    | "suspension_letter"
    | "expulsion_notice"
    | "counselling_referral"
    | "parent_summons"
    | "behavior_report"
    | "commendation_certificate",
) {
  return disciplineRequest<Record<string, unknown>>(tenantSlug, `incidents/${incidentId}/documents`, {
    method: "POST",
    body: { document_type: documentType },
  });
}

export function uploadDisciplineAttachment(
  tenantSlug: string,
  incidentId: string,
  file: File,
  visibility: "internal" | "parent_visible",
) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("visibility", visibility);

  return disciplineRequest(tenantSlug, `incidents/${incidentId}/attachments`, {
    method: "POST",
    body: formData,
  });
}

export function fetchCounsellingDashboard(tenantSlug: string) {
  return counsellingRequest<CounsellingDashboard>(tenantSlug, "dashboard");
}

export function fetchCounsellingReferrals(tenantSlug: string) {
  return counsellingRequest<CounsellingReferral[]>(tenantSlug, "referrals");
}

export function fetchCounsellingSessions(tenantSlug: string) {
  return counsellingRequest<CounsellingSession[]>(tenantSlug, "sessions");
}

export function createCounsellingReferral(
  tenantSlug: string,
  input: Record<string, unknown>,
) {
  return counsellingRequest<CounsellingReferral>(tenantSlug, "referrals", {
    method: "POST",
    body: input,
  });
}

export function createCounsellingSession(
  tenantSlug: string,
  input: Record<string, unknown>,
) {
  return counsellingRequest<CounsellingSession>(tenantSlug, "sessions", {
    method: "POST",
    body: input,
  });
}

export function acknowledgeDisciplineIncident(
  tenantSlug: string,
  incidentId: string,
  acknowledgementNote: string,
) {
  return disciplineRequest<{ acknowledged: boolean }>(
    tenantSlug,
    `parent/incidents/${incidentId}/acknowledge`,
    {
      method: "POST",
      body: { acknowledgement_note: acknowledgementNote },
    },
  );
}

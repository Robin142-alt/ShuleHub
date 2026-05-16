"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ClipboardList,
  FileText,
  LockKeyhole,
  MessageSquareText,
  Paperclip,
  RefreshCw,
  ShieldCheck,
  UserCheck,
} from "lucide-react";

import { MetricGrid } from "@/components/experience/metric-grid";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { StatusPill } from "@/components/ui/status-pill";
import { Tabs } from "@/components/ui/tabs";
import {
  acknowledgeDisciplineIncident,
  createCounsellingReferral,
  createCounsellingSession,
  createDisciplineAction,
  createDisciplineComment,
  createDisciplineIncident,
  createOffenseCategory,
  exportDisciplineReport,
  fetchCounsellingDashboard,
  fetchCounsellingReferrals,
  fetchCounsellingSessions,
  fetchDisciplineAnalytics,
  fetchDisciplineIncidentDetail,
  fetchDisciplineIncidents,
  fetchOffenseCategories,
  fetchParentDisciplineIncidents,
  generateDisciplineDocument,
  updateDisciplineStatus,
  uploadDisciplineAttachment,
  type CounsellingDashboard,
  type CounsellingReferral,
  type CounsellingSession,
  type DisciplineAnalytics,
  type DisciplineIncident,
  type DisciplineIncidentDetail,
  type DisciplineSeverity,
  type DisciplineStatus,
  type OffenseCategory,
} from "@/lib/discipline/discipline-live";
import { downloadTextFile, openPrintDocument } from "@/lib/dashboard/export";

type NoticeTone = "success" | "error" | "info";

const severityTone: Record<DisciplineSeverity, "ok" | "warning" | "critical"> = {
  low: "ok",
  medium: "warning",
  high: "critical",
  critical: "critical",
};

const statusTone: Record<DisciplineStatus, "ok" | "warning" | "critical"> = {
  reported: "warning",
  under_review: "warning",
  pending_action: "warning",
  awaiting_parent_response: "warning",
  counselling_assigned: "warning",
  escalated: "critical",
  suspended: "critical",
  resolved: "ok",
  closed: "ok",
};

const actionTypes = [
  "verbal_warning",
  "written_warning",
  "detention",
  "manual_work",
  "counselling",
  "suspension",
  "expulsion",
  "parent_meeting",
  "behavior_contract",
] as const;

function createBlankIncidentForm() {
  return {
    student_id: "",
    class_id: "",
    academic_term_id: "",
    academic_year_id: "",
    offense_category_id: "",
    title: "",
    severity: "medium" as DisciplineSeverity,
    occurred_at: new Date().toISOString().slice(0, 16),
    location: "",
    description: "",
    action_taken: "",
    recommendations: "",
    save_as_draft: false,
  };
}

function createBlankOffenseForm() {
  return {
    code: "",
    name: "",
    description: "",
    default_severity: "medium" as DisciplineSeverity,
    default_points: -5,
    default_action_type: "verbal_warning",
    notify_parent_by_default: false,
    is_positive: false,
  };
}

function createBlankActionForm() {
  return {
    action_type: "verbal_warning",
    title: "",
    description: "",
    assigned_staff_id: "",
    due_at: "",
    remarks: "",
  };
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function humanize(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function Notice({ tone, children }: { tone: NoticeTone; children: string }) {
  const classes = {
    success: "border-success/20 bg-success/10",
    error: "border-danger/20 bg-danger/10",
    info: "border-border bg-surface-muted",
  }[tone];

  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-sm text-foreground ${classes}`}>
      {children}
    </div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">{eyebrow}</p>
          <h2 className="mt-2 text-2xl font-bold text-foreground">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </Card>
  );
}

function TextInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="space-y-2 text-sm text-foreground">
      <span className="font-medium">{label}</span>
      <input
        className="input-base"
        value={value}
        type={type}
        required={required}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  placeholder,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="space-y-2 text-sm text-foreground">
      <span className="font-medium">{label}</span>
      <textarea
        className="input-base min-h-28"
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

export function DisciplineWorkspace({
  tenantSlug = null,
}: {
  tenantSlug?: string | null;
}) {
  const normalizedTenantSlug = tenantSlug?.trim() ?? "";
  const [analytics, setAnalytics] = useState<DisciplineAnalytics | null>(null);
  const [incidents, setIncidents] = useState<DisciplineIncident[]>([]);
  const [categories, setCategories] = useState<OffenseCategory[]>([]);
  const [counsellingDashboard, setCounsellingDashboard] = useState<CounsellingDashboard | null>(null);
  const [referrals, setReferrals] = useState<CounsellingReferral[]>([]);
  const [sessions, setSessions] = useState<CounsellingSession[]>([]);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [selectedIncident, setSelectedIncident] = useState<DisciplineIncidentDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: NoticeTone; message: string } | null>(null);
  const [incidentForm, setIncidentForm] = useState(createBlankIncidentForm);
  const [offenseForm, setOffenseForm] = useState(createBlankOffenseForm);
  const [actionForm, setActionForm] = useState(createBlankActionForm);
  const [commentText, setCommentText] = useState("");
  const [commentVisibility, setCommentVisibility] = useState<"public" | "internal">("public");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [counsellingStudentId, setCounsellingStudentId] = useState("");
  const [counsellingReason, setCounsellingReason] = useState("");
  const [sessionStudentId, setSessionStudentId] = useState("");
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().slice(0, 16));

  const loadOperationalData = useCallback(async () => {
    if (!normalizedTenantSlug) {
      setNotice({ tone: "error", message: "A school workspace is required before discipline data can load." });
      return;
    }

    setLoading(true);
    const [analyticsResult, incidentsResult, categoriesResult, counsellingResult, referralsResult, sessionsResult] =
      await Promise.allSettled([
        fetchDisciplineAnalytics(normalizedTenantSlug),
        fetchDisciplineIncidents(normalizedTenantSlug),
        fetchOffenseCategories(normalizedTenantSlug),
        fetchCounsellingDashboard(normalizedTenantSlug),
        fetchCounsellingReferrals(normalizedTenantSlug),
        fetchCounsellingSessions(normalizedTenantSlug),
      ]);

    if (analyticsResult.status === "fulfilled") setAnalytics(analyticsResult.value);
    if (incidentsResult.status === "fulfilled") setIncidents(incidentsResult.value);
    if (categoriesResult.status === "fulfilled") setCategories(categoriesResult.value);
    if (counsellingResult.status === "fulfilled") setCounsellingDashboard(counsellingResult.value);
    if (referralsResult.status === "fulfilled") setReferrals(referralsResult.value);
    if (sessionsResult.status === "fulfilled") setSessions(sessionsResult.value);

    const firstError = [analyticsResult, incidentsResult, categoriesResult].find(
      (result) => result.status === "rejected",
    ) as PromiseRejectedResult | undefined;

    if (firstError) {
      setNotice({ tone: "error", message: firstError.reason instanceof Error ? firstError.reason.message : "Discipline data could not load." });
    }

    setLoading(false);
  }, [normalizedTenantSlug]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadOperationalData();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadOperationalData]);

  useEffect(() => {
    if (!selectedIncidentId || !normalizedTenantSlug) {
      const timeoutId = window.setTimeout(() => {
        setSelectedIncident(null);
      }, 0);

      return () => window.clearTimeout(timeoutId);
    }

    let cancelled = false;
    fetchDisciplineIncidentDetail(normalizedTenantSlug, selectedIncidentId)
      .then((detail) => {
        if (!cancelled) setSelectedIncident(detail);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setNotice({ tone: "error", message: error instanceof Error ? error.message : "Case details could not load." });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [normalizedTenantSlug, selectedIncidentId]);

  const metrics = useMemo(
    () => [
      {
        id: "open-cases",
        label: "Open cases",
        value: String(analytics?.open_cases ?? 0),
        helper: "Cases not yet resolved or closed",
        trend: `${analytics?.severe_incidents ?? 0} severe`,
      },
      {
        id: "approvals",
        label: "Pending approvals",
        value: String(analytics?.pending_approvals ?? 0),
        helper: "Suspension or expulsion decisions awaiting approval",
        trend: "Principal review",
      },
      {
        id: "repeat-alerts",
        label: "Repeat alerts",
        value: String(analytics?.repeat_offender_alerts ?? 0),
        helper: "Students with repeated incidents in the review window",
        trend: "90 days",
      },
      {
        id: "counselling",
        label: "Counselling referrals",
        value: String(counsellingDashboard?.active_referrals ?? 0),
        helper: "Active referrals and support follow-ups",
        trend: `${counsellingDashboard?.followups_due ?? 0} due`,
      },
    ],
    [analytics, counsellingDashboard],
  );

  const incidentColumns: DataTableColumn<DisciplineIncident>[] = [
    {
      id: "case",
      header: "Case",
      render: (row) => (
        <button
          type="button"
          className="text-left font-semibold text-foreground hover:text-primary"
          onClick={() => setSelectedIncidentId(row.id)}
        >
          {row.incident_number}
          <span className="block text-xs font-normal text-muted">{row.title}</span>
        </button>
      ),
    },
    { id: "severity", header: "Severity", render: (row) => <StatusPill label={humanize(row.severity)} tone={severityTone[row.severity]} /> },
    { id: "status", header: "Status", render: (row) => <StatusPill label={humanize(row.status)} tone={statusTone[row.status]} /> },
    { id: "student", header: "Student", render: (row) => <span className="font-mono text-xs">{row.student_id.slice(0, 8)}</span> },
    { id: "date", header: "Date", render: (row) => formatDate(row.occurred_at) },
    {
      id: "actions",
      header: "Actions",
      render: (row) => (
        <div className="flex flex-wrap gap-1">
          <Button variant="secondary" onClick={() => setSelectedIncidentId(row.id)}>Open</Button>
          {row.status !== "resolved" ? (
            <Button variant="secondary" onClick={() => void changeStatus(row.id, "resolved")}>Resolve</Button>
          ) : null}
        </div>
      ),
    },
  ];

  async function submitIncident() {
    if (!normalizedTenantSlug) return;
    if (!incidentForm.offense_category_id && categories[0]) {
      setIncidentForm((current) => ({ ...current, offense_category_id: categories[0].id }));
    }

    setBusy(true);
    try {
      const response = await createDisciplineIncident(normalizedTenantSlug, {
        ...incidentForm,
        offense_category_id: incidentForm.offense_category_id || categories[0]?.id || "",
        occurred_at: new Date(incidentForm.occurred_at).toISOString(),
        location: incidentForm.location || undefined,
        action_taken: incidentForm.action_taken || undefined,
        recommendations: incidentForm.recommendations || undefined,
      });
      setNotice({ tone: "success", message: `Incident ${response.incident.incident_number} was created.` });
      setIncidentForm(createBlankIncidentForm());
      setSelectedIncidentId(response.incident.id);
      await loadOperationalData();
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Incident could not be created." });
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(incidentId: string, status: DisciplineStatus) {
    if (!normalizedTenantSlug) return;
    setBusy(true);
    try {
      await updateDisciplineStatus(normalizedTenantSlug, incidentId, status, `Status changed to ${status}.`);
      setNotice({ tone: "success", message: `Case status changed to ${humanize(status)}.` });
      await loadOperationalData();
      if (incidentId === selectedIncidentId) {
        setSelectedIncident(await fetchDisciplineIncidentDetail(normalizedTenantSlug, incidentId));
      }
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Status update failed." });
    } finally {
      setBusy(false);
    }
  }

  async function addComment() {
    if (!normalizedTenantSlug || !selectedIncidentId || !commentText.trim()) return;
    setBusy(true);
    try {
      await createDisciplineComment(normalizedTenantSlug, selectedIncidentId, commentText.trim(), commentVisibility);
      setCommentText("");
      setNotice({ tone: "success", message: commentVisibility === "internal" ? "Internal note saved." : "Case comment saved." });
      setSelectedIncident(await fetchDisciplineIncidentDetail(normalizedTenantSlug, selectedIncidentId));
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Comment could not be saved." });
    } finally {
      setBusy(false);
    }
  }

  async function addAction() {
    if (!normalizedTenantSlug || !selectedIncidentId || !actionForm.title.trim()) return;
    setBusy(true);
    try {
      await createDisciplineAction(normalizedTenantSlug, selectedIncidentId, {
        action_type: actionForm.action_type,
        title: actionForm.title.trim(),
        description: actionForm.description.trim() || undefined,
        assigned_staff_id: actionForm.assigned_staff_id.trim() || undefined,
        due_at: actionForm.due_at ? new Date(actionForm.due_at).toISOString() : undefined,
        remarks: actionForm.remarks.trim() || undefined,
      });
      setActionForm(createBlankActionForm());
      setNotice({ tone: "success", message: "Disciplinary action added to the case." });
      setSelectedIncident(await fetchDisciplineIncidentDetail(normalizedTenantSlug, selectedIncidentId));
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Action could not be added." });
    } finally {
      setBusy(false);
    }
  }

  async function uploadEvidence() {
    if (!normalizedTenantSlug || !selectedIncidentId || !selectedFile) return;
    setBusy(true);
    try {
      await uploadDisciplineAttachment(normalizedTenantSlug, selectedIncidentId, selectedFile, "internal");
      setSelectedFile(null);
      setNotice({ tone: "success", message: "Evidence uploaded and attached to the case." });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Evidence upload failed." });
    } finally {
      setBusy(false);
    }
  }

  async function saveOffenseCategory() {
    if (!normalizedTenantSlug || !offenseForm.code.trim() || !offenseForm.name.trim()) return;
    setBusy(true);
    try {
      await createOffenseCategory(normalizedTenantSlug, {
        ...offenseForm,
        code: offenseForm.code.trim(),
        name: offenseForm.name.trim(),
        description: offenseForm.description.trim() || undefined,
        default_points: Number(offenseForm.default_points),
        default_action_type: offenseForm.default_action_type || undefined,
      });
      setOffenseForm(createBlankOffenseForm());
      setNotice({ tone: "success", message: "Offense category saved." });
      setCategories(await fetchOffenseCategories(normalizedTenantSlug));
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Offense category could not be saved." });
    } finally {
      setBusy(false);
    }
  }

  async function referForCounselling() {
    if (!normalizedTenantSlug || !counsellingStudentId.trim() || !counsellingReason.trim()) return;
    setBusy(true);
    try {
      await createCounsellingReferral(normalizedTenantSlug, {
        student_id: counsellingStudentId.trim(),
        class_id: incidentForm.class_id || selectedIncident?.incident.class_id || "",
        academic_term_id: incidentForm.academic_term_id || selectedIncident?.incident.academic_term_id || "",
        academic_year_id: incidentForm.academic_year_id || selectedIncident?.incident.academic_year_id || "",
        incident_id: selectedIncidentId ?? undefined,
        reason: counsellingReason.trim(),
        risk_level: "medium",
      });
      setCounsellingStudentId("");
      setCounsellingReason("");
      setNotice({ tone: "success", message: "Counselling referral created." });
      setReferrals(await fetchCounsellingReferrals(normalizedTenantSlug));
      setCounsellingDashboard(await fetchCounsellingDashboard(normalizedTenantSlug));
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Counselling referral could not be created." });
    } finally {
      setBusy(false);
    }
  }

  async function scheduleSession() {
    if (!normalizedTenantSlug || !sessionStudentId.trim()) return;
    setBusy(true);
    try {
      await createCounsellingSession(normalizedTenantSlug, {
        student_id: sessionStudentId.trim(),
        scheduled_for: new Date(sessionDate).toISOString(),
        location: "Counselling office",
        agenda: "Follow-up support session",
      });
      setSessionStudentId("");
      setNotice({ tone: "success", message: "Counselling session scheduled." });
      setSessions(await fetchCounsellingSessions(normalizedTenantSlug));
      setCounsellingDashboard(await fetchCounsellingDashboard(normalizedTenantSlug));
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Session could not be scheduled." });
    } finally {
      setBusy(false);
    }
  }

  async function queueReport(format: "pdf" | "csv" | "xlsx") {
    if (!normalizedTenantSlug) return;
    setBusy(true);
    try {
      await exportDisciplineReport(normalizedTenantSlug, "incidents", format);
      setNotice({ tone: "success", message: `${format.toUpperCase()} discipline report was queued.` });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Report export could not be queued." });
    } finally {
      setBusy(false);
    }
  }

  async function generateLetter(documentType: "warning_letter" | "parent_summons" | "behavior_report") {
    if (!normalizedTenantSlug || !selectedIncidentId) return;
    setBusy(true);
    try {
      await generateDisciplineDocument(normalizedTenantSlug, selectedIncidentId, documentType);
      setNotice({ tone: "success", message: `${humanize(documentType)} generated for this case.` });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Document generation failed." });
    } finally {
      setBusy(false);
    }
  }

  function printSelectedCase() {
    if (!selectedIncident) return;
    openPrintDocument({
      eyebrow: "Discipline case",
      title: `${selectedIncident.incident.incident_number} - ${selectedIncident.incident.title}`,
      subtitle: `${humanize(selectedIncident.incident.severity)} severity, ${humanize(selectedIncident.incident.status)} status`,
      rows: [
        { label: "Occurred", value: formatDate(selectedIncident.incident.occurred_at) },
        { label: "Location", value: selectedIncident.incident.location ?? "Not recorded" },
        { label: "Description", value: selectedIncident.incident.description },
        { label: "Recommendations", value: selectedIncident.incident.recommendations ?? "None recorded" },
      ],
      footer: "Confidential school discipline record. Internal-only notes are excluded from parent-facing copies.",
    });
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Discipline and counselling"
        title="Student behavior operations"
        description="Track incidents, actions, parent notices, counselling referrals, behavior points, and confidential follow-up in one tenant-isolated workspace."
        actions={
          <>
            <Button variant="secondary" onClick={() => void loadOperationalData()} disabled={loading}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button onClick={() => void queueReport("pdf")} disabled={busy}>
              <FileText className="mr-2 h-4 w-4" />
              Queue PDF
            </Button>
          </>
        }
      />
      {notice ? <Notice tone={notice.tone}>{notice.message}</Notice> : null}
      <Tabs
        items={[
          {
            id: "dashboard",
            label: "Dashboard",
            panel: (
              <div className="space-y-6">
                <MetricGrid items={metrics} />
                <div className="grid gap-6 xl:grid-cols-[1fr_0.8fr]">
                  <DataTable
                    title="Recent incidents"
                    subtitle="Newest behavior cases in this school workspace."
                    rows={incidents.slice(0, 8)}
                    columns={incidentColumns}
                    getRowKey={(row) => row.id}
                    emptyMessage="No discipline incidents have been recorded yet."
                  />
                  <Card className="p-5">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-soft text-foreground">
                        <AlertTriangle className="h-5 w-5" />
                      </span>
                      <div>
                        <h3 className="section-title text-lg">Offense heatmap</h3>
                        <p className="text-sm text-muted">Most frequent categories from live incident records.</p>
                      </div>
                    </div>
                    <div className="mt-5 space-y-3">
                      {(analytics?.top_offenses ?? []).length === 0 ? (
                        <p className="rounded-xl border border-border bg-surface-muted px-4 py-4 text-sm text-muted">No offense trends yet.</p>
                      ) : (
                        analytics?.top_offenses.map((item) => (
                          <div key={item.offense} className="flex items-center justify-between rounded-xl border border-border px-4 py-3">
                            <span className="font-medium text-foreground">{item.offense}</span>
                            <span className="text-sm text-muted">{item.count} cases</span>
                          </div>
                        ))
                      )}
                    </div>
                  </Card>
                </div>
              </div>
            ),
          },
          {
            id: "incidents",
            label: "Incident queue",
            panel: (
              <div className="space-y-6">
                <DataTable
                  title="Discipline queue"
                  subtitle="Search, triage, assign, and resolve student behavior cases."
                  rows={incidents}
                  columns={incidentColumns}
                  getRowKey={(row) => row.id}
                  emptyMessage="No cases are in the discipline queue."
                />
                <IncidentDetailPanel
                  detail={selectedIncident}
                  busy={busy}
                  commentText={commentText}
                  commentVisibility={commentVisibility}
                  actionForm={actionForm}
                  selectedFile={selectedFile}
                  onCommentTextChange={setCommentText}
                  onCommentVisibilityChange={setCommentVisibility}
                  onActionFormChange={setActionForm}
                  onSelectedFileChange={setSelectedFile}
                  onAddComment={addComment}
                  onAddAction={addAction}
                  onUploadEvidence={uploadEvidence}
                  onChangeStatus={changeStatus}
                  onGenerateLetter={generateLetter}
                  onPrintCase={printSelectedCase}
                />
              </div>
            ),
          },
          {
            id: "create",
            label: "Create incident",
            panel: (
              <Card className="p-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <TextInput label="Student record ID" value={incidentForm.student_id} required onChange={(value) => setIncidentForm((current) => ({ ...current, student_id: value }))} />
                  <TextInput label="Class record ID" value={incidentForm.class_id} required onChange={(value) => setIncidentForm((current) => ({ ...current, class_id: value }))} />
                  <TextInput label="Academic term ID" value={incidentForm.academic_term_id} required onChange={(value) => setIncidentForm((current) => ({ ...current, academic_term_id: value }))} />
                  <TextInput label="Academic year ID" value={incidentForm.academic_year_id} required onChange={(value) => setIncidentForm((current) => ({ ...current, academic_year_id: value }))} />
                  <label className="space-y-2 text-sm text-foreground">
                    <span className="font-medium">Offense category</span>
                    <select className="input-base" value={incidentForm.offense_category_id} onChange={(event) => setIncidentForm((current) => ({ ...current, offense_category_id: event.target.value }))}>
                      <option value="">Select category</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>{category.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-2 text-sm text-foreground">
                    <span className="font-medium">Severity</span>
                    <select className="input-base" value={incidentForm.severity} onChange={(event) => setIncidentForm((current) => ({ ...current, severity: event.target.value as DisciplineSeverity }))}>
                      {(["low", "medium", "high", "critical"] as const).map((severity) => (
                        <option key={severity} value={severity}>{humanize(severity)}</option>
                      ))}
                    </select>
                  </label>
                  <TextInput label="Incident title" value={incidentForm.title} required onChange={(value) => setIncidentForm((current) => ({ ...current, title: value }))} />
                  <TextInput label="Incident date and time" type="datetime-local" value={incidentForm.occurred_at} required onChange={(value) => setIncidentForm((current) => ({ ...current, occurred_at: value }))} />
                  <TextInput label="Location" value={incidentForm.location} onChange={(value) => setIncidentForm((current) => ({ ...current, location: value }))} />
                </div>
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <TextArea label="Detailed description" value={incidentForm.description} required onChange={(value) => setIncidentForm((current) => ({ ...current, description: value }))} />
                  <TextArea label="Recommendation" value={incidentForm.recommendations} onChange={(value) => setIncidentForm((current) => ({ ...current, recommendations: value }))} />
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <label className="inline-flex items-center gap-2 text-sm text-muted">
                    <input type="checkbox" checked={incidentForm.save_as_draft} onChange={(event) => setIncidentForm((current) => ({ ...current, save_as_draft: event.target.checked }))} />
                    Save as review draft
                  </label>
                  <Button onClick={() => void submitIncident()} disabled={busy || !categories.length}>Create incident</Button>
                </div>
              </Card>
            ),
          },
          {
            id: "counselling",
            label: "Counselling",
            panel: (
              <CounsellingPanel
                dashboard={counsellingDashboard}
                referrals={referrals}
                sessions={sessions}
                studentId={counsellingStudentId}
                reason={counsellingReason}
                sessionStudentId={sessionStudentId}
                sessionDate={sessionDate}
                busy={busy}
                onStudentIdChange={setCounsellingStudentId}
                onReasonChange={setCounsellingReason}
                onSessionStudentIdChange={setSessionStudentId}
                onSessionDateChange={setSessionDate}
                onRefer={referForCounselling}
                onSchedule={scheduleSession}
              />
            ),
          },
          {
            id: "offenses",
            label: "Offense settings",
            panel: (
              <div className="space-y-6">
                <Card className="p-5">
                  <div className="grid gap-4 md:grid-cols-2">
                    <TextInput label="Code" value={offenseForm.code} onChange={(value) => setOffenseForm((current) => ({ ...current, code: value }))} placeholder="lateness" />
                    <TextInput label="Name" value={offenseForm.name} onChange={(value) => setOffenseForm((current) => ({ ...current, name: value }))} placeholder="Lateness" />
                    <label className="space-y-2 text-sm text-foreground">
                      <span className="font-medium">Default severity</span>
                      <select className="input-base" value={offenseForm.default_severity} onChange={(event) => setOffenseForm((current) => ({ ...current, default_severity: event.target.value as DisciplineSeverity }))}>
                        {(["low", "medium", "high", "critical"] as const).map((severity) => (
                          <option key={severity} value={severity}>{humanize(severity)}</option>
                        ))}
                      </select>
                    </label>
                    <TextInput label="Point impact" type="number" value={String(offenseForm.default_points)} onChange={(value) => setOffenseForm((current) => ({ ...current, default_points: Number(value) }))} />
                    <label className="space-y-2 text-sm text-foreground">
                      <span className="font-medium">Default action</span>
                      <select className="input-base" value={offenseForm.default_action_type} onChange={(event) => setOffenseForm((current) => ({ ...current, default_action_type: event.target.value }))}>
                        {actionTypes.map((action) => <option key={action} value={action}>{humanize(action)}</option>)}
                      </select>
                    </label>
                    <TextInput label="Description" value={offenseForm.description} onChange={(value) => setOffenseForm((current) => ({ ...current, description: value }))} />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-4">
                    <label className="inline-flex items-center gap-2 text-sm text-muted">
                      <input type="checkbox" checked={offenseForm.notify_parent_by_default} onChange={(event) => setOffenseForm((current) => ({ ...current, notify_parent_by_default: event.target.checked }))} />
                      Notify parent by default
                    </label>
                    <label className="inline-flex items-center gap-2 text-sm text-muted">
                      <input type="checkbox" checked={offenseForm.is_positive} onChange={(event) => setOffenseForm((current) => ({ ...current, is_positive: event.target.checked, default_points: event.target.checked ? Math.abs(current.default_points) : -Math.abs(current.default_points) }))} />
                      Positive commendation category
                    </label>
                    <Button onClick={() => void saveOffenseCategory()} disabled={busy}>Save category</Button>
                  </div>
                </Card>
                <DataTable
                  title="Configured offenses"
                  subtitle="School-defined severity, parent notification, and behavior scoring rules."
                  rows={categories}
                  getRowKey={(row) => row.id}
                  columns={[
                    { id: "name", header: "Name", render: (row) => row.name },
                    { id: "severity", header: "Severity", render: (row) => <StatusPill label={humanize(row.default_severity)} tone={severityTone[row.default_severity]} /> },
                    { id: "points", header: "Points", render: (row) => row.default_points },
                    { id: "notify", header: "Parent notice", render: (row) => row.notify_parent_by_default ? "Automatic" : "Manual" },
                  ]}
                />
              </div>
            ),
          },
          {
            id: "reports",
            label: "Reports",
            panel: (
              <Card className="p-5">
                <div className="grid gap-4 md:grid-cols-3">
                  {(["pdf", "csv", "xlsx"] as const).map((format) => (
                    <button key={format} type="button" onClick={() => void queueReport(format)} className="rounded-xl border border-border bg-surface-muted px-4 py-5 text-left transition hover:border-primary/40">
                      <FileText className="h-5 w-5 text-muted" />
                      <p className="mt-3 font-semibold text-foreground">{format.toUpperCase()} incident export</p>
                      <p className="mt-1 text-sm text-muted">Queues a tenant-scoped discipline report without confidential counselling notes.</p>
                    </button>
                  ))}
                </div>
                <div className="mt-5 rounded-xl border border-border bg-surface-muted px-4 py-4 text-sm text-muted">
                  Report exports are scoped to the current school workspace and exclude private counselling notes unless a counsellor grants explicit visibility.
                </div>
              </Card>
            ),
          },
        ]}
      />
    </div>
  );
}

function IncidentDetailPanel({
  detail,
  busy,
  commentText,
  commentVisibility,
  actionForm,
  selectedFile,
  onCommentTextChange,
  onCommentVisibilityChange,
  onActionFormChange,
  onSelectedFileChange,
  onAddComment,
  onAddAction,
  onUploadEvidence,
  onChangeStatus,
  onGenerateLetter,
  onPrintCase,
}: {
  detail: DisciplineIncidentDetail | null;
  busy: boolean;
  commentText: string;
  commentVisibility: "public" | "internal";
  actionForm: ReturnType<typeof createBlankActionForm>;
  selectedFile: File | null;
  onCommentTextChange: (value: string) => void;
  onCommentVisibilityChange: (value: "public" | "internal") => void;
  onActionFormChange: (value: ReturnType<typeof createBlankActionForm>) => void;
  onSelectedFileChange: (file: File | null) => void;
  onAddComment: () => Promise<void>;
  onAddAction: () => Promise<void>;
  onUploadEvidence: () => Promise<void>;
  onChangeStatus: (incidentId: string, status: DisciplineStatus) => Promise<void>;
  onGenerateLetter: (type: "warning_letter" | "parent_summons" | "behavior_report") => Promise<void>;
  onPrintCase: () => void;
}) {
  if (!detail) {
    return (
      <Card className="p-5">
        <div className="flex items-center gap-3">
          <ClipboardList className="h-5 w-5 text-muted" />
          <p className="text-sm text-muted">Select a case from the queue to review timelines, actions, notes, evidence, and parent-facing letters.</p>
        </div>
      </Card>
    );
  }

  const incident = detail.incident;

  return (
    <Card className="p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Case detail</p>
          <h3 className="mt-2 text-xl font-bold text-foreground">{incident.incident_number} - {incident.title}</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{incident.description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusPill label={humanize(incident.severity)} tone={severityTone[incident.severity]} />
          <StatusPill label={humanize(incident.status)} tone={statusTone[incident.status]} />
        </div>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-4">
        {[
          ["Occurred", formatDate(incident.occurred_at)],
          ["Location", incident.location ?? "Not recorded"],
          ["Behavior points", String(incident.behavior_points_delta)],
          ["Parent notice", humanize(incident.parent_notification_status)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-border bg-surface-muted px-4 py-3">
            <p className="text-xs uppercase tracking-[0.14em] text-muted">{label}</p>
            <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
          </div>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        {(["under_review", "pending_action", "awaiting_parent_response", "counselling_assigned", "escalated", "resolved", "closed"] as DisciplineStatus[]).map((status) => (
          <Button key={status} variant="secondary" onClick={() => void onChangeStatus(incident.id, status)} disabled={busy}>
            {humanize(status)}
          </Button>
        ))}
        <Button variant="secondary" onClick={onPrintCase}>Print summary</Button>
        <Button variant="secondary" onClick={() => void onGenerateLetter("warning_letter")}>Warning letter</Button>
        <Button variant="secondary" onClick={() => void onGenerateLetter("parent_summons")}>Parent summons</Button>
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_0.85fr]">
        <div className="space-y-4">
          <h4 className="font-semibold text-foreground">Timeline and notes</h4>
          <div className="space-y-3">
            {[...detail.comments].map((comment) => (
              <div key={comment.id} className="rounded-xl border border-border px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-foreground">{comment.visibility === "internal" ? "Internal note" : "School note"}</p>
                  <p className="text-xs text-muted">{formatDate(comment.created_at)}</p>
                </div>
                <p className="mt-2 text-sm leading-6 text-muted">{comment.body}</p>
              </div>
            ))}
            {detail.comments.length === 0 ? (
              <p className="rounded-xl border border-border bg-surface-muted px-4 py-4 text-sm text-muted">No timeline notes yet.</p>
            ) : null}
          </div>
          <TextArea label="Add note" value={commentText} onChange={onCommentTextChange} placeholder="Write a respectful case update or private investigation note." />
          <div className="flex flex-wrap items-center gap-3">
            <select className="input-base max-w-xs" value={commentVisibility} onChange={(event) => onCommentVisibilityChange(event.target.value as "public" | "internal")}>
              <option value="public">Visible in school timeline</option>
              <option value="internal">Internal staff note</option>
            </select>
            <Button onClick={() => void onAddComment()} disabled={busy || !commentText.trim()}>Save note</Button>
          </div>
        </div>
        <div className="space-y-4">
          <h4 className="font-semibold text-foreground">Actions and evidence</h4>
          <div className="space-y-3">
            {detail.actions.map((action) => (
              <div key={action.id} className="rounded-xl border border-border px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-foreground">{action.title}</p>
                  <StatusPill label={humanize(action.status)} tone={action.status === "completed" || action.status === "approved" ? "ok" : "warning"} />
                </div>
                <p className="mt-1 text-sm text-muted">{humanize(action.action_type)} due {formatDate(action.due_at)}</p>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-border bg-surface-muted p-4">
            <div className="grid gap-3">
              <select className="input-base" value={actionForm.action_type} onChange={(event) => onActionFormChange({ ...actionForm, action_type: event.target.value })}>
                {actionTypes.map((action) => <option key={action} value={action}>{humanize(action)}</option>)}
              </select>
              <TextInput label="Action title" value={actionForm.title} onChange={(value) => onActionFormChange({ ...actionForm, title: value })} />
              <TextInput label="Assigned staff ID" value={actionForm.assigned_staff_id} onChange={(value) => onActionFormChange({ ...actionForm, assigned_staff_id: value })} />
              <TextInput label="Due date" type="datetime-local" value={actionForm.due_at} onChange={(value) => onActionFormChange({ ...actionForm, due_at: value })} />
              <Button onClick={() => void onAddAction()} disabled={busy || !actionForm.title.trim()}>Add action</Button>
            </div>
          </div>
          <div className="rounded-xl border border-border p-4">
            <div className="flex items-center gap-2">
              <Paperclip className="h-4 w-4 text-muted" />
              <p className="text-sm font-semibold text-foreground">Evidence upload</p>
            </div>
            <input className="mt-3 input-base" type="file" onChange={(event) => onSelectedFileChange(event.target.files?.[0] ?? null)} />
            <Button className="mt-3" variant="secondary" onClick={() => void onUploadEvidence()} disabled={busy || !selectedFile}>Upload evidence</Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function CounsellingPanel({
  dashboard,
  referrals,
  sessions,
  studentId,
  reason,
  sessionStudentId,
  sessionDate,
  busy,
  onStudentIdChange,
  onReasonChange,
  onSessionStudentIdChange,
  onSessionDateChange,
  onRefer,
  onSchedule,
}: {
  dashboard: CounsellingDashboard | null;
  referrals: CounsellingReferral[];
  sessions: CounsellingSession[];
  studentId: string;
  reason: string;
  sessionStudentId: string;
  sessionDate: string;
  busy: boolean;
  onStudentIdChange: (value: string) => void;
  onReasonChange: (value: string) => void;
  onSessionStudentIdChange: (value: string) => void;
  onSessionDateChange: (value: string) => void;
  onRefer: () => Promise<void>;
  onSchedule: () => Promise<void>;
}) {
  const metrics = [
    { id: "active", label: "Active referrals", value: String(dashboard?.active_referrals ?? 0), helper: "Students awaiting support", trend: "Counsellor controlled" },
    { id: "sessions", label: "Upcoming sessions", value: String(dashboard?.upcoming_sessions ?? 0), helper: "Scheduled in the next two weeks", trend: "Calendar" },
    { id: "risk", label: "High-risk students", value: String(dashboard?.high_risk_students ?? 0), helper: "Restricted confidential access", trend: "Encrypted notes" },
  ];

  return (
    <div className="space-y-6">
      <MetricGrid items={metrics} />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-center gap-3">
            <UserCheck className="h-5 w-5 text-muted" />
            <div>
              <h3 className="section-title text-lg">Create referral</h3>
              <p className="text-sm text-muted">Refer a student to counselling without exposing confidential notes.</p>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            <TextInput label="Student record ID" value={studentId} onChange={onStudentIdChange} />
            <TextArea label="Referral reason" value={reason} onChange={onReasonChange} />
            <Button onClick={() => void onRefer()} disabled={busy || !studentId.trim() || !reason.trim()}>Create referral</Button>
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3">
            <LockKeyhole className="h-5 w-5 text-muted" />
            <div>
              <h3 className="section-title text-lg">Schedule session</h3>
              <p className="text-sm text-muted">Private counselling sessions are visible only to authorized users.</p>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            <TextInput label="Student record ID" value={sessionStudentId} onChange={onSessionStudentIdChange} />
            <TextInput label="Scheduled for" type="datetime-local" value={sessionDate} onChange={onSessionDateChange} />
            <Button onClick={() => void onSchedule()} disabled={busy || !sessionStudentId.trim()}>Schedule session</Button>
          </div>
        </Card>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <DataTable
          title="Referrals"
          rows={referrals}
          getRowKey={(row) => row.id}
          columns={[
            { id: "student", header: "Student", render: (row) => <span className="font-mono text-xs">{row.student_id.slice(0, 8)}</span> },
            { id: "risk", header: "Risk", render: (row) => humanize(row.risk_level) },
            { id: "status", header: "Status", render: (row) => humanize(row.status) },
          ]}
          emptyMessage="No counselling referrals yet."
        />
        <DataTable
          title="Sessions"
          rows={sessions}
          getRowKey={(row) => row.id}
          columns={[
            { id: "student", header: "Student", render: (row) => <span className="font-mono text-xs">{row.student_id.slice(0, 8)}</span> },
            { id: "scheduled", header: "Scheduled", render: (row) => formatDate(row.scheduled_for) },
            { id: "status", header: "Status", render: (row) => humanize(row.status) },
          ]}
          emptyMessage="No counselling sessions scheduled."
        />
      </div>
    </div>
  );
}

export function ParentDisciplineView({
  tenantSlug = null,
}: {
  tenantSlug?: string | null;
}) {
  const normalizedTenantSlug = tenantSlug?.trim() ?? "";
  const [incidents, setIncidents] = useState<DisciplineIncident[]>([]);
  const [selectedIncidentId, setSelectedIncidentId] = useState("");
  const [acknowledgementNote, setAcknowledgementNote] = useState("");
  const [notice, setNotice] = useState<{ tone: NoticeTone; message: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const loadParentIncidents = useCallback(async () => {
    setLoading(true);
    try {
      setIncidents(await fetchParentDisciplineIncidents(normalizedTenantSlug));
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Discipline notices could not load." });
    } finally {
      setLoading(false);
    }
  }, [normalizedTenantSlug]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadParentIncidents();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadParentIncidents]);

  async function acknowledge() {
    if (!selectedIncidentId) return;
    try {
      await acknowledgeDisciplineIncident(normalizedTenantSlug, selectedIncidentId, acknowledgementNote.trim());
      setNotice({ tone: "success", message: "Notice acknowledged. The school can now see your response." });
      setAcknowledgementNote("");
      setSelectedIncidentId("");
      await loadParentIncidents();
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Notice could not be acknowledged." });
    }
  }

  function downloadSummary() {
    downloadTextFile({
      filename: "discipline-notices.txt",
      content: [
        "ShuleHub discipline notices",
        "",
        ...incidents.map((incident) => `${incident.incident_number} | ${incident.title} | ${humanize(incident.status)} | ${formatDate(incident.occurred_at)}`),
      ].join("\n"),
    });
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Parent portal"
        title="Behavior notices"
        description="Respectful discipline communication for linked learners only. Confidential staff and counselling notes are not shown here."
        actions={
          <>
            <Button variant="secondary" onClick={() => void loadParentIncidents()} disabled={loading}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button variant="secondary" onClick={downloadSummary}>Download summary</Button>
          </>
        }
      />
      {notice ? <Notice tone={notice.tone}>{notice.message}</Notice> : null}
      <div className="grid gap-6 xl:grid-cols-[1fr_0.75fr]">
        <DataTable
          title="Linked learner notices"
          subtitle="Only incidents intentionally shared with parents appear here."
          rows={incidents}
          getRowKey={(row) => row.id}
          columns={[
            { id: "case", header: "Notice", render: (row) => <button type="button" className="text-left font-semibold text-foreground hover:text-primary" onClick={() => setSelectedIncidentId(row.id)}>{row.incident_number}<span className="block text-xs font-normal text-muted">{row.title}</span></button> },
            { id: "severity", header: "Severity", render: (row) => <StatusPill label={humanize(row.severity)} tone={severityTone[row.severity]} /> },
            { id: "status", header: "Status", render: (row) => <StatusPill label={humanize(row.status)} tone={statusTone[row.status]} /> },
            { id: "date", header: "Date", render: (row) => formatDate(row.occurred_at) },
          ]}
          emptyMessage="No discipline notices have been shared with this portal account."
        />
        <Card className="p-5">
          <div className="flex items-center gap-3">
            <MessageSquareText className="h-5 w-5 text-muted" />
            <div>
              <h3 className="section-title text-lg">Acknowledge notice</h3>
              <p className="text-sm text-muted">Acknowledgement helps the school close the communication loop.</p>
            </div>
          </div>
          <select className="mt-4 input-base" value={selectedIncidentId} onChange={(event) => setSelectedIncidentId(event.target.value)}>
            <option value="">Select notice</option>
            {incidents.map((incident) => (
              <option key={incident.id} value={incident.id}>{incident.incident_number} - {incident.title}</option>
            ))}
          </select>
          <TextArea label="Optional response" value={acknowledgementNote} onChange={setAcknowledgementNote} placeholder="Write a short response for the school, if needed." />
          <Button className="mt-3" onClick={() => void acknowledge()} disabled={!selectedIncidentId}>Acknowledge</Button>
          <div className="mt-5 rounded-xl border border-border bg-surface-muted px-4 py-4 text-sm text-muted">
            <ShieldCheck className="mb-2 h-4 w-4" />
            Parent access is limited to linked learners. Private counsellor notes, internal investigations, and unrelated records are hidden.
          </div>
        </Card>
      </div>
    </div>
  );
}

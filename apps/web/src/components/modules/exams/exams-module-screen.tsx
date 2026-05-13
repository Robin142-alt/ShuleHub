"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";
import {
  AlertCircle,
  BarChart3,
  BookOpenCheck,
  CheckCircle2,
  ClipboardCheck,
  FileDown,
  FileSpreadsheet,
  History,
  LockKeyhole,
  Search,
  ShieldCheck,
  Upload,
  Users,
  Wand2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { StatusPill } from "@/components/ui/status-pill";
import { Tabs } from "@/components/ui/tabs";
import {
  downloadCsvFile,
  openPrintDocument,
} from "@/lib/dashboard/export";
import type { StatusTone } from "@/lib/dashboard/types";
import {
  buildExamsModuleData,
  calculateMarksSummary,
  validateExamScore,
  type ApprovalStep,
  type CbcCompetencyRow,
  type ExamAnalysisItem,
  type ExamAllocationRow,
  type ExamAuditEntry,
  type ExamMarkRow,
  type ExamPublishingItem,
  type ExamScoreField,
  type ExamScoreFieldId,
  type ExamSetupItem,
  type HistoricalResult,
  type ReportCardBatch,
} from "@/lib/modules/exams-data";
import type { SchoolExperienceRole } from "@/lib/experiences/types";

type SaveState = "synced" | "saving" | "offline";
type SubmissionState = "draft" | "submitted" | "reopened";

const toneClasses: Record<StatusTone, string> = {
  ok: "border-success/20 bg-success/10 text-success",
  warning: "border-warning/20 bg-warning/10 text-warning",
  critical: "border-danger/20 bg-danger/10 text-danger",
};

const statusToneMap: Record<ExamMarkRow["status"], StatusTone> = {
  Clean: "ok",
  Missing: "warning",
  Review: "warning",
  Outlier: "critical",
};

function metricIcon(tone: StatusTone) {
  if (tone === "ok") {
    return CheckCircle2;
  }

  if (tone === "critical") {
    return AlertCircle;
  }

  return ClipboardCheck;
}

function getCellKey(rowId: string, fieldId: ExamScoreFieldId) {
  return `${rowId}:${fieldId}`;
}

function getSaveLabel(saveState: SaveState) {
  if (saveState === "saving") {
    return "Saving changes";
  }

  if (saveState === "offline") {
    return "Offline queue protected";
  }

  return "Autosaved just now";
}

function getSubmissionMessage(submissionState: SubmissionState) {
  if (submissionState === "submitted") {
    return "Submission locked for HOD review";
  }

  if (submissionState === "reopened") {
    return "Marks reopened for teacher correction";
  }

  return "Teacher draft open";
}

function getRowValidation(row: ExamMarkRow, fields: ExamScoreField[]) {
  for (const field of fields) {
    const validation = validateExamScore(row.scores[field.id], field.maxScore);

    if (!validation.valid) {
      return validation;
    }
  }

  return null;
}

function PageIntro({
  schoolName,
  currentExam,
  currentClass,
  saveState,
}: {
  schoolName: string;
  currentExam: string;
  currentClass: string;
  saveState: SaveState;
}) {
  return (
    <section className="overflow-hidden rounded-[var(--radius)] border border-border bg-white shadow-sm">
      <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="px-5 py-5 md:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill
              label={saveState === "synced" ? "Autosave ready" : getSaveLabel(saveState)}
              tone={saveState === "saving" ? "pending" : "synced"}
            />
            <span className="badge badge-info">Draft recovered locally</span>
            <span className="badge badge-neutral">Tenant isolated</span>
          </div>
          <h2 className="mt-4 text-2xl font-bold leading-tight text-foreground md:text-3xl">
            Exams & Results command center
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            {schoolName} is running {currentExam} for {currentClass}. Marks, moderation,
            approvals, parent PDFs, publishing controls, and trace records stay in one fast
            academic operations surface.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button size="lg">
              <BookOpenCheck className="h-4 w-4" />
              Continue marks entry
            </Button>
            <Button variant="secondary" size="lg">
              <Upload className="h-4 w-4" />
              Import spreadsheet
            </Button>
            <Button variant="secondary" size="lg">
              <FileDown className="h-4 w-4" />
              Generate reports
            </Button>
          </div>
        </div>
        <div className="border-t border-border bg-surface-muted px-5 py-5 xl:border-l xl:border-t-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
            Exam period posture
          </p>
          <div className="mt-4 space-y-3">
            {[
              ["Data safety", "Autosave, local draft, conflict-ready records"],
              ["Governance", "Teacher to HOD to deputy to principal"],
              ["Publishing", "Immutable results after approval lock"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-[var(--radius-sm)] border border-border bg-white px-4 py-3">
                <p className="text-sm font-semibold text-foreground">{label}</p>
                <p className="mt-1 text-[13px] leading-5 text-muted">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function MetricStrip({
  metrics,
}: {
  metrics: ReturnType<typeof buildExamsModuleData>["metrics"];
}) {
  return (
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
      {metrics.map((metric) => {
        const Icon = metricIcon(metric.tone);

        return (
          <Card key={metric.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                  {metric.label}
                </p>
                <p className="mt-3 text-2xl font-bold leading-none text-foreground">
                  {metric.value}
                </p>
              </div>
              <span className={`inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] border ${toneClasses[metric.tone]}`}>
                <Icon className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-3 text-[13px] leading-5 text-muted">{metric.helper}</p>
          </Card>
        );
      })}
    </section>
  );
}

function DashboardPanel({
  data,
}: {
  data: ReturnType<typeof buildExamsModuleData>;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Card className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Operational dashboard</p>
            <h3 className="mt-2 section-title text-lg">Submission pressure and moderation queues</h3>
          </div>
          <StatusPill label="Live exam window" tone="ok" />
        </div>
        <div className="mt-5 space-y-4">
          {data.queues.map((queue) => (
            <div key={queue.id} className="rounded-[var(--radius-sm)] border border-border bg-surface-muted px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">{queue.title}</p>
                  <p className="mt-1 text-[13px] leading-5 text-muted">{queue.subtitle}</p>
                </div>
                <StatusPill label={queue.value} tone={queue.tone} />
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                <div
                  className="h-full rounded-full bg-info"
                  style={{ width: `${queue.progress}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="space-y-5">
        <Card className="p-5">
          <p className="eyebrow">Teacher quick access</p>
          <div className="mt-4 space-y-3">
            {["Grade 8 Unity - Mathematics", "Grade 7 Hope - English", "Grade 9 Courage - Science"].map((item) => (
              <button
                key={item}
                type="button"
                className="flex w-full items-center justify-between rounded-[var(--radius-sm)] border border-border bg-white px-3 py-2.5 text-left text-sm font-semibold text-foreground transition hover:border-info/30 hover:bg-info-soft/50"
              >
                {item}
                <BookOpenCheck className="h-4 w-4 text-muted" />
              </button>
            ))}
          </div>
        </Card>
        <Card className="p-5">
          <p className="eyebrow">Smart alerts</p>
          <div className="mt-4 space-y-3 text-sm">
            <div className="rounded-[var(--radius-sm)] border border-warning/20 bg-warning-soft px-3 py-2 text-warning">
              7 missing cells need review before HOD approval.
            </div>
            <div className="rounded-[var(--radius-sm)] border border-info/20 bg-info-soft px-3 py-2 text-info">
              Science practical mean is 6.2 points above historical trend.
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function MarksEntryGrid({
  fields,
  initialRows,
  saveState,
  setSaveState,
  submissionState,
  onSubmitForApproval,
}: {
  fields: ExamScoreField[];
  initialRows: ExamMarkRow[];
  saveState: SaveState;
  setSaveState: (state: SaveState) => void;
  submissionState: SubmissionState;
  onSubmitForApproval: () => void;
}) {
  const [rows, setRows] = useState(initialRows);
  const [searchTerm, setSearchTerm] = useState("");
  const [density, setDensity] = useState<"comfortable" | "compact">("compact");
  const inputRefs = useRef(new Map<string, HTMLInputElement>());

  useEffect(() => {
    if (saveState !== "saving") {
      return;
    }

    const timer = window.setTimeout(() => setSaveState("synced"), 120);
    return () => window.clearTimeout(timer);
  }, [saveState, setSaveState]);

  const filteredRows = useMemo(() => {
    const normalized = searchTerm.trim().toLowerCase();

    if (!normalized) {
      return rows;
    }

    return rows.filter((row) =>
      [row.student, row.admissionNumber, row.stream].some((value) =>
        value.toLowerCase().includes(normalized),
      ),
    );
  }, [rows, searchTerm]);

  const marksSummary = useMemo(() => calculateMarksSummary(rows, fields), [rows, fields]);
  const marksLocked = submissionState === "submitted";

  function focusCell(rowIndex: number, fieldIndex: number) {
    const nextRow = filteredRows[rowIndex];
    const nextField = fields[fieldIndex];

    if (!nextRow || !nextField) {
      return;
    }

    inputRefs.current.get(getCellKey(nextRow.id, nextField.id))?.focus();
  }

  function handleScoreChange(rowId: string, fieldId: ExamScoreFieldId, value: string) {
    setRows((currentRows) =>
      currentRows.map((row) =>
        row.id === rowId
          ? {
              ...row,
              scores: {
                ...row.scores,
                [fieldId]: value,
              },
            }
          : row,
      ),
    );
    setSaveState("saving");
  }

  function handleCellKeyDown(
    event: KeyboardEvent<HTMLInputElement>,
    rowIndex: number,
    fieldIndex: number,
  ) {
    if (event.key === "Enter" || event.key === "ArrowDown") {
      event.preventDefault();
      focusCell(rowIndex + 1, fieldIndex);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      focusCell(rowIndex - 1, fieldIndex);
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      focusCell(rowIndex, fieldIndex + 1);
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusCell(rowIndex, fieldIndex - 1);
    }
  }

  function handlePaste(
    event: ClipboardEvent<HTMLInputElement>,
    startRowIndex: number,
    startFieldIndex: number,
  ) {
    const clipboardText = event.clipboardData.getData("text");

    if (!clipboardText.includes("\t") && !clipboardText.includes("\n")) {
      return;
    }

    event.preventDefault();
    const pastedRows = clipboardText
      .trimEnd()
      .split(/\r?\n/)
      .map((line) => line.split("\t"));

    setRows((currentRows) => {
      const nextRows = currentRows.map((row) => ({
        ...row,
        scores: { ...row.scores },
      }));

      pastedRows.forEach((pastedRow, rowOffset) => {
        const targetRow = filteredRows[startRowIndex + rowOffset];

        if (!targetRow) {
          return;
        }

        const target = nextRows.find((row) => row.id === targetRow.id);

        if (!target) {
          return;
        }

        pastedRow.forEach((cellValue, fieldOffset) => {
          const targetField = fields[startFieldIndex + fieldOffset];

          if (targetField) {
            target.scores[targetField.id] = cellValue.trim();
          }
        });
      });

      return nextRows;
    });
    setSaveState("saving");
  }

  function fillMissingWithMean() {
    if (marksLocked) {
      return;
    }

    const fallback = String(Math.round(marksSummary.meanScore));
    setRows((currentRows) =>
      currentRows.map((row) => ({
        ...row,
        scores: fields.reduce<Record<ExamScoreFieldId, string>>(
          (scores, field) => ({
            ...scores,
            [field.id]: scores[field.id].trim() ? scores[field.id] : fallback,
          }),
          { ...row.scores },
        ),
      })),
    );
    setSaveState("saving");
  }

  function exportMarks() {
    downloadCsvFile({
      filename: "exam-marks-grade-8-unity.csv",
      headers: ["Admission", "Student", "Class", ...fields.map((field) => field.label), "Status"],
      rows: rows.map((row) => [
        row.admissionNumber,
        row.student,
        row.stream,
        ...fields.map((field) => row.scores[field.id]),
        row.status,
      ]),
    });
  }

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border px-5 py-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="eyebrow">Results entry</p>
            <h3 className="mt-2 section-title text-lg">Spreadsheet marks entry</h3>
            <p className="mt-1 text-[13px] leading-5 text-muted">
              Grade 8 Unity, Mathematics department view with live validation and class intelligence.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={fillMissingWithMean} disabled={marksLocked}>
              <Wand2 className="h-3.5 w-3.5" />
              Fill blanks
            </Button>
            <Button variant="secondary" size="sm" onClick={exportMarks}>
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Export
            </Button>
            <Button
              size="sm"
              onClick={onSubmitForApproval}
              disabled={marksLocked}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              {marksLocked ? "Submitted to HOD" : "Submit to HOD"}
            </Button>
          </div>
        </div>
        <div
          aria-live="polite"
          className={`mt-4 rounded-[var(--radius-sm)] border px-4 py-3 text-sm font-semibold ${
            submissionState === "submitted"
              ? "border-info/20 bg-info-soft text-info"
              : submissionState === "reopened"
                ? "border-warning/20 bg-warning-soft text-warning"
                : "border-border bg-surface-muted text-muted-strong"
          }`}
        >
          {getSubmissionMessage(submissionState)}
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(220px,1fr)_auto]">
          <label className="flex min-w-0 items-center gap-2 rounded-[var(--radius-sm)] border border-border bg-surface-muted px-3 py-2">
            <Search className="h-4 w-4 text-muted" />
            <span className="sr-only">Search marks table</span>
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
              placeholder="Search learner, admission, or stream"
              type="search"
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill
              label={saveState === "synced" ? "Autosaved just now" : getSaveLabel(saveState)}
              tone={saveState === "saving" ? "pending" : "synced"}
            />
            {saveState !== "synced" ? (
              <span className="rounded-full bg-surface px-2.5 py-1 text-[11px] font-semibold text-muted-strong">
                Last checkpoint: Autosaved just now
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => setDensity((current) => (current === "compact" ? "comfortable" : "compact"))}
              className="rounded-[var(--radius-sm)] border border-border bg-white px-3 py-2 text-[12px] font-semibold text-muted-strong transition hover:bg-surface-strong"
            >
              {density === "compact" ? "Compact density" : "Comfort density"}
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-0 border-b border-border bg-surface-muted md:grid-cols-4">
        {[
          ["Live average", `${marksSummary.meanScore}%`],
          ["Valid scores", String(marksSummary.validScores)],
          ["Missing cells", String(marksSummary.missingScores)],
          ["Outlier checks", String(marksSummary.invalidScores + rows.filter((row) => row.status === "Outlier").length)],
        ].map(([label, value]) => (
          <div key={label} className="border-b border-border px-4 py-3 md:border-b-0 md:border-r last:md:border-r-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{label}</p>
            <p className="mt-1 text-lg font-bold text-foreground">{value}</p>
          </div>
        ))}
      </div>

      <div className="max-h-[560px] overflow-auto">
        <table className="min-w-[980px] border-collapse">
          <thead>
            <tr className="bg-white">
              <th className="sticky left-0 top-0 z-30 w-[128px] border-b border-r border-border bg-white px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
                Admission
              </th>
              <th className="sticky left-[128px] top-0 z-30 w-[220px] border-b border-r border-border bg-white px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
                Student
              </th>
              {fields.map((field) => (
                <th
                  key={field.id}
                  className="sticky top-0 z-20 min-w-[148px] border-b border-r border-border bg-white px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted"
                >
                  {field.shortLabel}
                  <span className="ml-1 font-medium text-muted">/{field.maxScore}</span>
                </th>
              ))}
              <th className="sticky top-0 z-20 min-w-[136px] border-b border-border bg-white px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row, rowIndex) => {
              const rowValidation = getRowValidation(row, fields);

              return (
                <tr key={row.id} className="group border-b border-border/60 hover:bg-info-soft/30">
                  <td className="sticky left-0 z-10 border-r border-border bg-white px-3 py-3 text-[13px] font-semibold text-muted-strong group-hover:bg-info-soft/80">
                    {row.admissionNumber}
                  </td>
                  <td className="sticky left-[128px] z-10 border-r border-border bg-white px-3 py-3 group-hover:bg-info-soft/80">
                    <p className="text-sm font-semibold text-foreground">{row.student}</p>
                    <p className="text-[12px] text-muted">{row.stream}</p>
                  </td>
                  {fields.map((field, fieldIndex) => {
                    const value = row.scores[field.id];
                    const validation = validateExamScore(value, field.maxScore);

                    return (
                      <td
                        key={field.id}
                        className={`${density === "compact" ? "px-2 py-2" : "px-3 py-3"} border-r border-border align-top`}
                      >
                        <input
                          ref={(node) => {
                            const key = getCellKey(row.id, field.id);

                            if (node) {
                              inputRefs.current.set(key, node);
                            } else {
                              inputRefs.current.delete(key);
                            }
                          }}
                          aria-label={`${row.student} ${field.label} score`}
                          inputMode="decimal"
                          disabled={marksLocked}
                          value={value}
                          onChange={(event) => handleScoreChange(row.id, field.id, event.target.value)}
                          onKeyDown={(event) => handleCellKeyDown(event, rowIndex, fieldIndex)}
                          onPaste={(event) => handlePaste(event, rowIndex, fieldIndex)}
                          className={`h-9 w-full rounded-[var(--radius-xs)] border px-2 text-sm font-semibold tabular-nums outline-none transition focus:border-info focus:bg-white focus:shadow-[0_0_0_3px_rgba(37,99,235,0.12)] ${
                            validation.valid
                              ? "border-border bg-surface-muted text-foreground"
                              : validation.tone === "critical"
                                ? "border-danger/40 bg-danger-soft/70 text-danger"
                                : "border-warning/40 bg-warning-soft text-warning"
                          }`}
                        />
                        {!validation.valid ? (
                          <p className="mt-1 text-[11px] font-semibold text-danger">
                            {validation.message}
                          </p>
                        ) : null}
                      </td>
                    );
                  })}
                  <td className="px-3 py-3 align-top">
                    <StatusPill
                      label={rowValidation ? (rowValidation.tone === "critical" ? "Invalid score" : "Needs score") : row.status}
                      tone={rowValidation?.tone ?? statusToneMap[row.status]}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3 border-t border-border px-5 py-4 text-[13px] text-muted md:flex-row md:items-center md:justify-between">
        <p>
          Showing {filteredRows.length} learners from a virtualized-ready exam grid. Large classes keep
          frozen learner columns and sticky headers.
        </p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(marksSummary.distribution).map(([grade, count]) => (
            <span key={grade} className="badge badge-neutral">
              {grade} {count}
            </span>
          ))}
        </div>
      </div>
    </Card>
  );
}

function ExamSetupPanel({
  setup,
}: {
  setup: ExamSetupItem[];
}) {
  return (
    <Card className="p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="eyebrow">Exam setup</p>
          <h3 className="mt-2 section-title text-lg">Exam setup</h3>
          <p className="mt-1 max-w-3xl text-[13px] leading-5 text-muted">
            Plan the exam window, assessment configuration, grade boundaries, and readiness checks before teachers enter marks.
          </p>
        </div>
        <Button variant="secondary" size="sm">
          <BookOpenCheck className="h-3.5 w-3.5" />
          Edit configuration
        </Button>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {setup.map((item) => (
          <div key={item.id} className="rounded-[var(--radius-sm)] border border-border bg-surface-muted px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{item.label}</p>
              <StatusPill label={item.tone === "ok" ? "Ready" : "Check"} tone={item.tone} compact />
            </div>
            <p className="mt-2 text-lg font-bold text-foreground">{item.value}</p>
            <p className="mt-1 text-[13px] leading-5 text-muted">{item.helper}</p>
          </div>
        ))}
      </div>
      <div className="mt-5 rounded-[var(--radius-sm)] border border-info/20 bg-info-soft px-4 py-3">
        <p className="text-sm font-semibold text-info">Assessment configuration</p>
        <p className="mt-1 text-[13px] leading-5 text-muted-strong">
          Subject weights, maximum marks, CBC competency evidence, remark rules, and report-card templates share one versioned configuration.
        </p>
      </div>
    </Card>
  );
}

function AllocationPanel({
  allocations,
}: {
  allocations: ExamAllocationRow[];
}) {
  const allocationColumns: Array<DataTableColumn<ExamAllocationRow>> = [
    { id: "class", header: "Class", render: (row) => row.className },
    { id: "subject", header: "Subject", render: (row) => row.subject },
    { id: "teacher", header: "Teacher assignment", render: (row) => row.teacher },
    { id: "reviewer", header: "Reviewer", render: (row) => row.reviewer },
    { id: "learners", header: "Learners", render: (row) => row.learners },
    { id: "status", header: "Status", render: (row) => <StatusPill label={row.status} tone={row.tone} /> },
  ];

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
      <DataTable
        title="Subject allocation"
        subtitle="Subject allocation, teacher assignment, reviewer ownership, and learner counts stay visible before marks entry."
        columns={allocationColumns}
        rows={allocations}
        getRowKey={(row) => row.id}
      />
      <Card className="p-5">
        <Users className="h-5 w-5 text-info" />
        <h3 className="mt-3 text-base font-semibold text-foreground">Teacher assignment</h3>
        <p className="mt-2 text-sm leading-6 text-muted">
          Teachers only see assigned subjects and classes. HOD reviewers can reopen submitted sheets with reasons and timestamps.
        </p>
        <div className="mt-4 space-y-2 text-[13px] text-muted-strong">
          <p className="rounded-[var(--radius-sm)] bg-surface-muted px-3 py-2">3 active departments</p>
          <p className="rounded-[var(--radius-sm)] bg-surface-muted px-3 py-2">136 learners covered</p>
          <p className="rounded-[var(--radius-sm)] bg-surface-muted px-3 py-2">No cross-tenant allocations</p>
        </div>
      </Card>
    </div>
  );
}

function BulkUploadPanel() {
  const uploadChecks: Array<[string, string, StatusTone]> = [
    ["Template match", "Grade 8 Unity template recognized", "ok"],
    ["Duplicate guard", "2 duplicate admission numbers blocked", "warning"],
    ["Tenant boundary", "Upload scoped to Baraka Academy only", "ok"],
    ["Partial recovery", "Last interrupted import can resume", "ok"],
  ];

  return (
    <Card className="p-5">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <p className="eyebrow">Bulk results upload</p>
          <h3 className="mt-2 section-title text-lg">Spreadsheet import with pre-flight checks</h3>
          <div className="mt-5 rounded-[var(--radius)] border border-dashed border-info/30 bg-info-soft/40 px-5 py-8 text-center">
            <Upload className="mx-auto h-8 w-8 text-info" />
            <p className="mt-3 text-sm font-semibold text-foreground">Drop Excel or CSV result sheets here</p>
            <p className="mt-1 text-[13px] text-muted">The import validates subjects, max marks, learners, duplicates, and CBC rules before writing records.</p>
            <Button className="mt-4" variant="secondary">
              Select file
            </Button>
          </div>
        </div>
        <div className="space-y-3">
          {uploadChecks.map(([title, detail, tone]) => (
            <div key={title} className="rounded-[var(--radius-sm)] border border-border bg-surface-muted px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-foreground">{title}</p>
                <StatusPill label={tone === "ok" ? "Ready" : "Check"} tone={tone} />
              </div>
              <p className="mt-1 text-[13px] leading-5 text-muted">{detail}</p>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function ModerationPanel({
  queues,
}: {
  queues: ReturnType<typeof buildExamsModuleData>["queues"];
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-3">
      {queues.map((queue) => (
        <Card key={queue.id} className="p-5">
          <div className="flex items-start justify-between gap-3">
            <span className={`inline-flex h-10 w-10 items-center justify-center rounded-[var(--radius-sm)] border ${toneClasses[queue.tone]}`}>
              <ShieldCheck className="h-4 w-4" />
            </span>
            <StatusPill label={queue.value} tone={queue.tone} />
          </div>
          <h3 className="mt-4 text-base font-semibold text-foreground">{queue.title}</h3>
          <p className="mt-2 text-sm leading-6 text-muted">{queue.subtitle}</p>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-strong">
            <div className="h-full rounded-full bg-info" style={{ width: `${queue.progress}%` }} />
          </div>
          <Button className="mt-4" variant="secondary" size="sm">
            Open moderation
          </Button>
        </Card>
      ))}
    </div>
  );
}

function ApprovalPanel({
  approvals,
  submissionState,
  reopenReason,
  onReopen,
}: {
  approvals: ApprovalStep[];
  submissionState: SubmissionState;
  reopenReason: string;
  onReopen: (reason: string) => void;
}) {
  const [showReopenForm, setShowReopenForm] = useState(false);
  const [reason, setReason] = useState("");

  function handleReopen() {
    const trimmedReason = reason.trim();

    if (!trimmedReason) {
      return;
    }

    onReopen(trimmedReason);
    setReason("");
    setShowReopenForm(false);
  }

  return (
    <Card className="p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="eyebrow">Approval workflow</p>
          <h3 className="mt-2 section-title text-lg">Teacher to publishing governance</h3>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setShowReopenForm((current) => !current)}
        >
          Reopen with reason
        </Button>
      </div>
      <div
        aria-live="polite"
        className={`mt-5 rounded-[var(--radius-sm)] border px-4 py-3 text-sm font-semibold ${
          submissionState === "submitted"
            ? "border-info/20 bg-info-soft text-info"
            : submissionState === "reopened"
              ? "border-warning/20 bg-warning-soft text-warning"
              : "border-border bg-surface-muted text-muted-strong"
        }`}
      >
        {getSubmissionMessage(submissionState)}
        {reopenReason ? (
          <p className="mt-1 text-[13px] font-normal leading-5">
            Reopen reason: {reopenReason}
          </p>
        ) : null}
      </div>
      {showReopenForm ? (
        <div className="mt-4 rounded-[var(--radius-sm)] border border-border bg-surface-muted p-4">
          <label className="space-y-2 text-sm text-foreground">
            <span className="font-semibold">Reopening reason</span>
            <textarea
              aria-label="Reopening reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="input-base min-h-24"
              placeholder="Explain why marks need to be reopened before approval."
            />
          </label>
          <div className="mt-3 flex justify-end">
            <Button
              size="sm"
              onClick={handleReopen}
              disabled={!reason.trim()}
            >
              Reopen marks
            </Button>
          </div>
        </div>
      ) : null}
      <div className="mt-5 grid gap-4 xl:grid-cols-4">
        {approvals.map((step, index) => (
          <div key={step.id} className="relative rounded-[var(--radius-sm)] border border-border bg-surface-muted px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm font-bold text-foreground">
                {index + 1}
              </span>
              <StatusPill label={step.status} tone={step.tone} />
            </div>
            <h4 className="mt-4 text-sm font-semibold text-foreground">{step.role}</h4>
            <p className="mt-1 text-[13px] text-muted">{step.owner}</p>
            <p className="mt-3 text-[13px] leading-5 text-muted">{step.note}</p>
            <p className="mt-3 text-[12px] font-semibold text-muted-strong">{step.timestamp}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ReportCardsPanel({
  reports,
}: {
  reports: ReportCardBatch[];
}) {
  const columns: DataTableColumn<ReportCardBatch>[] = [
    { id: "className", header: "Class", render: (row) => <span className="font-semibold">{row.className}</span> },
    { id: "template", header: "Template", render: (row) => row.template },
    { id: "ready", header: "Ready", render: (row) => `${row.ready}/${row.total}` },
    { id: "status", header: "Status", render: (row) => <StatusPill label={row.status} tone={row.tone} /> },
  ];

  function printReports() {
    openPrintDocument({
      eyebrow: "Exam report cards",
      title: "Report card generation summary",
      subtitle: "Current report batches ready for parent-friendly PDF generation.",
      rows: reports.map((report) => ({
        label: report.className,
        value: `${report.ready}/${report.total} ${report.status}`,
      })),
      footer: "Generated from the Exams & Results command center.",
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <Button onClick={printReports}>
          <FileDown className="h-4 w-4" />
          Batch generate PDF
        </Button>
        <Button variant="secondary">
          <Users className="h-4 w-4" />
          Parent portal preview
        </Button>
      </div>
      <DataTable
        title="Report card batches"
        subtitle="Print-ready, parent-friendly reports with CBC evidence and historical comparison."
        columns={columns}
        rows={reports}
        getRowKey={(row) => row.id}
      />
    </div>
  );
}

function CompetenciesPanel({
  competencies,
}: {
  competencies: CbcCompetencyRow[];
}) {
  const columns: DataTableColumn<CbcCompetencyRow>[] = [
    { id: "competency", header: "Competency", render: (row) => <span className="font-semibold">{row.competency}</span> },
    { id: "coverage", header: "Coverage", render: (row) => row.coverage },
    { id: "evidence", header: "Evidence", render: (row) => row.evidence },
    { id: "status", header: "Status", render: (row) => <StatusPill label={row.status} tone={row.tone} /> },
  ];

  return (
    <DataTable
      title="CBC competency coverage"
      subtitle="Evidence, coverage, and rule checks for CBC-aligned assessments."
      columns={columns}
      rows={competencies}
      getRowKey={(row) => row.id}
    />
  );
}

function AnalyticsPanel({
  analysis,
  history,
}: {
  analysis: ExamAnalysisItem[];
  history: HistoricalResult[];
}) {
  const historyColumns: DataTableColumn<HistoricalResult>[] = [
    { id: "exam", header: "Exam", render: (row) => <span className="font-semibold">{row.exam}</span> },
    { id: "mean", header: "Mean", render: (row) => row.mean },
    { id: "topSubject", header: "Top subject", render: (row) => row.topSubject },
    { id: "riskSignal", header: "Risk signal", render: (row) => row.riskSignal },
  ];

  return (
    <div className="space-y-5">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {analysis.map((item) => (
          <Card key={item.id} className="p-5">
            <div className="flex items-center justify-between gap-3">
              <BarChart3 className="h-5 w-5 text-info" />
              <StatusPill label={item.tone === "ok" ? "Healthy" : "Watch"} tone={item.tone} />
            </div>
            <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
              {item.label}
            </p>
            <p className="mt-2 text-2xl font-bold text-foreground">{item.value}</p>
            <p className="mt-2 text-[13px] leading-5 text-muted">{item.helper}</p>
          </Card>
        ))}
      </section>
      <DataTable
        title="Historical results"
        subtitle="Simple trend reading across recent exams."
        columns={historyColumns}
        rows={history}
        getRowKey={(row) => row.id}
      />
    </div>
  );
}

function PublishingHistoryPanel({
  publishing,
  history,
}: {
  publishing: ExamPublishingItem[];
  history: HistoricalResult[];
}) {
  const historyColumns: DataTableColumn<HistoricalResult>[] = [
    { id: "exam", header: "Exam", render: (row) => <span className="font-semibold">{row.exam}</span> },
    { id: "mean", header: "Mean", render: (row) => row.mean },
    { id: "topSubject", header: "Top subject", render: (row) => row.topSubject },
    { id: "riskSignal", header: "Risk signal", render: (row) => row.riskSignal },
  ];

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="eyebrow">Publishing</p>
            <h3 className="mt-2 section-title text-lg">Exam publishing</h3>
            <p className="mt-1 max-w-3xl text-[13px] leading-5 text-muted">
              Release reports to parents only after approvals, PDF generation, portal visibility, and immutable result locking are ready.
            </p>
          </div>
          <Button size="sm">
            <ShieldCheck className="h-3.5 w-3.5" />
            Publish controls
          </Button>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {publishing.map((item) => (
            <div key={item.id} className="rounded-[var(--radius-sm)] border border-border bg-surface-muted px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-foreground">{item.label}</p>
                <StatusPill label={item.value} tone={item.tone} />
              </div>
              <p className="mt-2 text-[13px] leading-5 text-muted">{item.helper}</p>
            </div>
          ))}
        </div>
      </Card>
      <DataTable
        title="Historical results"
        subtitle="Protected historical records stay readable for trend comparison without allowing published-result edits."
        columns={historyColumns}
        rows={history}
        getRowKey={(row) => row.id}
      />
    </div>
  );
}

function ResultLockingPanel() {
  const [locked, setLocked] = useState(false);

  return (
    <Card className="p-5">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <p className="eyebrow">Publishing and locks</p>
          <h3 className="mt-2 section-title text-lg">Controlled publishing with immutable result records</h3>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {[
              ["Publish preview", "Parent portal hidden until principal approval"],
              ["Lock state", locked ? "Current exam results are locked" : "Current exam results are open"],
              ["Conflict handling", "Concurrent edits create reviewable versions"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-[var(--radius-sm)] border border-border bg-surface-muted px-4 py-3">
                <p className="text-sm font-semibold text-foreground">{label}</p>
                <p className="mt-1 text-[13px] leading-5 text-muted">{value}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-[var(--radius)] border border-border bg-surface-muted p-4">
          <LockKeyhole className="h-6 w-6 text-info" />
          <p className="mt-4 text-sm font-semibold text-foreground">Principal publishing control</p>
          <p className="mt-2 text-[13px] leading-5 text-muted">
            Published results become immutable. Reopening requires a controlled reason and audit entry.
          </p>
          <Button className="mt-4" onClick={() => setLocked(true)} block>
            Lock and publish
          </Button>
        </div>
      </div>
    </Card>
  );
}

function AuditPanel({
  audit,
}: {
  audit: ExamAuditEntry[];
}) {
  const columns: DataTableColumn<ExamAuditEntry>[] = [
    { id: "actor", header: "Actor", render: (row) => <span className="font-semibold">{row.actor}</span> },
    { id: "action", header: "Action", render: (row) => row.action },
    { id: "scope", header: "Scope", render: (row) => row.scope },
    { id: "time", header: "Time", render: (row) => row.time },
    { id: "detail", header: "Detail", render: (row) => row.detail },
  ];

  return (
    <DataTable
      title="Audit log"
      subtitle="Every edit, approval, rejection, lock, reopen, and publishing event is traceable."
      columns={columns}
      rows={audit}
      getRowKey={(row) => row.id}
    />
  );
}

export function ExamsModuleScreen({
  role,
  schoolName,
}: {
  role: SchoolExperienceRole;
  schoolName: string;
}) {
  const data = useMemo(() => buildExamsModuleData({ role, schoolName }), [role, schoolName]);
  const [saveState, setSaveState] = useState<SaveState>("synced");
  const [submissionState, setSubmissionState] = useState<SubmissionState>("draft");
  const [reopenReason, setReopenReason] = useState("");

  function submitForApproval() {
    setSubmissionState("submitted");
    setReopenReason("");
    setSaveState("synced");
  }

  function reopenMarks(reason: string) {
    setSubmissionState("reopened");
    setReopenReason(reason);
    setSaveState("synced");
  }

  return (
    <div className="space-y-6">
      <PageIntro
        schoolName={data.schoolName}
        currentExam={data.currentExam}
        currentClass={data.currentClass}
        saveState={saveState}
      />
      <MetricStrip metrics={data.metrics} />
      <Tabs
        defaultTab="marks"
        items={[
          {
            id: "dashboard",
            label: "Dashboard",
            panel: <DashboardPanel data={data} />,
          },
          {
            id: "setup",
            label: "Setup",
            panel: <ExamSetupPanel setup={data.setup} />,
          },
          {
            id: "allocation",
            label: "Allocation",
            panel: <AllocationPanel allocations={data.allocations} />,
          },
          {
            id: "marks",
            label: "Marks entry",
            panel: (
              <MarksEntryGrid
                fields={data.fields}
                initialRows={data.marks}
                saveState={saveState}
                setSaveState={setSaveState}
                submissionState={submissionState}
                onSubmitForApproval={submitForApproval}
              />
            ),
          },
          {
            id: "bulk",
            label: "Bulk upload",
            panel: <BulkUploadPanel />,
          },
          {
            id: "moderation",
            label: "Moderation",
            panel: <ModerationPanel queues={data.queues} />,
          },
          {
            id: "approval",
            label: "Approval pipeline",
            panel: (
              <ApprovalPanel
                approvals={data.approvals}
                submissionState={submissionState}
                reopenReason={reopenReason}
                onReopen={reopenMarks}
              />
            ),
          },
          {
            id: "reports",
            label: "Report cards",
            panel: <ReportCardsPanel reports={data.reports} />,
          },
          {
            id: "competencies",
            label: "CBC competencies",
            panel: <CompetenciesPanel competencies={data.competencies} />,
          },
          {
            id: "analytics",
            label: "Analytics",
            panel: <AnalyticsPanel analysis={data.analysis} history={data.history} />,
          },
          {
            id: "publishing",
            label: "Publishing & history",
            panel: <PublishingHistoryPanel publishing={data.publishing} history={data.history} />,
          },
          {
            id: "locking",
            label: "Result locking",
            panel: <ResultLockingPanel />,
          },
          {
            id: "audit",
            label: "Audit trail",
            panel: <AuditPanel audit={data.audit} />,
          },
        ]}
      />
      <section className="grid gap-4 md:grid-cols-3">
        {[
          {
            icon: FileSpreadsheet,
            title: "Keyboard-first table system",
            value: "Arrow, enter, tab, paste, sticky headers, frozen learner columns",
          },
          {
            icon: History,
            title: "Recovery and versions",
            value: "Autosave checkpoints, local draft recovery, controlled reopen history",
          },
          {
            icon: ShieldCheck,
            title: "Academic integrity",
            value: "Tenant isolation, role scoping, immutable publishing, complete edit history",
          },
        ].map((item) => {
          const Icon = item.icon;

          return (
            <Card key={item.title} className="p-5">
              <Icon className="h-5 w-5 text-info" />
              <h3 className="mt-4 text-sm font-semibold text-foreground">{item.title}</h3>
              <p className="mt-2 text-[13px] leading-5 text-muted">{item.value}</p>
            </Card>
          );
        })}
      </section>
    </div>
  );
}

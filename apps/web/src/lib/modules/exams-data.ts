import type { StatusTone } from "@/lib/dashboard/types";
import type { SchoolExperienceRole } from "@/lib/experiences/types";

export type ExamScoreFieldId = "mathematics" | "english" | "science" | "kiswahili";

export interface ExamScoreField {
  id: ExamScoreFieldId;
  label: string;
  shortLabel: string;
  maxScore: number;
}

export interface ExamMetric {
  id: string;
  label: string;
  value: string;
  helper: string;
  tone: StatusTone;
}

export interface ExamQueueItem {
  id: string;
  title: string;
  subtitle: string;
  value: string;
  tone: StatusTone;
  progress: number;
}

export interface ExamMarkRow {
  id: string;
  admissionNumber: string;
  student: string;
  stream: string;
  gender: string;
  scores: Record<ExamScoreFieldId, string>;
  competency: "EE" | "ME" | "AE" | "BE";
  status: "Clean" | "Missing" | "Review" | "Outlier";
}

export interface ApprovalStep {
  id: string;
  role: string;
  owner: string;
  status: "Complete" | "Active" | "Waiting" | "Rejected";
  timestamp: string;
  note: string;
  tone: StatusTone;
}

export interface ReportCardBatch {
  id: string;
  className: string;
  template: string;
  ready: number;
  total: number;
  status: string;
  tone: StatusTone;
}

export interface ExamAnalysisItem {
  id: string;
  label: string;
  value: string;
  helper: string;
  tone: StatusTone;
}

export interface ExamAuditEntry {
  id: string;
  actor: string;
  action: string;
  scope: string;
  time: string;
  detail: string;
  tone: StatusTone;
}

export interface CbcCompetencyRow {
  id: string;
  competency: string;
  coverage: string;
  status: string;
  evidence: string;
  tone: StatusTone;
}

export interface HistoricalResult {
  id: string;
  exam: string;
  mean: string;
  topSubject: string;
  riskSignal: string;
}

export interface ExamSetupItem {
  id: string;
  label: string;
  value: string;
  helper: string;
  tone: StatusTone;
}

export interface ExamAllocationRow {
  id: string;
  className: string;
  subject: string;
  teacher: string;
  reviewer: string;
  learners: number;
  status: string;
  tone: StatusTone;
}

export interface ExamPublishingItem {
  id: string;
  label: string;
  value: string;
  helper: string;
  tone: StatusTone;
}

export interface ExamsModuleData {
  schoolName: string;
  role: SchoolExperienceRole;
  currentExam: string;
  currentClass: string;
  setup: ExamSetupItem[];
  allocations: ExamAllocationRow[];
  publishing: ExamPublishingItem[];
  metrics: ExamMetric[];
  queues: ExamQueueItem[];
  fields: ExamScoreField[];
  marks: ExamMarkRow[];
  approvals: ApprovalStep[];
  reports: ReportCardBatch[];
  analysis: ExamAnalysisItem[];
  competencies: CbcCompetencyRow[];
  history: HistoricalResult[];
  audit: ExamAuditEntry[];
}

export interface ScoreValidation {
  valid: boolean;
  message: string;
  tone: StatusTone;
}

export interface MarksSummary {
  meanScore: number;
  validScores: number;
  missingScores: number;
  invalidScores: number;
  distribution: Record<"EE" | "ME" | "AE" | "BE", number>;
}

export const examScoreFields: ExamScoreField[] = [
  { id: "mathematics", label: "Mathematics", shortLabel: "Maths", maxScore: 100 },
  { id: "english", label: "English", shortLabel: "Eng", maxScore: 100 },
  { id: "science", label: "Science & Technology", shortLabel: "Sci", maxScore: 100 },
  { id: "kiswahili", label: "Kiswahili", shortLabel: "Kis", maxScore: 100 },
];

const baseMarks: ExamMarkRow[] = [
  {
    id: "mark-001",
    admissionNumber: "ADM-2025-001",
    student: "Aisha Njeri",
    stream: "Grade 8 Unity",
    gender: "F",
    scores: { mathematics: "84", english: "79", science: "82", kiswahili: "76" },
    competency: "EE",
    status: "Clean",
  },
  {
    id: "mark-002",
    admissionNumber: "ADM-2025-002",
    student: "Brian Otieno",
    stream: "Grade 8 Unity",
    gender: "M",
    scores: { mathematics: "69", english: "74", science: "71", kiswahili: "68" },
    competency: "ME",
    status: "Review",
  },
  {
    id: "mark-003",
    admissionNumber: "ADM-2025-003",
    student: "Carol Wanjiku",
    stream: "Grade 8 Unity",
    gender: "F",
    scores: { mathematics: "78", english: "82", science: "80", kiswahili: "77" },
    competency: "EE",
    status: "Clean",
  },
  {
    id: "mark-004",
    admissionNumber: "ADM-2025-004",
    student: "Daniel Mutua",
    stream: "Grade 8 Unity",
    gender: "M",
    scores: { mathematics: "72", english: "66", science: "68", kiswahili: "" },
    competency: "AE",
    status: "Missing",
  },
  {
    id: "mark-005",
    admissionNumber: "ADM-2025-005",
    student: "Eunice Achieng",
    stream: "Grade 8 Unity",
    gender: "F",
    scores: { mathematics: "91", english: "88", science: "86", kiswahili: "84" },
    competency: "EE",
    status: "Outlier",
  },
  {
    id: "mark-006",
    admissionNumber: "ADM-2025-006",
    student: "Farhan Ali",
    stream: "Grade 8 Unity",
    gender: "M",
    scores: { mathematics: "58", english: "63", science: "61", kiswahili: "59" },
    competency: "AE",
    status: "Review",
  },
  {
    id: "mark-007",
    admissionNumber: "ADM-2025-007",
    student: "Grace Muthoni",
    stream: "Grade 8 Unity",
    gender: "F",
    scores: { mathematics: "80", english: "76", science: "79", kiswahili: "72" },
    competency: "ME",
    status: "Clean",
  },
  {
    id: "mark-008",
    admissionNumber: "ADM-2025-008",
    student: "Hassan Mwangi",
    stream: "Grade 8 Unity",
    gender: "M",
    scores: { mathematics: "64", english: "70", science: "67", kiswahili: "65" },
    competency: "ME",
    status: "Clean",
  },
];

function cloneMarks() {
  return baseMarks.map((row) => ({
    ...row,
    scores: { ...row.scores },
  }));
}

export function validateExamScore(value: string, maxScore: number): ScoreValidation {
  const trimmed = value.trim();

  if (!trimmed) {
    return {
      valid: false,
      message: "Missing score",
      tone: "warning",
    };
  }

  const score = Number(trimmed);

  if (!Number.isFinite(score)) {
    return {
      valid: false,
      message: "Use numbers only",
      tone: "critical",
    };
  }

  if (score < 0) {
    return {
      valid: false,
      message: "Score cannot be negative",
      tone: "critical",
    };
  }

  if (score > maxScore) {
    return {
      valid: false,
      message: `Above max ${maxScore}`,
      tone: "critical",
    };
  }

  return {
    valid: true,
    message: "Saved",
    tone: "ok",
  };
}

export function getGradeBand(score: number): "EE" | "ME" | "AE" | "BE" {
  if (score >= 80) {
    return "EE";
  }

  if (score >= 65) {
    return "ME";
  }

  if (score >= 50) {
    return "AE";
  }

  return "BE";
}

export function calculateMarksSummary(rows: ExamMarkRow[], fields = examScoreFields): MarksSummary {
  const distribution: MarksSummary["distribution"] = {
    EE: 0,
    ME: 0,
    AE: 0,
    BE: 0,
  };
  let total = 0;
  let validScores = 0;
  let missingScores = 0;
  let invalidScores = 0;

  rows.forEach((row) => {
    fields.forEach((field) => {
      const value = row.scores[field.id];
      const validation = validateExamScore(value, field.maxScore);

      if (!value.trim()) {
        missingScores += 1;
        return;
      }

      if (!validation.valid) {
        invalidScores += 1;
        return;
      }

      const score = Number(value);
      total += score;
      validScores += 1;
      distribution[getGradeBand(score)] += 1;
    });
  });

  return {
    meanScore: validScores > 0 ? Math.round((total / validScores) * 10) / 10 : 0,
    validScores,
    missingScores,
    invalidScores,
    distribution,
  };
}

export function buildExamsModuleData({
  role,
  schoolName,
}: {
  role: SchoolExperienceRole;
  schoolName: string;
}): ExamsModuleData {
  const leadershipTone: StatusTone = role === "teacher" ? "warning" : "ok";

  return {
    schoolName,
    role,
    currentExam: "Term 2 Mid-term CAT",
    currentClass: "Grade 8 Unity",
    setup: [
      {
        id: "setup-window",
        label: "Exam window",
        value: "17-21 June",
        helper: "Active timetable with controlled late-entry cut-off",
        tone: "ok",
      },
      {
        id: "setup-assessment",
        label: "Assessment configuration",
        value: "CAT 30% + End-term 70%",
        helper: "CBC remarks, subject weights, and grade boundaries are versioned",
        tone: "ok",
      },
      {
        id: "setup-boundaries",
        label: "Grade boundaries",
        value: "EE 80, ME 65, AE 50",
        helper: "Shared across report cards, analytics, and teacher entry checks",
        tone: "ok",
      },
      {
        id: "setup-risk",
        label: "Operational readiness",
        value: "7 checks open",
        helper: "Missing marks, moderation samples, and approval owners need attention",
        tone: "warning",
      },
    ],
    allocations: [
      {
        id: "alloc-maths",
        className: "Grade 8 Unity",
        subject: "Mathematics",
        teacher: "Beatrice Wanjiku",
        reviewer: "Mr. Kiptoo",
        learners: 46,
        status: "Entry open",
        tone: "warning",
      },
      {
        id: "alloc-english",
        className: "Grade 7 Hope",
        subject: "English",
        teacher: "Esther Mwende",
        reviewer: "HOD Languages",
        learners: 51,
        status: "Submitted",
        tone: "ok",
      },
      {
        id: "alloc-science",
        className: "Grade 9 Courage",
        subject: "Integrated Science",
        teacher: "Peter Ochieng",
        reviewer: "HOD STEM",
        learners: 39,
        status: "Moderation",
        tone: "warning",
      },
    ],
    publishing: [
      {
        id: "publish-principal",
        label: "Principal approval",
        value: "Waiting",
        helper: "Publishing opens after HOD and deputy timestamps are complete",
        tone: "warning",
      },
      {
        id: "publish-portal",
        label: "Parent portal release",
        value: "Scheduled",
        helper: "SMS and portal visibility stay off until immutable lock",
        tone: "warning",
      },
      {
        id: "publish-pdf",
        label: "Report PDFs",
        value: "127 ready",
        helper: "Batch generation queue is warm for print day",
        tone: "ok",
      },
    ],
    metrics: [
      {
        id: "pending-marks",
        label: "Pending marks entry",
        value: "18",
        helper: "Cells still open across assigned subjects",
        tone: "warning",
      },
      {
        id: "awaiting-submission",
        label: "Classes awaiting submission",
        value: "4",
        helper: "Teacher handoff due before 4:00 PM",
        tone: "warning",
      },
      {
        id: "submission-progress",
        label: "Submission progress",
        value: "82%",
        helper: "Across active mid-term exam books",
        tone: "ok",
      },
      {
        id: "approval-status",
        label: "Approval status",
        value: role === "teacher" ? "HOD review" : "Deputy review",
        helper: "Teacher to principal workflow is active",
        tone: leadershipTone,
      },
      {
        id: "missing-alerts",
        label: "Missing marks alerts",
        value: "7",
        helper: "Smart checks found empty or abnormal cells",
        tone: "warning",
      },
    ],
    queues: [
      {
        id: "queue-maths",
        title: "Grade 8 Unity - Mathematics",
        subtitle: "3 missing marks, 1 outlier, autosave healthy",
        value: "92%",
        tone: "warning",
        progress: 92,
      },
      {
        id: "queue-english",
        title: "Grade 7 Hope - English",
        subtitle: "Submitted by Ms. Mwende, waiting HOD approval",
        value: "HOD",
        tone: "ok",
        progress: 100,
      },
      {
        id: "queue-science",
        title: "Grade 9 Courage - Integrated Science",
        subtitle: "Moderation requested for practical score spread",
        value: "Review",
        tone: "warning",
        progress: 76,
      },
    ],
    fields: examScoreFields,
    marks: cloneMarks(),
    approvals: [
      {
        id: "approval-teacher",
        role: "Teacher",
        owner: "Beatrice Wanjiku",
        status: "Complete",
        timestamp: "Today, 10:18 AM",
        note: "Marks submitted with two teacher comments pending.",
        tone: "ok",
      },
      {
        id: "approval-hod",
        role: "HOD",
        owner: "Mr. Kiptoo",
        status: "Active",
        timestamp: "Due 12:30 PM",
        note: "Checking missing marks and subject mean movement.",
        tone: "warning",
      },
      {
        id: "approval-deputy",
        role: "Deputy Principal",
        owner: "Mercy Gathoni",
        status: "Waiting",
        timestamp: "After HOD",
        note: "Receives locked submission after department review.",
        tone: "warning",
      },
      {
        id: "approval-principal",
        role: "Principal",
        owner: "Grace Njeri",
        status: "Waiting",
        timestamp: "Before publishing",
        note: "Final publish authority with immutable result lock.",
        tone: "warning",
      },
    ],
    reports: [
      {
        id: "report-grade-8",
        className: "Grade 8 Unity",
        template: "Premium CBC report card",
        ready: 42,
        total: 46,
        status: "Review comments",
        tone: "warning",
      },
      {
        id: "report-grade-7",
        className: "Grade 7 Hope",
        template: "Parent-friendly term report",
        ready: 51,
        total: 51,
        status: "Print ready",
        tone: "ok",
      },
      {
        id: "report-grade-9",
        className: "Grade 9 Courage",
        template: "CBC transition report",
        ready: 34,
        total: 39,
        status: "Moderation",
        tone: "warning",
      },
    ],
    analysis: [
      {
        id: "mean-movement",
        label: "Mean score",
        value: "73.8",
        helper: "+2.4 from previous CAT",
        tone: "ok",
      },
      {
        id: "grade-spread",
        label: "Grade distribution",
        value: "38% EE",
        helper: "Top band is rising in Maths and English",
        tone: "ok",
      },
      {
        id: "risk-indicator",
        label: "Risk indicators",
        value: "11 learners",
        helper: "Below 50 in at least two subjects",
        tone: "warning",
      },
      {
        id: "teacher-analysis",
        label: "Teacher analysis",
        value: "4 queues",
        helper: "Submission speed is healthy across departments",
        tone: "ok",
      },
    ],
    competencies: [
      {
        id: "cbc-communication",
        competency: "Communication and collaboration",
        coverage: "94%",
        status: "Evidence complete",
        evidence: "Project notes, oral rubric, peer task",
        tone: "ok",
      },
      {
        id: "cbc-critical-thinking",
        competency: "Critical thinking and problem solving",
        coverage: "88%",
        status: "Needs HOD sample",
        evidence: "Maths reasoning rubric and Science practical",
        tone: "warning",
      },
      {
        id: "cbc-digital",
        competency: "Digital literacy",
        coverage: "72%",
        status: "Teacher follow-up",
        evidence: "Lab activity score pending for 9 learners",
        tone: "warning",
      },
    ],
    history: [
      {
        id: "hist-1",
        exam: "Term 1 End-term",
        mean: "71.4",
        topSubject: "English",
        riskSignal: "13 learners below target",
      },
      {
        id: "hist-2",
        exam: "Term 1 CAT 2",
        mean: "69.8",
        topSubject: "Mathematics",
        riskSignal: "Science practical dip",
      },
      {
        id: "hist-3",
        exam: "2025 End-year",
        mean: "68.6",
        topSubject: "Kiswahili",
        riskSignal: "Grade 7 transition gap",
      },
    ],
    audit: [
      {
        id: "audit-1",
        actor: "Beatrice Wanjiku",
        action: "Edited mark",
        scope: "Grade 8 Unity - Mathematics",
        time: "Today, 10:16 AM",
        detail: "Aisha Njeri score changed from 82 to 84 with autosave checkpoint.",
        tone: "ok",
      },
      {
        id: "audit-2",
        actor: "Mr. Kiptoo",
        action: "Requested moderation",
        scope: "Integrated Science practical",
        time: "Today, 09:42 AM",
        detail: "Outlier spread flagged before HOD approval.",
        tone: "warning",
      },
      {
        id: "audit-3",
        actor: "Grace Njeri",
        action: "Locked previous results",
        scope: "Term 1 End-term",
        time: "Yesterday, 04:30 PM",
        detail: "Published records made immutable after parent portal release.",
        tone: "ok",
      },
    ],
  };
}

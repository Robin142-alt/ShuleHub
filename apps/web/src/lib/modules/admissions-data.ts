import { formatCurrency } from "@/lib/dashboard/format";
import type { DashboardRole, StatusTone } from "@/lib/dashboard/types";

export interface ModuleShellSectionData {
  id: string;
  label: string;
  description: string;
  badge?: string;
  tone?: StatusTone;
}

export interface StatStripDataItem {
  id: string;
  label: string;
  value: string;
  helper: string;
  tone?: StatusTone;
}

export type AdmissionsSectionId =
  | "dashboard"
  | "applications"
  | "new-registration"
  | "student-directory"
  | "parent-information"
  | "documents"
  | "class-allocation"
  | "transfers"
  | "reports";

export type ApplicationStatus =
  | "pending"
  | "interview"
  | "approved"
  | "rejected"
  | "registered";

export type DocumentVerificationStatus = "pending" | "verified" | "rejected" | "missing";
export type AllocationStatus = "pending" | "assigned";
export type TransferDirection = "incoming" | "outgoing";

export interface AdmissionApplication {
  id: string;
  applicationNumber: string;
  applicantName: string;
  admissionNumber: string;
  classApplying: string;
  parentName: string;
  parentPhone: string;
  status: ApplicationStatus;
  dateApplied: string;
  gender: string;
  dateOfBirth: string;
  birthCertificateNumber: string;
  nationality: string;
  previousSchool: string;
  kcpeResults: string;
  cbcLevel: string;
  parentEmail: string;
  occupation: string;
  relationship: string;
  allergies: string;
  conditions: string;
  emergencyContact: string;
  reviewNote: string;
}

export interface StudentDirectoryEntry {
  id: string;
  fullName: string;
  admissionNumber: string;
  className: string;
  streamName: string;
  parentName: string;
  parentPhone: string;
  status: "registered" | "pending_allocation";
  registrationDate: string;
}

export interface ParentDirectoryEntry {
  id: string;
  parentName: string;
  phone: string;
  email: string;
  occupation: string;
  relationship: string;
  learners: string;
}

export interface AdmissionsDocument {
  id: string;
  learnerName: string;
  documentType: string;
  fileName: string;
  uploadedOn: string;
  verificationStatus: DocumentVerificationStatus;
  ownerType: "application" | "student";
  applicationId?: string;
  applicationNumber?: string;
  studentId?: string;
  admissionNumber?: string;
}

export interface ClassAllocation {
  id: string;
  studentId: string;
  studentName: string;
  admissionNumber: string;
  className: string;
  streamName: string;
  dormitoryName: string;
  transportRoute: string;
  effectiveFrom: string;
  status: AllocationStatus;
}

export interface AdmissionsTransfer {
  id: string;
  learnerName: string;
  admissionNumber: string;
  direction: TransferDirection;
  schoolName: string;
  reason: string;
  requestedOn: string;
  status: "pending" | "completed";
}

export interface StudentFeesLine {
  id: string;
  item: string;
  amount: number;
  status: "posted" | "pending";
}

export interface StudentAcademicLine {
  id: string;
  subject: string;
  value: string;
  note: string;
}

export interface StudentDisciplineLine {
  id: string;
  date: string;
  entry: string;
  status: string;
}

export interface StudentProfileDocument {
  id: string;
  documentType: string;
  fileName: string;
  uploadedOn: string;
  verificationStatus: DocumentVerificationStatus;
}

export interface AdmissionsStudentProfile {
  id: string;
  fullName: string;
  admissionNumber: string;
  className: string;
  streamName: string;
  dormitoryName: string;
  transportRoute: string;
  gender: string;
  dateOfBirth: string;
  nationality: string;
  parentName: string;
  parentPhone: string;
  parentEmail: string;
  occupation: string;
  relationship: string;
  previousSchool: string;
  kcpeResults: string;
  cbcLevel: string;
  registrationDate: string;
  applicationStatus: ApplicationStatus;
  feesBalance: number;
  lastPayment: string;
  billingPlan: string;
  portalAccessStatus: "active" | "invited" | "not_invited";
  portalAccessDetail: string;
  allergies: string;
  conditions: string;
  emergencyContact: string;
  academics: StudentAcademicLine[];
  discipline: StudentDisciplineLine[];
  fees: StudentFeesLine[];
  documents: StudentProfileDocument[];
}

export interface AdmissionsReportCard {
  id: string;
  title: string;
  description: string;
  filename: string;
  serverExportId?: string;
  headers: string[];
  rows: string[][];
}

export interface AdmissionsSearchItem {
  id: string;
  label: string;
  description: string;
  href: string;
  kind: "student";
}

export interface AdmissionsDataset {
  applications: AdmissionApplication[];
  students: StudentDirectoryEntry[];
  parents: ParentDirectoryEntry[];
  documents: AdmissionsDocument[];
  allocations: ClassAllocation[];
  transfers: AdmissionsTransfer[];
  studentProfiles: AdmissionsStudentProfile[];
}

export interface AdmissionsTransportOptions {
  transportEnabled?: boolean;
}

export function createAdmissionsDataset(): AdmissionsDataset {
  return {
    applications: [],
    students: [],
    parents: [],
    documents: [],
    allocations: [],
    transfers: [],
    studentProfiles: [],
  };
}

export function buildAdmissionsModuleSections(
  data: AdmissionsDataset,
  options: AdmissionsTransportOptions = {},
): ModuleShellSectionData[] {
  const pendingApplications = data.applications.filter((item) => item.status === "pending").length;
  const missingDocs = data.documents.filter((item) => item.verificationStatus === "missing").length;
  const pendingAllocations = data.allocations.filter((item) => item.status === "pending").length;
  const transportEnabled = options.transportEnabled === true;

  return [
    {
      id: "dashboard",
      label: "Admissions Dashboard",
      description: "Approvals, missing files, and daily front-office pressure.",
    },
    {
      id: "applications",
      label: "Applications",
      description: "Review status, parent contact, and admission readiness.",
      badge: `${data.applications.length}`,
    },
    {
      id: "new-registration",
      label: "New Registration",
      description: "Capture personal, academic, guardian, medical, and file data.",
    },
    {
      id: "student-directory",
      label: "Student Directory",
      description: "Registered learners and profile records from admissions.",
      badge: `${data.students.length}`,
    },
    {
      id: "parent-information",
      label: "Parent Information",
      description: "Guardian contacts, occupation, relationship, and learner links.",
      badge: `${data.parents.length}`,
    },
    {
      id: "documents",
      label: "Documents",
      description: "Uploaded files, missing items, and verification status.",
      badge: `${missingDocs} missing`,
      tone: missingDocs > 0 ? "critical" : "ok",
    },
    {
      id: "class-allocation",
      label: "Class Allocation",
      description: transportEnabled
        ? "Class, stream, dormitory, and route assignment."
        : "Class, stream, and dormitory assignment.",
      badge: `${pendingAllocations} pending`,
      tone: pendingAllocations > 0 ? "warning" : "ok",
    },
    {
      id: "transfers",
      label: "Transfers",
      description: "Incoming, outgoing, and historical transfer control.",
      badge: `${data.transfers.length}`,
    },
    {
      id: "reports",
      label: "Reports",
      description: "Application mix, document compliance, and allocation completion.",
      badge: `${pendingApplications} queue`,
      tone: pendingApplications > 0 ? "warning" : "ok",
    },
  ];
}

export function buildAdmissionsStatStrip(data: AdmissionsDataset): StatStripDataItem[] {
  const newApplications = data.applications.length;
  const approvedStudents = data.applications.filter((item) => item.status === "approved").length;
  const pendingReview = data.applications.filter(
    (item) => item.status === "pending" || item.status === "interview",
  ).length;
  const totalRegistered = data.students.length;

  return [
    {
      id: "new-applications",
      label: "New Applications",
      value: `${newApplications}`,
      helper: "Applications opened in the current admissions cycle.",
    },
    {
      id: "approved-students",
      label: "Approved Students",
      value: `${approvedStudents}`,
      helper: "Learners cleared for registration but not yet fully onboarded.",
      tone: approvedStudents > 0 ? "warning" : "ok",
    },
    {
      id: "pending-review",
      label: "Pending Review",
      value: `${pendingReview}`,
      helper: "Files waiting for interview, verification, or office action.",
      tone: pendingReview > 0 ? "warning" : "ok",
    },
    {
      id: "total-registered",
      label: "Total Registered",
      value: `${totalRegistered}`,
      helper: "Learners created into the student directory from this workflow.",
    },
  ];
}

export function getApplicationTone(status: ApplicationStatus): StatusTone {
  if (status === "rejected") {
    return "critical";
  }

  if (status === "pending" || status === "interview" || status === "approved") {
    return "warning";
  }

  return "ok";
}

export function formatApplicationStatus(status: ApplicationStatus) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function formatDocumentStatus(status: DocumentVerificationStatus) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function getDocumentTone(status: DocumentVerificationStatus): StatusTone {
  if (status === "missing" || status === "rejected") {
    return "critical";
  }

  if (status === "pending") {
    return "warning";
  }

  return "ok";
}

export function formatAllocationStatus(status: AllocationStatus) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function getAllocationTone(status: AllocationStatus): StatusTone {
  return status === "pending" ? "warning" : "ok";
}

export function formatTransferDirection(direction: TransferDirection) {
  return direction.charAt(0).toUpperCase() + direction.slice(1);
}

export function getTransferTone(status: "pending" | "completed"): StatusTone {
  return status === "pending" ? "warning" : "ok";
}

export function buildAdmissionsTrend(): Array<{
  id: string;
  label: string;
  applications: number;
  registered: number;
}> {
  return [];
}

export function buildAdmissionsReports(
  data: AdmissionsDataset,
  options: AdmissionsTransportOptions = {},
): AdmissionsReportCard[] {
  const transportEnabled = options.transportEnabled === true;
  const applicationsRows = data.applications.map((application) => [
    application.applicantName,
    application.applicationNumber,
    application.classApplying,
    application.parentPhone,
    formatApplicationStatus(application.status),
  ]);

  const documentsRows = data.documents.map((document) => [
    document.learnerName,
    document.documentType,
    document.fileName,
    document.uploadedOn,
    formatDocumentStatus(document.verificationStatus),
  ]);

  const allocationRows = data.allocations.map((allocation) =>
    transportEnabled
      ? [
          allocation.studentName,
          allocation.className,
          allocation.streamName,
          allocation.dormitoryName,
          allocation.transportRoute,
          formatAllocationStatus(allocation.status),
        ]
      : [
          allocation.studentName,
          allocation.className,
          allocation.streamName,
          allocation.dormitoryName,
          formatAllocationStatus(allocation.status),
        ],
  );

  const transferRows = data.transfers.map((transfer) => [
    transfer.learnerName,
    transfer.admissionNumber,
    formatTransferDirection(transfer.direction),
    transfer.schoolName,
    transfer.requestedOn,
    transfer.status,
  ]);

  return [
    {
      id: "report-applications",
      title: "Applications register",
      description: "Applicant status mix and parent contact register.",
      filename: "admissions-applications.csv",
      serverExportId: "applications",
      headers: ["Applicant", "Application No", "Class", "Parent Phone", "Status"],
      rows: applicationsRows,
    },
    {
      id: "report-documents",
      title: "Document compliance",
      description: "Uploaded and missing admissions document trail.",
      filename: "admissions-documents.csv",
      serverExportId: "documents",
      headers: ["Learner", "Document", "File", "Uploaded On", "Verification"],
      rows: documentsRows,
    },
    {
      id: "report-allocations",
      title: "Allocation report",
      description: transportEnabled
        ? "Class, stream, boarding, and route allocation posture."
        : "Class, stream, and boarding allocation posture.",
      filename: "admissions-allocations.csv",
      serverExportId: "allocations",
      headers: transportEnabled
        ? ["Student", "Class", "Stream", "Dormitory", "Route", "Status"]
        : ["Student", "Class", "Stream", "Dormitory", "Status"],
      rows: allocationRows,
    },
    {
      id: "report-transfers",
      title: "Transfer history",
      description: "Incoming and outgoing transfer operational history.",
      filename: "admissions-transfers.csv",
      serverExportId: "transfers",
      headers: ["Learner", "Admission No", "Direction", "School", "Date", "Status"],
      rows: transferRows,
    },
  ];
}

export function buildAdmissionsSearchItems(role: DashboardRole): AdmissionsSearchItem[] {
  void role;
  return [];
}

export function buildFeesSummary(balance: number) {
  return formatCurrency(balance, false);
}

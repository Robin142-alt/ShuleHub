"use client";

import { startTransition, useDeferredValue, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCheck,
  FileUp,
  GraduationCap,
  RefreshCcw,
  UserPlus,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { FormSection } from "@/components/modules/shared/form-section";
import { ModuleShell } from "@/components/modules/shared/module-shell";
import { OpsTable, type OpsTableColumn } from "@/components/modules/shared/ops-table";
import { StatStrip } from "@/components/modules/shared/stat-strip";
import { WorkflowCard } from "@/components/modules/shared/workflow-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { StatusPill } from "@/components/ui/status-pill";
import { Tabs } from "@/components/ui/tabs";
import { useLiveTenantSession } from "@/hooks/use-live-tenant-session";
import { downloadCsvFile, downloadTextFile } from "@/lib/dashboard/export";
import type { DashboardRole, DashboardSnapshot } from "@/lib/dashboard/types";
import { formatCurrency } from "@/lib/dashboard/format";
import {
  buildAdmissionsModuleSections,
  buildAdmissionsReports,
  buildAdmissionsStatStrip,
  buildAdmissionsTrend,
  buildFeesSummary,
  createAdmissionsDataset,
  formatAllocationStatus,
  formatApplicationStatus,
  formatDocumentStatus,
  formatTransferDirection,
  getAllocationTone,
  getApplicationTone,
  getDocumentTone,
  getTransferTone,
  type AdmissionApplication,
  type AdmissionsDataset,
  type AdmissionsDocument,
  type AdmissionsReportCard,
  type AdmissionsSectionId,
  type AdmissionsStudentProfile,
  type AdmissionsTransfer,
  type ApplicationStatus,
  type ClassAllocation,
  type ParentDirectoryEntry,
  type StudentAcademicLine,
  type StudentDirectoryEntry,
} from "@/lib/modules/admissions-data";
import {
  advanceAdmissionsStudentAcademicLifecycleLive,
  buildAdmissionDocumentUploads,
  buildAdmissionRegistrationSummary,
  createAdmissionApplicationLive,
  createAdmissionsAllocationLive,
  createAdmissionsTransferLive,
  fetchAdmissionsDatasetLive,
  fetchAdmissionsReportExportLive,
  fetchAdmissionsStudentProfileLive,
  mapAdmissionsStudentProfileFromLive,
  registerAdmissionApplicationLive,
  updateAdmissionApplicationLive,
  updateAdmissionDocumentVerificationLive,
  uploadAdmissionDocumentLive,
  type AdmissionRegistrationSummary,
} from "@/lib/modules/admissions-live";

const admissionsSectionIds: AdmissionsSectionId[] = [
  "dashboard",
  "applications",
  "new-registration",
  "student-directory",
  "parent-information",
  "documents",
  "class-allocation",
  "transfers",
  "reports",
];

const fieldClassName =
  "w-full rounded-xl border border-border bg-surface-muted px-4 py-3 text-sm outline-none transition duration-150 focus:border-accent/40 focus:bg-surface";
const textAreaClassName = `${fieldClassName} min-h-[110px] resize-y`;

type RegistrationFormState = {
  fullName: string;
  dateOfBirth: string;
  gender: string;
  birthCertificateNumber: string;
  nationality: string;
  previousSchool: string;
  kcpeResults: string;
  cbcLevel: string;
  className: string;
  parentName: string;
  parentPhone: string;
  parentEmail: string;
  occupation: string;
  relationship: string;
  allergies: string;
  conditions: string;
  emergencyContact: string;
  birthCertificateFile: string;
  birthCertificateUpload: File | null;
  passportPhotoFile: string;
  passportPhotoUpload: File | null;
  reportFormsFile: string;
  reportFormsUpload: File | null;
};

type AllocationFormState = {
  studentId: string;
  className: string;
  streamName: string;
  dormitoryName: string;
  transportRoute: string;
};

type TransferFormState = {
  learnerName: string;
  admissionNumber: string;
  direction: "incoming" | "outgoing";
  schoolName: string;
  reason: string;
};

type DocumentUploadFormState = {
  applicationId: string;
  documentType: string;
  fileName: string;
  file: File | null;
  sourceDocumentId: string;
};

const admissionsDocumentTypes = [
  "Birth certificate",
  "Passport photo",
  "Previous report forms",
  "Transfer letter",
  "Medical form",
  "Parent/guardian ID",
];

function isAdmissionsSectionId(value: string | null): value is AdmissionsSectionId {
  return admissionsSectionIds.includes((value ?? "") as AdmissionsSectionId);
}

function FieldWrapper({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-2">
      <span className="text-sm font-semibold text-foreground">{label}</span>
      {children}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </label>
  );
}

function createEmptyRegistrationForm(): RegistrationFormState {
  return {
    fullName: "",
    dateOfBirth: "",
    gender: "",
    birthCertificateNumber: "",
    nationality: "Kenyan",
    previousSchool: "",
    kcpeResults: "",
    cbcLevel: "",
    className: "",
    parentName: "",
    parentPhone: "",
    parentEmail: "",
    occupation: "",
    relationship: "",
    allergies: "",
    conditions: "",
    emergencyContact: "",
    birthCertificateFile: "",
    birthCertificateUpload: null,
    passportPhotoFile: "",
    passportPhotoUpload: null,
    reportFormsFile: "",
    reportFormsUpload: null,
  };
}

function createEmptyAllocationForm(): AllocationFormState {
  return {
    studentId: "",
    className: "",
    streamName: "",
    dormitoryName: "",
    transportRoute: "",
  };
}

function createEmptyTransferForm(): TransferFormState {
  return {
    learnerName: "",
    admissionNumber: "",
    direction: "incoming",
    schoolName: "",
    reason: "",
  };
}

function createEmptyDocumentUploadForm(): DocumentUploadFormState {
  return {
    applicationId: "",
    documentType: "",
    fileName: "",
    file: null,
    sourceDocumentId: "",
  };
}

function createEmptyAdmissionsDataset(): AdmissionsDataset {
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

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function todayCompactDate() {
  return todayIsoDate().replaceAll("-", "");
}

function buildNextApplicationNumber(currentLength: number) {
  return `APP-${todayCompactDate()}-${String(currentLength + 1).padStart(3, "0")}`;
}

function buildAdmissionNumber(className: string, currentLength: number) {
  const classCode = className
    .replace(/[^a-z0-9]+/gi, "")
    .slice(0, 3)
    .toUpperCase();
  return `ADM-${classCode || "SCH"}-${String(currentLength + 49).padStart(3, "0")}`;
}

function buildNextClassName(className: string) {
  const gradeMatch = className.match(/^Grade\s+(\d+)$/i);

  if (gradeMatch) {
    return `Grade ${Number(gradeMatch[1]) + 1}`;
  }

  return className;
}

export function AdmissionsModuleScreen({
  role: _role,
  snapshot,
}: {
  role: DashboardRole;
  snapshot: DashboardSnapshot;
  online: boolean;
}) {
  void _role;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeSection = isAdmissionsSectionId(searchParams.get("view"))
    ? (searchParams.get("view") as AdmissionsSectionId)
    : "dashboard";
  const selectedStudentId = searchParams.get("student");

  const queryClient = useQueryClient();
  const liveSession = useLiveTenantSession(snapshot.tenant.id);
  const transportEnabled = snapshot.tenant.transportEnabled === true;
  const [localDataset, setLocalDataset] = useState<AdmissionsDataset>(() => createAdmissionsDataset());
  const [applicationSearch, setApplicationSearch] = useState("");
  const [applicationStatusFilter, setApplicationStatusFilter] = useState("all");
  const [directorySearch, setDirectorySearch] = useState("");
  const [documentSearch, setDocumentSearch] = useState("");
  const [documentStatusFilter, setDocumentStatusFilter] = useState("all");
  const [parentSearch, setParentSearch] = useState("");
  const [documentUploadModalOpen, setDocumentUploadModalOpen] = useState(false);
  const [documentUploadForm, setDocumentUploadForm] = useState<DocumentUploadFormState>(
    createEmptyDocumentUploadForm,
  );
  const [documentUploadErrors, setDocumentUploadErrors] = useState<
    Partial<Record<keyof DocumentUploadFormState, string>>
  >({});
  const [isSavingDocumentUpload, setIsSavingDocumentUpload] = useState(false);
  const [allocationModalOpen, setAllocationModalOpen] = useState(false);
  const [allocationForm, setAllocationForm] = useState<AllocationFormState>(createEmptyAllocationForm);
  const [allocationErrors, setAllocationErrors] = useState<
    Partial<Record<keyof AllocationFormState, string>>
  >({});
  const [isSavingAllocation, setIsSavingAllocation] = useState(false);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [transferForm, setTransferForm] = useState<TransferFormState>(createEmptyTransferForm);
  const [transferErrors, setTransferErrors] = useState<
    Partial<Record<keyof TransferFormState, string>>
  >({});
  const [isSavingTransfer, setIsSavingTransfer] = useState(false);
  const [registrationForm, setRegistrationForm] = useState<RegistrationFormState>(
    createEmptyRegistrationForm,
  );
  const [registrationErrors, setRegistrationErrors] = useState<
    Partial<Record<keyof RegistrationFormState, string>>
  >({});
  const [isSavingRegistration, setIsSavingRegistration] = useState(false);
  const [activeActionId, setActiveActionId] = useState<string | null>(null);
  const [moduleError, setModuleError] = useState<string | null>(null);
  const [registrationSummary, setRegistrationSummary] = useState<AdmissionRegistrationSummary | null>(null);
  const [academicLifecycleMessage, setAcademicLifecycleMessage] = useState<string | null>(null);
  const [isSavingAcademicLifecycle, setIsSavingAcademicLifecycle] = useState(false);

  const liveAdmissionsQuery = useQuery({
    queryKey: ["admissions-module", liveSession.session?.tenantId],
    queryFn: () => fetchAdmissionsDatasetLive(liveSession.session!),
    enabled: Boolean(liveSession.session),
    placeholderData: (previous) => previous,
  });
  const isLiveMode = Boolean(liveSession.session);
  const dataset = isLiveMode
    ? (liveAdmissionsQuery.data ?? createEmptyAdmissionsDataset())
    : localDataset;
  const isDatasetLoading = isLiveMode && liveAdmissionsQuery.isLoading;

  const deferredApplicationSearch = useDeferredValue(applicationSearch);
  const filteredApplications = dataset.applications
    .filter((application) => {
      const term = deferredApplicationSearch.trim().toLowerCase();
      if (!term) {
        return true;
      }

      return [
        application.applicantName,
        application.applicationNumber,
        application.classApplying,
        application.parentPhone,
      ].some((value) => value.toLowerCase().includes(term));
    })
    .filter((application) => applicationStatusFilter === "all" || application.status === applicationStatusFilter);

  const deferredDirectorySearch = useDeferredValue(directorySearch);
  const filteredStudents = dataset.students.filter((student) => {
    const term = deferredDirectorySearch.trim().toLowerCase();
    if (!term) {
      return true;
    }

    return [student.fullName, student.admissionNumber, student.parentPhone].some((value) =>
      value.toLowerCase().includes(term),
    );
  });

  const filteredParents = dataset.parents.filter((parent) => {
    const term = parentSearch.trim().toLowerCase();
    if (!term) {
      return true;
    }

    return [parent.parentName, parent.phone, parent.email, parent.learners].some((value) =>
      value.toLowerCase().includes(term),
    );
  });

  const deferredDocumentSearch = useDeferredValue(documentSearch);
  const filteredDocuments = dataset.documents
    .filter((document) => {
      const term = deferredDocumentSearch.trim().toLowerCase();
      if (!term) {
        return true;
      }

      return [
        document.learnerName,
        document.documentType,
        document.fileName,
        document.applicationNumber ?? "",
        document.admissionNumber ?? "",
      ].some((value) => value.toLowerCase().includes(term));
    })
    .filter((document) => documentStatusFilter === "all" || document.verificationStatus === documentStatusFilter);

  const selectedStudentKey = selectedStudentId ?? dataset.students[0]?.id ?? null;
  const selectedStudentProfileQuery = useQuery({
    queryKey: ["admissions-student-profile", liveSession.session?.tenantId, selectedStudentKey],
    queryFn: async () => {
      const response = await fetchAdmissionsStudentProfileLive(
        liveSession.session!,
        selectedStudentKey!,
      );
      return mapAdmissionsStudentProfileFromLive(response);
    },
    enabled: Boolean(isLiveMode && liveSession.session && selectedStudentKey),
    placeholderData: (previous) => previous,
  });
  const selectedStudentProfile = isLiveMode
    ? (selectedStudentProfileQuery.data
      ?? dataset.studentProfiles.find((profile) => profile.id === selectedStudentKey)
      ?? null)
    : (dataset.studentProfiles.find((profile) => profile.id === selectedStudentId)
      ?? dataset.studentProfiles[0]
      ?? null);
  const isSelectedStudentProfileSyncing =
    isLiveMode && Boolean(selectedStudentKey) && selectedStudentProfileQuery.isFetching;
  const reports = buildAdmissionsReports(dataset, { transportEnabled });
  const sections = buildAdmissionsModuleSections(dataset, { transportEnabled });
  const trend = buildAdmissionsTrend();

  async function exportAdmissionsReport(report: AdmissionsReportCard) {
    setModuleError(null);

    if (isLiveMode && liveSession.session && report.serverExportId) {
      setActiveActionId(`${report.id}-export`);

      try {
        const artifact = await fetchAdmissionsReportExportLive(
          liveSession.session,
          report.serverExportId,
        );
        downloadTextFile({
          filename: artifact.filename,
          content: artifact.csv,
          mimeType: artifact.content_type,
        });
      } catch (error) {
        setModuleError(
          error instanceof Error
            ? error.message
            : "Unable to export the admissions report.",
        );
      } finally {
        setActiveActionId(null);
      }

      return;
    }

    downloadCsvFile({
      filename: report.filename,
      headers: report.headers,
      rows: report.rows,
    });
  }

  async function refreshLiveAdmissionsData() {
    await queryClient.invalidateQueries({
      queryKey: ["admissions-module", liveSession.session?.tenantId],
    });
    await queryClient.invalidateQueries({
      queryKey: ["admissions-student-profile", liveSession.session?.tenantId, selectedStudentKey],
    });
  }

  function updateSection(sectionId: AdmissionsSectionId, extra?: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("view", sectionId);

    if (extra) {
      Object.entries(extra).forEach(([key, value]) => {
        if (value) {
          next.set(key, value);
        } else {
          next.delete(key);
        }
      });
    }

    startTransition(() => {
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    });
  }

  function openStudentProfile(studentId: string) {
    updateSection("student-directory", { student: studentId });
  }

  async function changeApplicationStatus(applicationId: string, nextStatus: ApplicationStatus) {
    setActiveActionId(`${applicationId}-${nextStatus}`);
    setModuleError(null);

    try {
      if (isLiveMode && liveSession.session) {
        await updateAdmissionApplicationLive(liveSession.session, applicationId, {
          status: nextStatus,
          review_notes:
            nextStatus === "approved"
              ? "Ready for registration."
              : undefined,
        });
        await refreshLiveAdmissionsData();
      } else {
        await new Promise((resolve) => window.setTimeout(resolve, 350));
        setLocalDataset((current) => ({
          ...current,
          applications: current.applications.map((application) =>
            application.id === applicationId ? { ...application, status: nextStatus } : application,
          ),
        }));
      }
    } catch (error) {
      setModuleError(error instanceof Error ? error.message : "Unable to update the application status.");
    } finally {
      setActiveActionId(null);
    }
  }

  async function registerApplication(application: AdmissionApplication) {
    setActiveActionId(`${application.id}-register`);
    setModuleError(null);
    setRegistrationSummary(null);

    try {
      const admissionNumber =
        application.admissionNumber === "PENDING"
          ? buildAdmissionNumber(application.classApplying, dataset.students.length)
          : application.admissionNumber;

      if (isLiveMode && liveSession.session) {
        const response = await registerAdmissionApplicationLive(
          liveSession.session,
          application.id,
          {
            admission_number: admissionNumber,
            class_name: application.classApplying,
            stream_name: "Pending",
          },
        );

        setRegistrationSummary(
          buildAdmissionRegistrationSummary({
            fallback: {
              applicantName: application.applicantName,
              admissionNumber,
              className: application.classApplying,
              streamName: "Pending",
              parentEmail: application.parentEmail,
            },
            response,
          }),
        );

        await refreshLiveAdmissionsData();

        if (response.student?.id) {
          openStudentProfile(response.student.id);
        }
      } else {
        await new Promise((resolve) => window.setTimeout(resolve, 450));
        const newStudentId = `stu-${Date.now()}`;

        const student: StudentDirectoryEntry = {
          id: newStudentId,
          fullName: application.applicantName,
          admissionNumber,
          className: application.classApplying,
          streamName: "Pending",
          parentName: application.parentName,
          parentPhone: application.parentPhone,
          status: "pending_allocation",
          registrationDate: todayIsoDate(),
        };

        const parent: ParentDirectoryEntry = {
          id: `par-${Date.now()}`,
          parentName: application.parentName,
          phone: application.parentPhone,
          email: application.parentEmail,
          occupation: application.occupation,
          relationship: application.relationship,
          learners: application.applicantName,
        };

        const profile: AdmissionsStudentProfile = {
          id: newStudentId,
          fullName: application.applicantName,
          admissionNumber,
          className: application.classApplying,
          streamName: "Pending",
          dormitoryName: "Pending",
          transportRoute: "Pending",
          gender: application.gender,
          dateOfBirth: application.dateOfBirth,
          nationality: application.nationality,
          parentName: application.parentName,
          parentPhone: application.parentPhone,
          parentEmail: application.parentEmail,
          occupation: application.occupation,
          relationship: application.relationship,
          previousSchool: application.previousSchool,
          kcpeResults: application.kcpeResults,
          cbcLevel: application.cbcLevel,
          registrationDate: todayIsoDate(),
          applicationStatus: "registered",
          feesBalance: 0,
          lastPayment: "No payment posted yet",
          billingPlan: "No billing plan configured yet",
          portalAccessStatus: application.parentEmail ? "invited" : "not_invited",
          portalAccessDetail: application.parentEmail
            ? `Parent invitation prepared for ${application.parentEmail}`
            : "No parent portal invitation recorded.",
          allergies: application.allergies || "Not recorded",
          conditions: application.conditions || "Not recorded",
          emergencyContact: application.emergencyContact,
          academics: [],
          discipline: [],
          fees: [],
          documents: [
            {
              id: `doc-${Date.now()}`,
              documentType: "Birth certificate",
              fileName: "Pending verification",
              uploadedOn: todayIsoDate(),
              verificationStatus: "pending",
            },
          ],
        };

        setLocalDataset((current) => ({
          ...current,
          applications: current.applications.map((item) =>
            item.id === application.id
              ? { ...item, status: "registered", admissionNumber }
              : item,
          ),
          students: [student, ...current.students],
          parents: current.parents.some((item) => item.phone === parent.phone)
            ? current.parents
            : [parent, ...current.parents],
          allocations: [
            {
              id: `alloc-${Date.now()}`,
              studentId: newStudentId,
              studentName: application.applicantName,
              admissionNumber,
              className: application.classApplying,
              streamName: "Pending",
              dormitoryName: "Pending",
              transportRoute: "Pending",
              effectiveFrom: todayIsoDate(),
              status: "pending",
            },
            ...current.allocations,
          ],
          studentProfiles: [profile, ...current.studentProfiles],
        }));
        setRegistrationSummary(
          buildAdmissionRegistrationSummary({
            fallback: {
              applicantName: application.applicantName,
              admissionNumber,
              className: application.classApplying,
              streamName: "Pending",
              parentEmail: application.parentEmail,
            },
            response: {
              student: {
                id: newStudentId,
                admission_number: admissionNumber,
                full_name: application.applicantName,
              },
              allocation: {
                class_name: application.classApplying,
                stream_name: "Pending",
              },
              guardian_link: application.parentEmail
                ? {
                    email: application.parentEmail,
                    status: "invited",
                  }
                : null,
              application_status: "registered",
            },
          }),
        );
        openStudentProfile(newStudentId);
      }
    } catch (error) {
      setModuleError(error instanceof Error ? error.message : "Unable to register the learner.");
    } finally {
      setActiveActionId(null);
    }
  }

  async function updateDocumentStatus(documentId: string, nextStatus: AdmissionsDocument["verificationStatus"]) {
    setActiveActionId(`${documentId}-${nextStatus}`);
    setModuleError(null);

    try {
      if (isLiveMode && liveSession.session) {
        if (nextStatus !== "missing") {
          await updateAdmissionDocumentVerificationLive(liveSession.session, documentId, {
            verification_status: nextStatus,
          });
          await refreshLiveAdmissionsData();
        }
      } else {
        await new Promise((resolve) => window.setTimeout(resolve, 300));
        setLocalDataset((current) => ({
          ...current,
          documents: current.documents.map((document) =>
            document.id === documentId ? { ...document, verificationStatus: nextStatus } : document,
          ),
          studentProfiles: current.studentProfiles.map((profile) => ({
            ...profile,
            documents: profile.documents.map((document) =>
              document.id === documentId ? { ...document, verificationStatus: nextStatus } : document,
            ),
          })),
        }));
      }
    } catch (error) {
      setModuleError(error instanceof Error ? error.message : "Unable to update the document verification status.");
    } finally {
      setActiveActionId(null);
    }
  }

  function findDocumentApplication(document?: AdmissionsDocument) {
    if (!document) {
      return undefined;
    }

    return (
      dataset.applications.find((application) => application.id === document.applicationId)
      ?? dataset.applications.find(
        (application) => application.applicationNumber === document.applicationNumber,
      )
      ?? dataset.applications.find(
        (application) =>
          document.admissionNumber
          && application.admissionNumber === document.admissionNumber,
      )
      ?? dataset.applications.find(
        (application) => application.applicantName === document.learnerName,
      )
    );
  }

  function openDocumentUploadModal(document?: AdmissionsDocument) {
    const application = findDocumentApplication(document);
    const documentType =
      document?.documentType && document.documentType !== "Required admissions documents"
        ? document.documentType
        : "";

    setDocumentUploadErrors({});
    setDocumentUploadForm({
      applicationId: application?.id ?? "",
      documentType,
      fileName: "",
      file: null,
      sourceDocumentId: document?.id ?? "",
    });
    setDocumentUploadModalOpen(true);

    if (document && !application) {
      setModuleError("Select the applicant manually before uploading this document.");
    } else {
      setModuleError(null);
    }
  }

  function validateDocumentUploadForm() {
    const errors: Partial<Record<keyof DocumentUploadFormState, string>> = {};

    if (!documentUploadForm.applicationId.trim()) {
      errors.applicationId = "Applicant is required.";
    }
    if (!documentUploadForm.documentType.trim()) {
      errors.documentType = "Document type is required.";
    }
    if (!documentUploadForm.fileName.trim() || !documentUploadForm.file) {
      errors.fileName = "A PDF, image, or scanned document is required.";
    }

    setDocumentUploadErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function submitDocumentUpload() {
    if (!validateDocumentUploadForm()) {
      return;
    }

    const application = dataset.applications.find(
      (item) => item.id === documentUploadForm.applicationId,
    );

    if (!application || !documentUploadForm.file) {
      setDocumentUploadErrors((current) => ({
        ...current,
        applicationId: "Select a valid applicant before uploading.",
      }));
      return;
    }

    setIsSavingDocumentUpload(true);
    setModuleError(null);

    try {
      const documentType = documentUploadForm.documentType.trim();
      const fileName = documentUploadForm.fileName.trim();

      if (isLiveMode && liveSession.session) {
        await uploadAdmissionDocumentLive(liveSession.session, application.id, {
          document_type: documentType,
          file: documentUploadForm.file,
          file_name: fileName,
        });
        await refreshLiveAdmissionsData();
      } else {
        await new Promise((resolve) => window.setTimeout(resolve, 350));

        const uploadedDocument: AdmissionsDocument = {
          id: `doc-${Date.now()}`,
          learnerName: application.applicantName,
          documentType,
          fileName,
          uploadedOn: todayIsoDate(),
          verificationStatus: "pending",
          ownerType: application.status === "registered" ? "student" : "application",
          applicationId: application.id,
          applicationNumber: application.applicationNumber,
          admissionNumber:
            application.admissionNumber === "PENDING" || application.admissionNumber === "N/A"
              ? undefined
              : application.admissionNumber,
        };

        setLocalDataset((current) => ({
          ...current,
          documents: [
            uploadedDocument,
            ...current.documents.filter(
              (document) => document.id !== documentUploadForm.sourceDocumentId,
            ),
          ],
          studentProfiles: current.studentProfiles.map((profile) =>
            profile.admissionNumber === application.admissionNumber
            || profile.fullName === application.applicantName
              ? {
                  ...profile,
                  documents: [
                    {
                      id: uploadedDocument.id,
                      documentType: uploadedDocument.documentType,
                      fileName: uploadedDocument.fileName,
                      uploadedOn: uploadedDocument.uploadedOn,
                      verificationStatus: uploadedDocument.verificationStatus,
                    },
                    ...profile.documents.filter(
                      (document) => document.id !== documentUploadForm.sourceDocumentId,
                    ),
                  ],
                }
              : profile,
          ),
        }));
      }

      setDocumentUploadModalOpen(false);
      setDocumentUploadForm(createEmptyDocumentUploadForm());
    } catch (error) {
      setModuleError(error instanceof Error ? error.message : "Unable to upload the admissions document.");
    } finally {
      setIsSavingDocumentUpload(false);
    }
  }

  function validateAllocationForm() {
    const errors: Partial<Record<keyof AllocationFormState, string>> = {};
    if (!allocationForm.studentId.trim()) errors.studentId = "Student is required.";
    if (!allocationForm.className.trim()) errors.className = "Class is required.";
    if (!allocationForm.streamName.trim()) errors.streamName = "Stream is required.";
    if (!allocationForm.dormitoryName.trim()) errors.dormitoryName = "Dormitory is required.";
    if (transportEnabled && !allocationForm.transportRoute.trim()) {
      errors.transportRoute = "Transport route is required.";
    }

    setAllocationErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function submitAllocation() {
    if (!validateAllocationForm()) {
      return;
    }

    setIsSavingAllocation(true);
    const student = dataset.students.find((item) => item.id === allocationForm.studentId);

    if (!student) {
      setIsSavingAllocation(false);
      return;
    }

    setModuleError(null);

    try {
      const transportRoute = transportEnabled ? allocationForm.transportRoute.trim() : "";
      if (isLiveMode && liveSession.session) {
        await createAdmissionsAllocationLive(liveSession.session, student.id, {
          class_name: allocationForm.className.trim(),
          stream_name: allocationForm.streamName.trim(),
          dormitory_name: allocationForm.dormitoryName.trim(),
          ...(transportEnabled ? { transport_route: transportRoute } : {}),
        });
        await refreshLiveAdmissionsData();
      } else {
        await new Promise((resolve) => window.setTimeout(resolve, 350));
        setLocalDataset((current) => ({
          ...current,
          students: current.students.map((entry) =>
            entry.id === student.id
              ? {
                  ...entry,
                  className: allocationForm.className.trim(),
                  streamName: allocationForm.streamName.trim(),
                  status: "registered",
                }
              : entry,
          ),
          allocations: current.allocations.some((entry) => entry.studentId === student.id)
            ? current.allocations.map((entry) =>
                entry.studentId === student.id
                  ? {
                      ...entry,
                      className: allocationForm.className.trim(),
                      streamName: allocationForm.streamName.trim(),
                      dormitoryName: allocationForm.dormitoryName.trim(),
                      transportRoute,
                      status: "assigned",
                    }
                  : entry,
              )
            : [
                {
                  id: `alloc-${Date.now()}`,
                  studentId: student.id,
                  studentName: student.fullName,
                  admissionNumber: student.admissionNumber,
                  className: allocationForm.className.trim(),
                  streamName: allocationForm.streamName.trim(),
                  dormitoryName: allocationForm.dormitoryName.trim(),
                  transportRoute,
                  effectiveFrom: todayIsoDate(),
                  status: "assigned",
                },
                ...current.allocations,
              ],
          studentProfiles: current.studentProfiles.map((profile) =>
            profile.id === student.id
              ? {
                  ...profile,
                  className: allocationForm.className.trim(),
                  streamName: allocationForm.streamName.trim(),
                  dormitoryName: allocationForm.dormitoryName.trim(),
                  transportRoute,
                }
              : profile,
          ),
        }));
      }

      setAllocationModalOpen(false);
      setAllocationForm(createEmptyAllocationForm());
    } catch (error) {
      setModuleError(error instanceof Error ? error.message : "Unable to save the learner allocation.");
    } finally {
      setIsSavingAllocation(false);
    }
  }

  function validateTransferForm() {
    const errors: Partial<Record<keyof TransferFormState, string>> = {};
    if (!transferForm.learnerName.trim()) errors.learnerName = "Learner name is required.";
    if (!transferForm.admissionNumber.trim()) errors.admissionNumber = "Admission number is required.";
    if (!transferForm.schoolName.trim()) errors.schoolName = "School name is required.";
    if (!transferForm.reason.trim()) errors.reason = "Reason is required.";

    setTransferErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function submitTransfer() {
    if (!validateTransferForm()) {
      return;
    }

    setIsSavingTransfer(true);
    setModuleError(null);

    try {
      if (isLiveMode && liveSession.session) {
        const matchedStudent = dataset.students.find(
          (student) => student.admissionNumber === transferForm.admissionNumber.trim(),
        );
        const matchedApplication = dataset.applications.find(
          (application) =>
            application.applicantName === transferForm.learnerName.trim()
            || application.admissionNumber === transferForm.admissionNumber.trim(),
        );

        await createAdmissionsTransferLive(liveSession.session, {
          student_id: matchedStudent?.id,
          application_id: matchedStudent ? undefined : matchedApplication?.id,
          transfer_type: transferForm.direction,
          school_name: transferForm.schoolName.trim(),
          reason: transferForm.reason.trim(),
        });
        await refreshLiveAdmissionsData();
      } else {
        await new Promise((resolve) => window.setTimeout(resolve, 350));
        setLocalDataset((current) => ({
          ...current,
          transfers: [
            {
              id: `trn-${Date.now()}`,
              learnerName: transferForm.learnerName.trim(),
              admissionNumber: transferForm.admissionNumber.trim(),
              direction: transferForm.direction,
              schoolName: transferForm.schoolName.trim(),
              reason: transferForm.reason.trim(),
              requestedOn: todayIsoDate(),
              status: "pending",
            },
            ...current.transfers,
          ],
        }));
      }

      setTransferModalOpen(false);
      setTransferForm(createEmptyTransferForm());
    } catch (error) {
      setModuleError(error instanceof Error ? error.message : "Unable to log the transfer.");
    } finally {
      setIsSavingTransfer(false);
    }
  }

  function validateRegistrationForm() {
    const errors: Partial<Record<keyof RegistrationFormState, string>> = {};

    if (!registrationForm.fullName.trim()) errors.fullName = "Full name is required.";
    if (!registrationForm.dateOfBirth.trim()) errors.dateOfBirth = "Date of birth is required.";
    if (!registrationForm.gender.trim()) errors.gender = "Gender is required.";
    if (!registrationForm.birthCertificateNumber.trim()) {
      errors.birthCertificateNumber = "Birth certificate number is required.";
    }
    if (!registrationForm.className.trim()) errors.className = "Class is required.";
    if (!registrationForm.parentName.trim()) errors.parentName = "Parent or guardian name is required.";
    if (!registrationForm.parentPhone.trim()) errors.parentPhone = "Parent phone is required.";
    if (!registrationForm.relationship.trim()) errors.relationship = "Relationship is required.";
    if (!registrationForm.emergencyContact.trim()) errors.emergencyContact = "Emergency contact is required.";
    if (!registrationForm.birthCertificateFile.trim()) {
      errors.birthCertificateFile = "Birth certificate upload is required.";
    }
    if (!registrationForm.birthCertificateUpload) {
      errors.birthCertificateFile = "Birth certificate upload is required.";
    }
    if (!registrationForm.passportPhotoFile.trim()) {
      errors.passportPhotoFile = "Passport photo upload is required.";
    }
    if (!registrationForm.passportPhotoUpload) {
      errors.passportPhotoFile = "Passport photo upload is required.";
    }

    setRegistrationErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function submitRegistration() {
    if (!validateRegistrationForm()) {
      return;
    }

    setIsSavingRegistration(true);
    setModuleError(null);
    setRegistrationSummary(null);

    try {
      const admissionNumber = buildAdmissionNumber(registrationForm.className, dataset.students.length);

      if (isLiveMode && liveSession.session) {
        const createdApplication = await createAdmissionApplicationLive(liveSession.session, {
          full_name: registrationForm.fullName.trim(),
          date_of_birth: registrationForm.dateOfBirth,
          gender: registrationForm.gender.trim(),
          birth_certificate_number: registrationForm.birthCertificateNumber.trim(),
          nationality: registrationForm.nationality.trim(),
          previous_school: registrationForm.previousSchool.trim() || undefined,
          kcpe_results: registrationForm.kcpeResults.trim() || undefined,
          cbc_level: registrationForm.cbcLevel.trim() || undefined,
          class_applying: registrationForm.className.trim(),
          parent_name: registrationForm.parentName.trim(),
          parent_phone: registrationForm.parentPhone.trim(),
          parent_email: registrationForm.parentEmail.trim() || undefined,
          parent_occupation: registrationForm.occupation.trim() || undefined,
          relationship: registrationForm.relationship.trim(),
          allergies: registrationForm.allergies.trim() || undefined,
          conditions: registrationForm.conditions.trim() || undefined,
          emergency_contact: registrationForm.emergencyContact.trim(),
        });

        const uploads = buildAdmissionDocumentUploads({
          birthCertificateFileName: registrationForm.birthCertificateFile,
          birthCertificateFile: registrationForm.birthCertificateUpload,
          passportPhotoFileName: registrationForm.passportPhotoFile,
          passportPhotoFile: registrationForm.passportPhotoUpload,
          reportFormsFileName: registrationForm.reportFormsFile,
          reportFormsFile: registrationForm.reportFormsUpload,
        });

        for (const upload of uploads) {
          await uploadAdmissionDocumentLive(liveSession.session!, createdApplication.id, upload);
        }

        await updateAdmissionApplicationLive(liveSession.session, createdApplication.id, {
          status: "approved",
          review_notes: "Direct front-office registration completed.",
        });

        const response = await registerAdmissionApplicationLive(
          liveSession.session,
          createdApplication.id,
          {
            admission_number: admissionNumber,
            class_name: registrationForm.className.trim(),
            stream_name: "Pending",
          },
        );

        setRegistrationSummary(
          buildAdmissionRegistrationSummary({
            fallback: {
              applicantName: registrationForm.fullName.trim(),
              admissionNumber,
              className: registrationForm.className.trim(),
              streamName: "Pending",
              parentEmail: registrationForm.parentEmail.trim(),
            },
            response,
          }),
        );
        await refreshLiveAdmissionsData();
        setRegistrationForm(createEmptyRegistrationForm());
        updateSection("student-directory", { student: response.student?.id ?? null });
      } else {
        await new Promise((resolve) => window.setTimeout(resolve, 500));

        const applicationNumber = buildNextApplicationNumber(dataset.applications.length);
        const studentId = `stu-${Date.now()}`;

        const application: AdmissionApplication = {
          id: `app-${Date.now()}`,
          applicationNumber,
          applicantName: registrationForm.fullName.trim(),
          admissionNumber,
          classApplying: registrationForm.className.trim(),
          parentName: registrationForm.parentName.trim(),
          parentPhone: registrationForm.parentPhone.trim(),
          status: "registered",
          dateApplied: todayIsoDate(),
          gender: registrationForm.gender.trim(),
          dateOfBirth: registrationForm.dateOfBirth,
          birthCertificateNumber: registrationForm.birthCertificateNumber.trim(),
          nationality: registrationForm.nationality.trim(),
          previousSchool: registrationForm.previousSchool.trim() || "Not provided",
          kcpeResults: registrationForm.kcpeResults.trim() || "Not recorded",
          cbcLevel: registrationForm.cbcLevel.trim() || "Not recorded",
          parentEmail: registrationForm.parentEmail.trim(),
          occupation: registrationForm.occupation.trim(),
          relationship: registrationForm.relationship.trim(),
          allergies: registrationForm.allergies.trim(),
          conditions: registrationForm.conditions.trim(),
          emergencyContact: registrationForm.emergencyContact.trim(),
          reviewNote: "Direct front-office registration completed.",
        };

        const student: StudentDirectoryEntry = {
          id: studentId,
          fullName: application.applicantName,
          admissionNumber,
          className: registrationForm.className.trim(),
          streamName: "Pending",
          parentName: registrationForm.parentName.trim(),
          parentPhone: registrationForm.parentPhone.trim(),
          status: "pending_allocation",
          registrationDate: todayIsoDate(),
        };

        const parent: ParentDirectoryEntry = {
          id: `par-${Date.now()}`,
          parentName: registrationForm.parentName.trim(),
          phone: registrationForm.parentPhone.trim(),
          email: registrationForm.parentEmail.trim(),
          occupation: registrationForm.occupation.trim() || "Not provided",
          relationship: registrationForm.relationship.trim(),
          learners: registrationForm.fullName.trim(),
        };

        const documents: AdmissionsDocument[] = [
          {
            id: `doc-${Date.now()}`,
            learnerName: registrationForm.fullName.trim(),
            documentType: "Birth certificate",
            fileName: registrationForm.birthCertificateFile,
            uploadedOn: todayIsoDate(),
            verificationStatus: "pending",
            ownerType: "student",
          },
          {
            id: `doc-${Date.now() + 1}`,
            learnerName: registrationForm.fullName.trim(),
            documentType: "Passport photo",
            fileName: registrationForm.passportPhotoFile,
            uploadedOn: todayIsoDate(),
            verificationStatus: "pending",
            ownerType: "student",
          },
          {
            id: `doc-${Date.now() + 2}`,
            learnerName: registrationForm.fullName.trim(),
            documentType: "Previous report forms",
            fileName: registrationForm.reportFormsFile || "Not uploaded",
            uploadedOn: registrationForm.reportFormsFile ? todayIsoDate() : "-",
            verificationStatus: registrationForm.reportFormsFile ? "pending" : "missing",
            ownerType: "student",
          },
        ];

        const profile: AdmissionsStudentProfile = {
          id: studentId,
          fullName: registrationForm.fullName.trim(),
          admissionNumber,
          className: registrationForm.className.trim(),
          streamName: "Pending",
          dormitoryName: "Pending",
          transportRoute: "Pending",
          gender: registrationForm.gender.trim(),
          dateOfBirth: registrationForm.dateOfBirth,
          nationality: registrationForm.nationality.trim(),
          parentName: registrationForm.parentName.trim(),
          parentPhone: registrationForm.parentPhone.trim(),
          parentEmail: registrationForm.parentEmail.trim(),
          occupation: registrationForm.occupation.trim() || "Not provided",
          relationship: registrationForm.relationship.trim(),
          previousSchool: registrationForm.previousSchool.trim() || "Not provided",
          kcpeResults: registrationForm.kcpeResults.trim() || "Not recorded",
          cbcLevel: registrationForm.cbcLevel.trim() || "Not recorded",
          registrationDate: todayIsoDate(),
          applicationStatus: "registered",
          feesBalance: 0,
          lastPayment: "No payment posted yet",
          billingPlan: "No billing plan configured yet",
          portalAccessStatus: registrationForm.parentEmail.trim() ? "invited" : "not_invited",
          portalAccessDetail: registrationForm.parentEmail.trim()
            ? `Parent invitation prepared for ${registrationForm.parentEmail.trim()}`
            : "No parent portal invitation recorded.",
          allergies: registrationForm.allergies.trim() || "Not recorded",
          conditions: registrationForm.conditions.trim() || "Not recorded",
          emergencyContact: registrationForm.emergencyContact.trim(),
          academics: [],
          discipline: [],
          fees: [],
          documents: documents.map((document) => ({
            id: document.id,
            documentType: document.documentType,
            fileName: document.fileName,
            uploadedOn: document.uploadedOn,
            verificationStatus: document.verificationStatus,
          })),
        };

        setLocalDataset((current) => ({
          ...current,
          applications: [application, ...current.applications],
          students: [student, ...current.students],
          parents: [parent, ...current.parents],
          documents: [...documents, ...current.documents],
          allocations: [
            {
              id: `alloc-${Date.now()}`,
              studentId,
              studentName: registrationForm.fullName.trim(),
              admissionNumber,
              className: registrationForm.className.trim(),
              streamName: "Pending",
              dormitoryName: "Pending",
              transportRoute: "Pending",
              effectiveFrom: todayIsoDate(),
              status: "pending",
            },
            ...current.allocations,
          ],
          studentProfiles: [profile, ...current.studentProfiles],
        }));
        setRegistrationSummary(
          buildAdmissionRegistrationSummary({
            fallback: {
              applicantName: registrationForm.fullName.trim(),
              admissionNumber,
              className: registrationForm.className.trim(),
              streamName: "Pending",
              parentEmail: registrationForm.parentEmail.trim(),
            },
            response: {
              student: {
                id: studentId,
                admission_number: admissionNumber,
                full_name: registrationForm.fullName.trim(),
              },
              allocation: {
                class_name: registrationForm.className.trim(),
                stream_name: "Pending",
              },
              guardian_link: registrationForm.parentEmail.trim()
                ? {
                    email: registrationForm.parentEmail.trim(),
                    status: "invited",
                  }
                : null,
              application_status: "registered",
            },
          }),
        );
        setRegistrationForm(createEmptyRegistrationForm());
        updateSection("student-directory", { student: studentId });
      }
    } catch (error) {
      setModuleError(error instanceof Error ? error.message : "Unable to complete the registration workflow.");
    } finally {
      setIsSavingRegistration(false);
    }
  }

  async function advanceSelectedStudentAcademicLifecycle(action: "promotion" | "graduation") {
    if (!selectedStudentProfile) {
      return;
    }

    const targetClassName =
      action === "promotion"
        ? buildNextClassName(selectedStudentProfile.className)
        : selectedStudentProfile.className;
    const targetStreamName = selectedStudentProfile.streamName || "Pending";
    const lifecycleLabel = action === "promotion" ? "Promotion" : "Graduation";
    const nextMessage =
      action === "promotion"
        ? `${lifecycleLabel} recorded for ${selectedStudentProfile.fullName} to ${targetClassName} ${targetStreamName}.`
        : `${lifecycleLabel} recorded for ${selectedStudentProfile.fullName}.`;

    setIsSavingAcademicLifecycle(true);
    setModuleError(null);
    setAcademicLifecycleMessage(null);

    try {
      if (isLiveMode && liveSession.session) {
        const response = await advanceAdmissionsStudentAcademicLifecycleLive(
          liveSession.session,
          selectedStudentProfile.id,
          {
            action,
            class_name: action === "promotion" ? targetClassName : undefined,
            stream_name: action === "promotion" ? targetStreamName : undefined,
            reason: `${lifecycleLabel} recorded from the admissions profile.`,
          },
        );
        const liveClassName =
          response.academic_enrollment?.class_name
          ?? response.allocation?.class_name
          ?? targetClassName;
        const liveStreamName =
          response.academic_enrollment?.stream_name
          ?? response.allocation?.stream_name
          ?? targetStreamName;

        await refreshLiveAdmissionsData();
        setAcademicLifecycleMessage(
          action === "promotion"
            ? `${lifecycleLabel} recorded for ${selectedStudentProfile.fullName} to ${liveClassName} ${liveStreamName}.`
            : `${lifecycleLabel} recorded for ${selectedStudentProfile.fullName}.`,
        );
      } else {
        await new Promise((resolve) => window.setTimeout(resolve, 300));
        const lifecycleLine: StudentAcademicLine = {
          id: `academic-lifecycle-${action}-${Date.now()}`,
          subject: "Latest lifecycle",
          value: lifecycleLabel,
          note:
            action === "promotion"
              ? `${targetClassName} ${targetStreamName}`
              : "Learner marked as graduated.",
        };

        setLocalDataset((current) => ({
          ...current,
          students: current.students.map((student) =>
            student.id === selectedStudentProfile.id
              ? {
                  ...student,
                  className: action === "promotion" ? targetClassName : student.className,
                  streamName: action === "promotion" ? targetStreamName : student.streamName,
                }
              : student,
          ),
          allocations:
            action === "promotion"
              ? [
                  {
                    id: `alloc-lifecycle-${Date.now()}`,
                    studentId: selectedStudentProfile.id,
                    studentName: selectedStudentProfile.fullName,
                    admissionNumber: selectedStudentProfile.admissionNumber,
                    className: targetClassName,
                    streamName: targetStreamName,
                    dormitoryName: selectedStudentProfile.dormitoryName,
                    transportRoute: selectedStudentProfile.transportRoute,
                    effectiveFrom: todayIsoDate(),
                    status: "assigned",
                  },
                  ...current.allocations,
                ]
              : current.allocations,
          studentProfiles: current.studentProfiles.map((profile) =>
            profile.id === selectedStudentProfile.id
              ? {
                  ...profile,
                  className: action === "promotion" ? targetClassName : profile.className,
                  streamName: action === "promotion" ? targetStreamName : profile.streamName,
                  academics: [
                    lifecycleLine,
                    ...profile.academics.filter((line) => line.subject !== "Latest lifecycle"),
                  ],
                }
              : profile,
          ),
        }));
        setAcademicLifecycleMessage(nextMessage);
      }
    } catch (error) {
      setModuleError(
        error instanceof Error
          ? error.message
          : "Unable to update the learner academic lifecycle.",
      );
    } finally {
      setIsSavingAcademicLifecycle(false);
    }
  }

  const applicationColumns: OpsTableColumn<AdmissionApplication>[] = [
    {
      id: "name",
      header: "Applicant Name",
      render: (application) => (
        <div>
          <p className="font-semibold text-foreground">{application.applicantName}</p>
          <p className="mt-1 text-sm text-muted">{application.applicationNumber}</p>
        </div>
      ),
    },
    { id: "adm", header: "Admission Number", render: (application) => application.admissionNumber },
    { id: "class", header: "Class Applying", render: (application) => application.classApplying },
    { id: "parent", header: "Parent Contact", render: (application) => application.parentPhone },
    {
      id: "status",
      header: "Status",
      render: (application) => (
        <StatusPill
          label={formatApplicationStatus(application.status)}
          tone={getApplicationTone(application.status)}
        />
      ),
    },
    { id: "date", header: "Date Applied", render: (application) => application.dateApplied },
    {
      id: "actions",
      header: "Actions",
      render: (application) => (
        <div className="flex flex-wrap gap-2">
          {application.status === "pending" || application.status === "interview" ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={activeActionId === `${application.id}-approved`}
              onClick={() => changeApplicationStatus(application.id, "approved")}
            >
              {activeActionId === `${application.id}-approved` ? "Approving..." : "Approve"}
            </Button>
          ) : null}
          {application.status === "approved" ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={activeActionId === `${application.id}-register`}
              onClick={() => registerApplication(application)}
            >
              {activeActionId === `${application.id}-register` ? "Registering..." : "Register"}
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  const studentColumns: OpsTableColumn<StudentDirectoryEntry>[] = [
    {
      id: "name",
      header: "Student",
      render: (student) => (
        <button
          type="button"
          onClick={() => openStudentProfile(student.id)}
          className="text-left"
        >
          <p className="font-semibold text-accent">{student.fullName}</p>
          <p className="mt-1 text-sm text-muted">{student.registrationDate}</p>
        </button>
      ),
    },
    { id: "adm", header: "Admission No", render: (student) => student.admissionNumber },
    { id: "class", header: "Class", render: (student) => `${student.className} ${student.streamName}` },
    { id: "parent", header: "Parent", render: (student) => student.parentName },
    { id: "phone", header: "Parent Phone", render: (student) => student.parentPhone },
    {
      id: "status",
      header: "Status",
      render: (student) => (
        <StatusPill
          label={student.status === "registered" ? "Registered" : "Pending allocation"}
          tone={student.status === "registered" ? "ok" : "warning"}
        />
      ),
    },
  ];

  const parentColumns: OpsTableColumn<ParentDirectoryEntry>[] = [
    { id: "name", header: "Parent Name", render: (parent) => parent.parentName },
    { id: "phone", header: "Phone", render: (parent) => parent.phone },
    { id: "email", header: "Email", render: (parent) => parent.email },
    { id: "occupation", header: "Occupation", render: (parent) => parent.occupation },
    { id: "relationship", header: "Relationship", render: (parent) => parent.relationship },
    { id: "learners", header: "Learners", render: (parent) => parent.learners },
  ];

  const documentColumns: OpsTableColumn<AdmissionsDocument>[] = [
    { id: "learner", header: "Learner", render: (document) => document.learnerName },
    { id: "type", header: "Document", render: (document) => document.documentType },
    { id: "file", header: "File", render: (document) => document.fileName },
    { id: "date", header: "Uploaded On", render: (document) => document.uploadedOn },
    {
      id: "status",
      header: "Verification",
      render: (document) => (
        <StatusPill
          label={formatDocumentStatus(document.verificationStatus)}
          tone={getDocumentTone(document.verificationStatus)}
        />
      ),
    },
    {
      id: "actions",
      header: "Actions",
      render: (document) => (
        <div className="flex flex-wrap gap-2">
          {document.verificationStatus === "missing" ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => openDocumentUploadModal(document)}
            >
              Upload
            </Button>
          ) : null}
          {document.verificationStatus === "pending" ? (
            <>
              <Button
                size="sm"
                variant="ghost"
                disabled={activeActionId === `${document.id}-verified`}
                onClick={() => updateDocumentStatus(document.id, "verified")}
              >
                {activeActionId === `${document.id}-verified` ? "Verifying..." : "Verify"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={activeActionId === `${document.id}-rejected`}
                onClick={() => updateDocumentStatus(document.id, "rejected")}
              >
                Reject
              </Button>
            </>
          ) : null}
          {document.verificationStatus === "rejected" ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => openDocumentUploadModal(document)}
            >
              Replace
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  const allocationColumns: OpsTableColumn<ClassAllocation>[] = [
    { id: "student", header: "Student", render: (allocation) => allocation.studentName },
    { id: "adm", header: "Admission No", render: (allocation) => allocation.admissionNumber },
    { id: "class", header: "Class", render: (allocation) => allocation.className },
    { id: "stream", header: "Stream", render: (allocation) => allocation.streamName },
    { id: "dorm", header: "Dormitory", render: (allocation) => allocation.dormitoryName },
    ...(transportEnabled
      ? [
          {
            id: "route",
            header: "Transport Route",
            render: (allocation: ClassAllocation) => allocation.transportRoute,
          },
        ]
      : []),
    {
      id: "status",
      header: "Status",
      render: (allocation) => (
        <StatusPill
          label={formatAllocationStatus(allocation.status)}
          tone={getAllocationTone(allocation.status)}
        />
      ),
    },
  ];

  const transferColumns: OpsTableColumn<AdmissionsTransfer>[] = [
    { id: "learner", header: "Learner", render: (transfer) => transfer.learnerName },
    { id: "adm", header: "Admission No", render: (transfer) => transfer.admissionNumber },
    {
      id: "direction",
      header: "Direction",
      render: (transfer) => (
        <StatusPill
          label={formatTransferDirection(transfer.direction)}
          tone={transfer.direction === "incoming" ? "ok" : "warning"}
        />
      ),
    },
    { id: "school", header: "School", render: (transfer) => transfer.schoolName },
    { id: "reason", header: "Reason", render: (transfer) => transfer.reason },
    { id: "date", header: "Requested On", render: (transfer) => transfer.requestedOn },
    {
      id: "status",
      header: "Status",
      render: (transfer) => (
        <StatusPill label={transfer.status} tone={getTransferTone(transfer.status)} />
      ),
    },
  ];

  const selectedDocumentUploadApplication = dataset.applications.find(
    (application) => application.id === documentUploadForm.applicationId,
  );

  return (
    <>
      <ModuleShell
        eyebrow="Admissions Module"
        title="Admissions and student registration workspace"
        description="A real front-office workflow for Kenyan schools: application review, document control, learner registration, allocation, and transfer history."
        sections={sections}
        activeSection={activeSection}
        onSectionChange={(sectionId) =>
          updateSection(
            sectionId as AdmissionsSectionId,
            sectionId === "student-directory" ? {} : { student: null },
          )
        }
        meta={
          <>
            <StatusPill
              label={
                isLiveMode
                  ? "Live admissions desk"
                  : liveSession.apiConfigured
                    ? "Preview data until live sign-in"
                    : "Review workspace"
              }
              tone={isLiveMode ? "ok" : "warning"}
            />
            <StatusPill
              label={`${dataset.documents.filter((document) => document.verificationStatus === "missing").length} missing documents`}
              tone={dataset.documents.some((document) => document.verificationStatus === "missing") ? "critical" : "ok"}
            />
          </>
        }
        actions={
          <>
            <Button variant="secondary" onClick={() => setAllocationModalOpen(true)}>
              <GraduationCap className="h-4 w-4" />
              Assign allocation
            </Button>
            <Button onClick={() => updateSection("new-registration", { student: null })}>
              <UserPlus className="h-4 w-4" />
              New registration
            </Button>
          </>
        }
        sidebarFooter={
          <div className="rounded-xl border border-border bg-surface-muted px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
              Data source
            </p>
            <p className="mt-2 text-sm font-semibold text-foreground">
              {isLiveMode
                ? `Signed in as ${liveSession.user?.display_name ?? "admissions staff"} for live admissions records.`
                : "Global search responds to learner name, admission number, and parent phone while the review workspace waits for a live tenant session."}
            </p>
            <p className="mt-2 text-sm leading-6 text-muted">
              {moduleError ?? liveSession.error ?? "Search results can jump directly into the student directory profile view."}
            </p>
          </div>
        }
      >
        {moduleError ? (
          <Card className="border-danger/40 bg-danger/5 p-4">
            <p className="text-sm font-semibold text-danger">Admissions action failed</p>
            <p className="mt-1 text-sm text-muted">{moduleError}</p>
          </Card>
        ) : null}

        {academicLifecycleMessage ? (
          <Card className="border-success/30 bg-success/5 p-4">
            <p className="text-sm font-semibold text-success">Academic lifecycle updated</p>
            <p className="mt-1 text-sm text-muted">{academicLifecycleMessage}</p>
          </Card>
        ) : null}

        {registrationSummary ? (
          <Card className="border-accent/30 bg-accent/5 p-5">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                  Registration completed
                </p>
                <h2 className="mt-2 text-xl font-semibold text-foreground">
                  {registrationSummary.studentName}
                </h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  <StatusPill label={registrationSummary.admissionNumber} tone="ok" />
                  <StatusPill
                    label={registrationSummary.applicationStatus.replace(/_/g, " ")}
                    tone="ok"
                  />
                </div>
              </div>

              <div className="grid min-w-0 flex-1 gap-4 md:grid-cols-3">
                {[
                  ["Academic handoff", registrationSummary.academicSummary],
                  ["Parent portal", registrationSummary.portalSummary],
                  ["Fee handoff", registrationSummary.feeSummary],
                ].map(([label, value]) => (
                  <div key={label} className="min-w-0 border-l border-accent/30 pl-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                      {label}
                    </p>
                    <p className="mt-2 text-sm font-semibold leading-6 text-foreground">
                      {value}
                    </p>
                  </div>
                ))}
              </div>

              {registrationSummary.studentId ? (
                <Button
                  variant="secondary"
                  onClick={() => openStudentProfile(registrationSummary.studentId!)}
                  className="shrink-0"
                >
                  <CheckCheck className="h-4 w-4" />
                  Open profile
                </Button>
              ) : null}
            </div>

            <div className="mt-5 border-t border-accent/20 pt-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                Onboarding checklist
              </p>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {registrationSummary.onboardingChecklist.map((item) => (
                  <div key={item.id} className="min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-semibold text-foreground">{item.title}</p>
                      <StatusPill label={item.value} tone={item.tone} />
                    </div>
                    <p className="mt-2 text-sm leading-6 text-muted">{item.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        ) : null}

        {activeSection === "dashboard" ? (
          <>
            <StatStrip items={buildAdmissionsStatStrip(dataset)} />

            <section className="grid gap-6 2xl:grid-cols-[minmax(0,1.25fr)_360px]">
              <div className="space-y-6">
                <WorkflowCard
                  eyebrow="Recent applications"
                  title="Admissions queue"
                  description="Front-office staff can see the freshest application activity and decide what needs review first."
                  items={dataset.applications.slice(0, 5).map((application) => ({
                    id: application.id,
                    title: application.applicantName,
                    detail: `${application.applicationNumber} · ${application.classApplying} · ${application.parentPhone}`,
                    value: formatApplicationStatus(application.status),
                    tone: getApplicationTone(application.status),
                  }))}
                />

                <Card className="p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                    Admissions trend
                  </p>
                  <h3 className="mt-2 text-lg font-semibold text-foreground">
                    Monthly application and registration trend
                  </h3>
                  <div className="mt-5 grid gap-3 md:grid-cols-5">
                    {trend.map((point) => (
                      <div
                        key={point.id}
                        className="rounded-xl border border-border bg-surface-muted px-4 py-4"
                      >
                        <p className="text-xs uppercase tracking-[0.18em] text-muted">{point.label}</p>
                        <p className="mt-3 text-xl font-bold text-foreground">{point.applications}</p>
                        <p className="mt-1 text-sm text-muted">{point.registered} registered</p>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>

              <div className="space-y-6">
                <WorkflowCard
                  eyebrow="Pending approvals"
                  title="Files waiting on the office"
                  description="Approved learners still needing registration or pending interview follow-up."
                  items={dataset.applications
                    .filter((application) =>
                      application.status === "pending"
                      || application.status === "interview"
                      || application.status === "approved",
                    )
                    .slice(0, 5)
                    .map((application) => ({
                      id: application.id,
                      title: application.applicantName,
                      detail: `${application.classApplying} · ${application.reviewNote}`,
                      value: formatApplicationStatus(application.status),
                      tone: getApplicationTone(application.status),
                    }))}
                />

                <WorkflowCard
                  eyebrow="Missing documents"
                  title="Compliance gaps"
                  description="Files that will block approval or final registration unless resolved."
                  items={dataset.documents
                    .filter((document) => document.verificationStatus === "missing" || document.verificationStatus === "pending")
                    .slice(0, 5)
                    .map((document) => ({
                      id: document.id,
                      title: `${document.learnerName} · ${document.documentType}`,
                      detail: document.fileName === "Not uploaded" ? "Still missing from the application file." : `Uploaded ${document.uploadedOn}`,
                      value: formatDocumentStatus(document.verificationStatus),
                      tone: getDocumentTone(document.verificationStatus),
                    }))}
                />
              </div>
            </section>
          </>
        ) : null}

        {activeSection === "applications" ? (
          <OpsTable
            title="Applications"
            subtitle="Applicant, admission number, class target, parent contact, status, and actions on one operations screen."
            rows={filteredApplications}
            columns={applicationColumns}
            getRowId={(row) => row.id}
            searchValue={applicationSearch}
            onSearchValueChange={setApplicationSearch}
            searchPlaceholder="Search applicant, application number, class, or parent phone"
            filters={[
              {
                id: "application-status",
                label: "Filter by application status",
                value: applicationStatusFilter,
                onChange: setApplicationStatusFilter,
                options: [
                  { value: "all", label: "All statuses" },
                  { value: "pending", label: "Pending" },
                  { value: "interview", label: "Interview" },
                  { value: "approved", label: "Approved" },
                  { value: "rejected", label: "Rejected" },
                  { value: "registered", label: "Registered" },
                ],
              },
            ]}
            totalRows={filteredApplications.length}
            page={1}
            pageSize={filteredApplications.length || 1}
            onPageChange={() => undefined}
            loading={isDatasetLoading}
            loadingLabel="Loading live applications..."
          />
        ) : null}

        {activeSection === "new-registration" ? (
          <div className="space-y-6">
            <FormSection
              title="Personal information"
              description="Capture the core learner identity details before any academic or billing action happens."
            >
              <div className="grid gap-4 md:grid-cols-2">
                <FieldWrapper label="Full name" error={registrationErrors.fullName}>
                  <input
                    className={fieldClassName}
                    value={registrationForm.fullName}
                    onChange={(event) =>
                      setRegistrationForm((current) => ({ ...current, fullName: event.target.value }))
                    }
                    placeholder="Learner full name"
                  />
                </FieldWrapper>
                <FieldWrapper label="Date of birth" error={registrationErrors.dateOfBirth}>
                  <input
                    type="date"
                    className={fieldClassName}
                    value={registrationForm.dateOfBirth}
                    onChange={(event) =>
                      setRegistrationForm((current) => ({ ...current, dateOfBirth: event.target.value }))
                    }
                  />
                </FieldWrapper>
                <FieldWrapper label="Gender" error={registrationErrors.gender}>
                  <select
                    className={fieldClassName}
                    value={registrationForm.gender}
                    onChange={(event) =>
                      setRegistrationForm((current) => ({ ...current, gender: event.target.value }))
                    }
                  >
                    <option value="">Select gender</option>
                    <option value="Female">Female</option>
                    <option value="Male">Male</option>
                    <option value="Other">Other</option>
                  </select>
                </FieldWrapper>
                <FieldWrapper
                  label="Birth certificate number"
                  error={registrationErrors.birthCertificateNumber}
                >
                  <input
                    className={fieldClassName}
                    value={registrationForm.birthCertificateNumber}
                    onChange={(event) =>
                      setRegistrationForm((current) => ({
                        ...current,
                        birthCertificateNumber: event.target.value,
                      }))
                    }
                    placeholder="Birth certificate number"
                  />
                </FieldWrapper>
                <FieldWrapper label="Nationality">
                  <input
                    className={fieldClassName}
                    value={registrationForm.nationality}
                    onChange={(event) =>
                      setRegistrationForm((current) => ({ ...current, nationality: event.target.value }))
                    }
                  />
                </FieldWrapper>
              </div>
            </FormSection>

            <FormSection
              title="Academic information"
              description="The admissions office needs a clear academic placement starting point before class allocation."
            >
              <div className="grid gap-4 md:grid-cols-2">
                <FieldWrapper label="Previous school">
                  <input
                    className={fieldClassName}
                    value={registrationForm.previousSchool}
                    onChange={(event) =>
                      setRegistrationForm((current) => ({ ...current, previousSchool: event.target.value }))
                    }
                    placeholder="Previous school name"
                  />
                </FieldWrapper>
                <FieldWrapper label="KCPE results">
                  <input
                    className={fieldClassName}
                    value={registrationForm.kcpeResults}
                    onChange={(event) =>
                      setRegistrationForm((current) => ({ ...current, kcpeResults: event.target.value }))
                    }
                    placeholder="Score or assessment summary"
                  />
                </FieldWrapper>
                <FieldWrapper label="CBC level">
                  <input
                    className={fieldClassName}
                    value={registrationForm.cbcLevel}
                    onChange={(event) =>
                      setRegistrationForm((current) => ({ ...current, cbcLevel: event.target.value }))
                    }
                    placeholder="Previous academic level"
                  />
                </FieldWrapper>
                <FieldWrapper label="Class" error={registrationErrors.className}>
                  <select
                    className={fieldClassName}
                    value={registrationForm.className}
                    onChange={(event) =>
                      setRegistrationForm((current) => ({ ...current, className: event.target.value }))
                    }
                  >
                    <option value="">Select class</option>
                    <option value="PP2">PP2</option>
                    <option value="Grade 4">Grade 4</option>
                    <option value="Grade 5">Grade 5</option>
                    <option value="Grade 6">Grade 6</option>
                    <option value="Grade 7">Grade 7</option>
                    <option value="Grade 8">Grade 8</option>
                    <option value="Grade 9">Grade 9</option>
                  </select>
                </FieldWrapper>
              </div>
            </FormSection>

            <FormSection
              title="Parent or guardian information"
              description="Front-office registration should never lose the primary contact and relationship details."
            >
              <div className="grid gap-4 md:grid-cols-2">
                <FieldWrapper label="Parent name" error={registrationErrors.parentName}>
                  <input
                    className={fieldClassName}
                    value={registrationForm.parentName}
                    onChange={(event) =>
                      setRegistrationForm((current) => ({ ...current, parentName: event.target.value }))
                    }
                    placeholder="Parent or guardian full name"
                  />
                </FieldWrapper>
                <FieldWrapper label="Phone" error={registrationErrors.parentPhone}>
                  <input
                    className={fieldClassName}
                    value={registrationForm.parentPhone}
                    onChange={(event) =>
                      setRegistrationForm((current) => ({ ...current, parentPhone: event.target.value }))
                    }
                    placeholder="Parent phone number"
                  />
                </FieldWrapper>
                <FieldWrapper label="Email">
                  <input
                    className={fieldClassName}
                    value={registrationForm.parentEmail}
                    onChange={(event) =>
                      setRegistrationForm((current) => ({ ...current, parentEmail: event.target.value }))
                    }
                    placeholder="Parent email address"
                  />
                </FieldWrapper>
                <FieldWrapper label="Occupation">
                  <input
                    className={fieldClassName}
                    value={registrationForm.occupation}
                    onChange={(event) =>
                      setRegistrationForm((current) => ({ ...current, occupation: event.target.value }))
                    }
                    placeholder="Occupation or workplace"
                  />
                </FieldWrapper>
                <FieldWrapper label="Relationship" error={registrationErrors.relationship}>
                  <input
                    className={fieldClassName}
                    value={registrationForm.relationship}
                    onChange={(event) =>
                      setRegistrationForm((current) => ({ ...current, relationship: event.target.value }))
                    }
                    placeholder="Relationship to learner"
                  />
                </FieldWrapper>
              </div>
            </FormSection>

            <FormSection
              title="Medical information"
              description="Basic medical visibility keeps the learner safe from the first day of reporting."
            >
              <div className="grid gap-4 md:grid-cols-2">
                <FieldWrapper label="Allergies">
                  <input
                    className={fieldClassName}
                    value={registrationForm.allergies}
                    onChange={(event) =>
                      setRegistrationForm((current) => ({ ...current, allergies: event.target.value }))
                    }
                    placeholder="Known allergies, if any"
                  />
                </FieldWrapper>
                <FieldWrapper label="Conditions">
                  <input
                    className={fieldClassName}
                    value={registrationForm.conditions}
                    onChange={(event) =>
                      setRegistrationForm((current) => ({ ...current, conditions: event.target.value }))
                    }
                    placeholder="Medical conditions, if any"
                  />
                </FieldWrapper>
                <FieldWrapper label="Emergency contact" error={registrationErrors.emergencyContact}>
                  <input
                    className={fieldClassName}
                    value={registrationForm.emergencyContact}
                    onChange={(event) =>
                      setRegistrationForm((current) => ({ ...current, emergencyContact: event.target.value }))
                    }
                    placeholder="Emergency phone number"
                  />
                </FieldWrapper>
              </div>
            </FormSection>

            <FormSection
              title="Document uploads"
              description="Track the mandatory admissions file set before approval and final verification."
            >
              <div className="grid gap-4 md:grid-cols-2">
                <FieldWrapper label="Birth certificate" error={registrationErrors.birthCertificateFile}>
                  <input
                    type="file"
                    className={fieldClassName}
                    onChange={(event) =>
                      setRegistrationForm((current) => ({
                        ...current,
                        birthCertificateFile: event.target.files?.[0]?.name ?? "",
                        birthCertificateUpload: event.target.files?.[0] ?? null,
                      }))
                    }
                  />
                </FieldWrapper>
                <FieldWrapper label="Passport photo" error={registrationErrors.passportPhotoFile}>
                  <input
                    type="file"
                    className={fieldClassName}
                    onChange={(event) =>
                      setRegistrationForm((current) => ({
                        ...current,
                        passportPhotoFile: event.target.files?.[0]?.name ?? "",
                        passportPhotoUpload: event.target.files?.[0] ?? null,
                      }))
                    }
                  />
                </FieldWrapper>
                <div className="md:col-span-2">
                  <FieldWrapper label="Previous report forms">
                    <input
                      type="file"
                      className={fieldClassName}
                      onChange={(event) =>
                        setRegistrationForm((current) => ({
                          ...current,
                          reportFormsFile: event.target.files?.[0]?.name ?? "",
                          reportFormsUpload: event.target.files?.[0] ?? null,
                        }))
                      }
                    />
                  </FieldWrapper>
                </div>
              </div>
            </FormSection>

            <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
              <Button onClick={submitRegistration} disabled={isSavingRegistration} className="justify-center">
                {isSavingRegistration ? "Registering learner..." : "Register learner"}
              </Button>

              <WorkflowCard
                eyebrow="Validation notes"
                title="What the office should confirm"
                description="A complete registration should be believable and ready for downstream class and fee workflows."
                items={[
                  {
                    id: "validation-1",
                    title: "Identity file complete",
                    detail: "Birth certificate number and passport photo are mandatory before final registration.",
                  },
                  {
                    id: "validation-2",
                    title: "Guardian is reachable",
                    detail: "Phone and relationship are required so follow-up is never blocked.",
                  },
                  {
                    id: "validation-3",
                    title: "Academic starting point is visible",
                    detail: "Class, previous school, and CBC level give the admissions office a workable intake record.",
                  },
                ]}
              />
            </section>
          </div>
        ) : null}

        {activeSection === "student-directory" ? (
          <div className="space-y-6">
            <OpsTable
              title="Student directory"
              subtitle="Instant learner lookup by name, admission number, or parent phone with direct profile access."
              rows={filteredStudents}
              columns={studentColumns}
              getRowId={(row) => row.id}
              searchValue={directorySearch}
              onSearchValueChange={setDirectorySearch}
              searchPlaceholder="Search by learner name, admission number, or parent phone"
              totalRows={filteredStudents.length}
              page={1}
              pageSize={filteredStudents.length || 1}
              onPageChange={() => undefined}
              loading={isDatasetLoading}
              loadingLabel="Loading live student directory..."
            />

            {selectedStudentProfile ? (
              <div className="space-y-6">
                <Card className="p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                        Student profile
                      </p>
                      <h3 className="mt-2 text-xl font-semibold text-foreground">
                        {selectedStudentProfile.fullName}
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-muted">
                        {selectedStudentProfile.admissionNumber} · {selectedStudentProfile.className}{" "}
                        {selectedStudentProfile.streamName} · Parent {selectedStudentProfile.parentPhone}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {isSelectedStudentProfileSyncing ? (
                        <StatusPill label="Syncing live profile" tone="warning" />
                      ) : null}
                      <StatusPill label={buildFeesSummary(selectedStudentProfile.feesBalance)} tone="warning" />
                      <StatusPill label={selectedStudentProfile.applicationStatus} tone={getApplicationTone(selectedStudentProfile.applicationStatus)} />
                      <Button
                        variant="secondary"
                        onClick={() => advanceSelectedStudentAcademicLifecycle("promotion")}
                        disabled={isSavingAcademicLifecycle}
                      >
                        <GraduationCap className="h-4 w-4" />
                        Promote learner
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => advanceSelectedStudentAcademicLifecycle("graduation")}
                        disabled={isSavingAcademicLifecycle}
                      >
                        <CheckCheck className="h-4 w-4" />
                        Graduate learner
                      </Button>
                    </div>
                  </div>
                </Card>

                <Tabs
                  items={[
                    {
                      id: "overview",
                      label: "Overview",
                      panel: (
                        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
                          <Card className="p-5">
                            <div className="grid gap-4 md:grid-cols-2">
                              {[
                                ["Admission number", selectedStudentProfile.admissionNumber],
                                ["Date of birth", selectedStudentProfile.dateOfBirth],
                                ["Gender", selectedStudentProfile.gender],
                                ["Nationality", selectedStudentProfile.nationality],
                                ["Class", `${selectedStudentProfile.className} ${selectedStudentProfile.streamName}`],
                                ["Dormitory", selectedStudentProfile.dormitoryName],
                                ...(transportEnabled
                                  ? [["Transport", selectedStudentProfile.transportRoute] as [string, string]]
                                  : []),
                                ["Previous school", selectedStudentProfile.previousSchool],
                              ].map(([label, value]) => (
                                <div
                                  key={label}
                                  className="rounded-xl border border-border bg-surface-muted px-4 py-4"
                                >
                                  <p className="text-xs uppercase tracking-[0.18em] text-muted">{label}</p>
                                  <p className="mt-2 text-sm font-semibold text-foreground">{value}</p>
                                </div>
                              ))}
                            </div>
                          </Card>

                          <WorkflowCard
                            eyebrow="Guardian"
                            title="Primary contact"
                            description="The office can confirm the responsible adult and contact path at a glance."
                            items={[
                              {
                                id: "guardian-name",
                                title: selectedStudentProfile.parentName,
                                detail: `${selectedStudentProfile.relationship} · ${selectedStudentProfile.occupation}`,
                                value: selectedStudentProfile.parentPhone,
                              },
                              {
                                id: "guardian-email",
                                title: selectedStudentProfile.parentEmail || "Email not yet recorded",
                                detail: `Emergency contact ${selectedStudentProfile.emergencyContact}`,
                              },
                              {
                                id: "guardian-portal",
                                title:
                                  selectedStudentProfile.portalAccessStatus === "active"
                                    ? "Parent portal active"
                                    : selectedStudentProfile.portalAccessStatus === "invited"
                                      ? "Parent portal invited"
                                      : "Parent portal not active",
                                detail: selectedStudentProfile.portalAccessDetail,
                                tone:
                                  selectedStudentProfile.portalAccessStatus === "active"
                                    ? "ok"
                                    : "warning",
                              },
                            ]}
                          />
                        </div>
                      ),
                    },
                    {
                      id: "fees",
                      label: "Fees",
                      panel: (
                        <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
                          <WorkflowCard
                            eyebrow="Fees summary"
                            title="Opening financial posture"
                            description="The admissions office can see whether the learner is ready for bursary handoff."
                            items={[
                              {
                                id: "fees-balance",
                                title: buildFeesSummary(selectedStudentProfile.feesBalance),
                                detail: selectedStudentProfile.billingPlan,
                                tone: "warning",
                              },
                              {
                                id: "fees-payment",
                                title: "Latest payment",
                                detail: selectedStudentProfile.lastPayment,
                              },
                            ]}
                          />
                          <OpsTable
                            title="Fees lines"
                            subtitle="Opening fees and current posting posture."
                            rows={selectedStudentProfile.fees}
                            columns={[
                              { id: "item", header: "Item", render: (row) => row.item },
                              {
                                id: "amount",
                                header: "Amount",
                                className: "text-right font-semibold",
                                headerClassName: "text-right",
                                render: (row) => formatCurrency(row.amount, false),
                              },
                              {
                                id: "status",
                                header: "Status",
                                render: (row) => (
                                  <StatusPill label={row.status} tone={row.status === "posted" ? "ok" : "warning"} />
                                ),
                              },
                            ]}
                            getRowId={(row) => row.id}
                            totalRows={selectedStudentProfile.fees.length}
                            page={1}
                            pageSize={selectedStudentProfile.fees.length || 1}
                            onPageChange={() => undefined}
                          />
                        </div>
                      ),
                    },
                    {
                      id: "academics",
                      label: "Academics",
                      panel: (
                        <OpsTable
                          title="Academic profile"
                          subtitle="Starting academic context from interviews, previous school records, and entry notes."
                          rows={selectedStudentProfile.academics}
                          columns={[
                            { id: "subject", header: "Area", render: (row) => row.subject },
                            { id: "value", header: "Level", render: (row) => row.value },
                            { id: "note", header: "Note", render: (row) => row.note },
                          ]}
                          getRowId={(row) => row.id}
                          totalRows={selectedStudentProfile.academics.length}
                          page={1}
                          pageSize={selectedStudentProfile.academics.length || 1}
                          onPageChange={() => undefined}
                        />
                      ),
                    },
                    {
                      id: "medical",
                      label: "Medical",
                      panel: (
                        <Card className="p-5">
                          <div className="grid gap-4 md:grid-cols-3">
                            {[
                              ["Allergies", selectedStudentProfile.allergies],
                              ["Conditions", selectedStudentProfile.conditions],
                              ["Emergency contact", selectedStudentProfile.emergencyContact],
                            ].map(([label, value]) => (
                              <div
                                key={label}
                                className="rounded-xl border border-border bg-surface-muted px-4 py-4"
                              >
                                <p className="text-xs uppercase tracking-[0.18em] text-muted">{label}</p>
                                <p className="mt-2 text-sm font-semibold text-foreground">{value}</p>
                              </div>
                            ))}
                          </div>
                        </Card>
                      ),
                    },
                    {
                      id: "discipline",
                      label: "Discipline",
                      panel: (
                        <OpsTable
                          title="Discipline log"
                          subtitle="Early conduct and welfare notes for a new learner."
                          rows={selectedStudentProfile.discipline}
                          columns={[
                            { id: "date", header: "Date", render: (row) => row.date },
                            { id: "entry", header: "Entry", render: (row) => row.entry },
                            { id: "status", header: "Status", render: (row) => row.status },
                          ]}
                          getRowId={(row) => row.id}
                          totalRows={selectedStudentProfile.discipline.length}
                          page={1}
                          pageSize={selectedStudentProfile.discipline.length || 1}
                          onPageChange={() => undefined}
                        />
                      ),
                    },
                    {
                      id: "documents",
                      label: "Documents",
                      panel: (
                        <OpsTable
                          title="Document file"
                          subtitle="The learner file showing uploaded and verified admissions documents."
                          rows={selectedStudentProfile.documents}
                          columns={[
                            { id: "type", header: "Document", render: (row) => row.documentType },
                            { id: "file", header: "File", render: (row) => row.fileName },
                            { id: "uploaded", header: "Uploaded On", render: (row) => row.uploadedOn },
                            {
                              id: "status",
                              header: "Verification",
                              render: (row) => (
                                <StatusPill
                                  label={formatDocumentStatus(row.verificationStatus)}
                                  tone={getDocumentTone(row.verificationStatus)}
                                />
                              ),
                            },
                          ]}
                          getRowId={(row) => row.id}
                          totalRows={selectedStudentProfile.documents.length}
                          page={1}
                          pageSize={selectedStudentProfile.documents.length || 1}
                          onPageChange={() => undefined}
                        />
                      ),
                    },
                  ]}
                />
              </div>
            ) : null}
          </div>
        ) : null}

        {activeSection === "parent-information" ? (
          <OpsTable
            title="Parent information"
            subtitle="Guardian contacts, occupation, relationship, and linked learners ready for office follow-up."
            rows={filteredParents}
            columns={parentColumns}
            getRowId={(row) => row.id}
            searchValue={parentSearch}
            onSearchValueChange={setParentSearch}
            searchPlaceholder="Search parent, phone, email, or learner"
            totalRows={filteredParents.length}
            page={1}
            pageSize={filteredParents.length || 1}
            onPageChange={() => undefined}
            loading={isDatasetLoading}
            loadingLabel="Loading live parent records..."
          />
        ) : null}

        {activeSection === "documents" ? (
          <OpsTable
            title="Documents"
            subtitle="Uploaded documents, missing files, and verification status by learner record."
            rows={filteredDocuments}
            columns={documentColumns}
            getRowId={(row) => row.id}
            searchValue={documentSearch}
            onSearchValueChange={setDocumentSearch}
            searchPlaceholder="Search learner, file, application, or admission number"
            filters={[
              {
                id: "document-status",
                label: "Filter document status",
                value: documentStatusFilter,
                onChange: setDocumentStatusFilter,
                options: [
                  { value: "all", label: "All statuses" },
                  { value: "pending", label: "Pending" },
                  { value: "verified", label: "Verified" },
                  { value: "rejected", label: "Rejected" },
                  { value: "missing", label: "Missing" },
                ],
              },
            ]}
            totalRows={filteredDocuments.length}
            page={1}
            pageSize={filteredDocuments.length || 1}
            onPageChange={() => undefined}
            loading={isDatasetLoading}
            loadingLabel="Loading live document register..."
            emptyTitle="No document records match this view"
            emptyDescription="Adjust the search or upload a document against an applicant file."
            emptyAction={
              <Button onClick={() => openDocumentUploadModal()}>
                <FileUp className="h-4 w-4" />
                Upload document
              </Button>
            }
            exportConfig={{
              filename: "admissions-documents.csv",
              headers: ["Learner", "Document", "File", "Uploaded On", "Verification"],
              rows: filteredDocuments.map((document) => [
                document.learnerName,
                document.documentType,
                document.fileName,
                document.uploadedOn,
                formatDocumentStatus(document.verificationStatus),
              ]),
            }}
            actions={
              <Button onClick={() => openDocumentUploadModal()}>
                <FileUp className="h-4 w-4" />
                Upload document
              </Button>
            }
          />
        ) : null}

        {activeSection === "class-allocation" ? (
          <div className="space-y-6">
            <OpsTable
              title="Class allocation"
              subtitle={
                transportEnabled
                  ? "Assign class, stream, dormitory, and transport route once registration is complete."
                  : "Assign class, stream, and dormitory once registration is complete."
              }
              rows={dataset.allocations}
              columns={allocationColumns}
              getRowId={(row) => row.id}
              totalRows={dataset.allocations.length}
              page={1}
              pageSize={dataset.allocations.length || 1}
              onPageChange={() => undefined}
              loading={isDatasetLoading}
              loadingLabel="Loading live class allocations..."
              actions={
                <Button onClick={() => setAllocationModalOpen(true)}>
                  <CheckCheck className="h-4 w-4" />
                  Assign allocation
                </Button>
              }
            />
          </div>
        ) : null}

        {activeSection === "transfers" ? (
          <div className="space-y-6">
            <OpsTable
              title="Transfers"
              subtitle="Incoming and outgoing learner transfers with reason and school history visible to the admissions office."
              rows={dataset.transfers}
              columns={transferColumns}
              getRowId={(row) => row.id}
              totalRows={dataset.transfers.length}
              page={1}
              pageSize={dataset.transfers.length || 1}
              onPageChange={() => undefined}
              loading={isDatasetLoading}
              loadingLabel="Loading live transfer register..."
              actions={
                <Button onClick={() => setTransferModalOpen(true)}>
                  <RefreshCcw className="h-4 w-4" />
                  New transfer
                </Button>
              }
            />
          </div>
        ) : null}

        {activeSection === "reports" ? (
          <div className="space-y-6">
            <section className="grid gap-6 xl:grid-cols-2">
              {reports.map((report) => (
                <Card key={report.id} className="p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                    Report
                  </p>
                  <h3 className="mt-2 text-lg font-semibold text-foreground">{report.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted">{report.description}</p>
                  <div className="mt-5 flex flex-wrap gap-3">
                    <Button
                      variant="secondary"
                      onClick={() => void exportAdmissionsReport(report)}
                      disabled={activeActionId === `${report.id}-export`}
                    >
                      {activeActionId === `${report.id}-export`
                        ? "Exporting..."
                        : `Export ${report.filename.replace(".csv", "")}`}
                    </Button>
                  </div>
                  <div className="mt-5 rounded-xl border border-border bg-surface-muted px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted">Preview row</p>
                    <p className="mt-2 text-sm text-foreground">
                      {report.rows[0]?.join(" · ") ?? "No rows available yet."}
                    </p>
                  </div>
                </Card>
              ))}
            </section>

            <WorkflowCard
              eyebrow="Reporting rules"
              title="Keep admissions reporting practical"
              description="Reports should answer common office questions immediately without extra cleanup."
              items={[
                {
                  id: "report-rule-1",
                  title: "Applications status mix",
                  detail: "Which files are pending, approved, rejected, or fully registered?",
                },
                {
                  id: "report-rule-2",
                  title: "Document compliance",
                  detail: "Which learners are blocked by missing or unverified documents?",
                },
                {
                  id: "report-rule-3",
                  title: "Allocation completion",
                  detail: transportEnabled
                    ? "Which admitted learners still need stream, dormitory, or route assignment?"
                    : "Which admitted learners still need stream or dormitory assignment?",
                },
              ]}
            />
          </div>
        ) : null}
      </ModuleShell>

      <Modal
        open={documentUploadModalOpen}
        title="Upload admissions document"
        description="Attach a scanned file to an applicant record. New uploads enter pending verification before approval."
        onClose={() => setDocumentUploadModalOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDocumentUploadModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitDocumentUpload} disabled={isSavingDocumentUpload}>
              {isSavingDocumentUpload ? "Uploading..." : "Upload document"}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <FieldWrapper label="Applicant" error={documentUploadErrors.applicationId}>
            <select
              className={fieldClassName}
              value={documentUploadForm.applicationId}
              onChange={(event) =>
                setDocumentUploadForm((current) => ({
                  ...current,
                  applicationId: event.target.value,
                }))
              }
            >
              <option value="">Select applicant file</option>
              {dataset.applications.map((application) => (
                <option key={application.id} value={application.id}>
                  {application.applicantName} ({application.applicationNumber})
                </option>
              ))}
            </select>
          </FieldWrapper>

          <FieldWrapper label="Document type" error={documentUploadErrors.documentType}>
            <select
              className={fieldClassName}
              value={documentUploadForm.documentType}
              onChange={(event) =>
                setDocumentUploadForm((current) => ({
                  ...current,
                  documentType: event.target.value,
                }))
              }
            >
              <option value="">Select document type</option>
              {admissionsDocumentTypes.map((documentType) => (
                <option key={documentType} value={documentType}>
                  {documentType}
                </option>
              ))}
            </select>
          </FieldWrapper>

          <div className="md:col-span-2">
            <FieldWrapper label="Document file" error={documentUploadErrors.fileName}>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                className={fieldClassName}
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  setDocumentUploadForm((current) => ({
                    ...current,
                    file,
                    fileName: file?.name ?? "",
                  }));
                }}
              />
            </FieldWrapper>
          </div>

          <div className="md:col-span-2">
            <Card className="p-4">
              {selectedDocumentUploadApplication ? (
                <div className="grid gap-3 md:grid-cols-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-muted">Class</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">
                      {selectedDocumentUploadApplication.classApplying}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-muted">Parent contact</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">
                      {selectedDocumentUploadApplication.parentPhone}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-muted">Application status</p>
                    <div className="mt-1">
                      <StatusPill
                        label={formatApplicationStatus(selectedDocumentUploadApplication.status)}
                        tone={getApplicationTone(selectedDocumentUploadApplication.status)}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm leading-6 text-muted">
                  Select an applicant file to show the class, parent contact, and approval state
                  before uploading.
                </p>
              )}
            </Card>
          </div>
        </div>
      </Modal>

      <Modal
        open={allocationModalOpen}
        title="Assign class allocation"
        description="Complete the final onboarding steps after registration."
        onClose={() => setAllocationModalOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAllocationModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitAllocation} disabled={isSavingAllocation}>
              {isSavingAllocation ? "Saving..." : "Save allocation"}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <FieldWrapper label="Student" error={allocationErrors.studentId}>
            <select
              className={fieldClassName}
              value={allocationForm.studentId}
              onChange={(event) =>
                setAllocationForm((current) => ({ ...current, studentId: event.target.value }))
              }
            >
              <option value="">Select learner</option>
              {dataset.students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.fullName} ({student.admissionNumber})
                </option>
              ))}
            </select>
          </FieldWrapper>
          <FieldWrapper label="Class" error={allocationErrors.className}>
            <input
              className={fieldClassName}
              value={allocationForm.className}
              onChange={(event) =>
                setAllocationForm((current) => ({ ...current, className: event.target.value }))
              }
              placeholder="Class name"
            />
          </FieldWrapper>
          <FieldWrapper label="Stream" error={allocationErrors.streamName}>
            <input
              className={fieldClassName}
              value={allocationForm.streamName}
              onChange={(event) =>
                setAllocationForm((current) => ({ ...current, streamName: event.target.value }))
              }
              placeholder="Stream name"
            />
          </FieldWrapper>
          <FieldWrapper label="Dormitory" error={allocationErrors.dormitoryName}>
            <input
              className={fieldClassName}
              value={allocationForm.dormitoryName}
              onChange={(event) =>
                setAllocationForm((current) => ({ ...current, dormitoryName: event.target.value }))
              }
              placeholder="Dormitory or boarding house"
            />
          </FieldWrapper>
          {transportEnabled ? (
            <div className="md:col-span-2">
              <FieldWrapper label="Transport route" error={allocationErrors.transportRoute}>
                <input
                  className={fieldClassName}
                  value={allocationForm.transportRoute}
                  onChange={(event) =>
                    setAllocationForm((current) => ({ ...current, transportRoute: event.target.value }))
                  }
                  placeholder="Transport route name"
                />
              </FieldWrapper>
            </div>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={transferModalOpen}
        title="Create transfer record"
        description="Log an incoming or outgoing learner transfer into the admissions workflow."
        onClose={() => setTransferModalOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setTransferModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitTransfer} disabled={isSavingTransfer}>
              {isSavingTransfer ? "Saving..." : "Save transfer"}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <FieldWrapper label="Learner name" error={transferErrors.learnerName}>
            <input
              className={fieldClassName}
              value={transferForm.learnerName}
              onChange={(event) =>
                setTransferForm((current) => ({ ...current, learnerName: event.target.value }))
              }
              placeholder="Learner name"
            />
          </FieldWrapper>
          <FieldWrapper label="Admission number" error={transferErrors.admissionNumber}>
            <input
              className={fieldClassName}
              value={transferForm.admissionNumber}
              onChange={(event) =>
                setTransferForm((current) => ({ ...current, admissionNumber: event.target.value }))
              }
              placeholder="Admission number"
            />
          </FieldWrapper>
          <FieldWrapper label="Direction">
            <select
              className={fieldClassName}
              value={transferForm.direction}
              onChange={(event) =>
                setTransferForm((current) => ({
                  ...current,
                  direction: event.target.value as TransferFormState["direction"],
                }))
              }
            >
              <option value="incoming">Incoming</option>
              <option value="outgoing">Outgoing</option>
            </select>
          </FieldWrapper>
          <FieldWrapper label="School name" error={transferErrors.schoolName}>
            <input
              className={fieldClassName}
              value={transferForm.schoolName}
              onChange={(event) =>
                setTransferForm((current) => ({ ...current, schoolName: event.target.value }))
              }
              placeholder="School name"
            />
          </FieldWrapper>
          <div className="md:col-span-2">
            <FieldWrapper label="Reason" error={transferErrors.reason}>
              <textarea
                className={textAreaClassName}
                value={transferForm.reason}
                onChange={(event) =>
                  setTransferForm((current) => ({ ...current, reason: event.target.value }))
                }
                placeholder="Reason for transfer"
              />
            </FieldWrapper>
          </div>
        </div>
      </Modal>
    </>
  );
}

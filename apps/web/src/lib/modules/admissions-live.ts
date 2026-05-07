import {
  requestDashboardApi,
  type LiveAuthSession,
} from "@/lib/dashboard/api-client";
import type { DashboardRole } from "@/lib/dashboard/types";
import {
  buildAdmissionsSearchItems,
  createAdmissionsDataset,
  type AdmissionApplication,
  type AdmissionsDataset,
  type AdmissionsDocument,
  type AdmissionsStudentProfile,
  type AdmissionsTransfer,
  type ClassAllocation,
  type ParentDirectoryEntry,
  type StudentDirectoryEntry,
} from "@/lib/modules/admissions-data";

export interface AdmissionDocumentUploadInput {
  birthCertificateFileName: string;
  birthCertificateFile: File | null;
  passportPhotoFileName: string;
  passportPhotoFile: File | null;
  reportFormsFileName?: string;
  reportFormsFile?: File | null;
}

export function buildAdmissionDocumentUploads(input: AdmissionDocumentUploadInput) {
  const uploads: Array<{
    document_type: string;
    file: File;
    file_name: string;
  }> = [];

  if (input.birthCertificateFile && input.birthCertificateFileName.trim()) {
    uploads.push({
      document_type: "Birth certificate",
      file: input.birthCertificateFile,
      file_name: input.birthCertificateFileName.trim(),
    });
  }

  if (input.passportPhotoFile && input.passportPhotoFileName.trim()) {
    uploads.push({
      document_type: "Passport photo",
      file: input.passportPhotoFile,
      file_name: input.passportPhotoFileName.trim(),
    });
  }

  if (input.reportFormsFile && input.reportFormsFileName?.trim()) {
    uploads.push({
      document_type: "Previous report forms",
      file: input.reportFormsFile,
      file_name: input.reportFormsFileName.trim(),
    });
  }

  return uploads;
}

export interface LiveAdmissionsSummary {
  new_applications: number;
  approved_students: number;
  pending_review: number;
  total_registered: number;
  recent_applications: Array<Record<string, unknown>>;
  pending_approvals: Array<Record<string, unknown>>;
  missing_documents: Array<{
    application_number: string;
    full_name: string;
    uploaded_documents: number;
  }>;
}

export interface LiveAdmissionApplication {
  id: string;
  tenant_id: string;
  application_number: string;
  full_name: string;
  date_of_birth: string;
  gender?: string | null;
  birth_certificate_number: string;
  nationality: string;
  previous_school?: string | null;
  kcpe_results?: string | null;
  cbc_level?: string | null;
  class_applying: string;
  parent_name: string;
  parent_phone: string;
  parent_email?: string | null;
  parent_occupation?: string | null;
  relationship: string;
  allergies?: string | null;
  conditions?: string | null;
  emergency_contact?: string | null;
  status: "pending" | "interview" | "approved" | "rejected" | "registered";
  interview_date?: string | null;
  review_notes?: string | null;
  approved_at?: string | null;
  admitted_student_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface LiveAdmissionsStudent {
  id: string;
  admission_number: string;
  first_name: string;
  last_name: string;
  primary_guardian_name?: string | null;
  primary_guardian_phone?: string | null;
  metadata?: Record<string, unknown> | null;
  class_name?: string | null;
  stream_name?: string | null;
  dormitory_name?: string | null;
  transport_route?: string | null;
}

export interface LiveAdmissionsParent {
  parent_name: string;
  parent_phone: string;
  parent_email?: string | null;
  parent_occupation?: string | null;
  relationship?: string | null;
}

export interface LiveAdmissionsDocument {
  id: string;
  document_type: string;
  original_file_name: string;
  verification_status: "pending" | "verified" | "rejected";
  created_at?: string | null;
  applicant_name?: string | null;
  admission_number?: string | null;
}

export interface LiveAdmissionsAllocation {
  id: string;
  student_id?: string | null;
  admission_number: string;
  first_name: string;
  last_name: string;
  class_name: string;
  stream_name: string;
  dormitory_name?: string | null;
  transport_route?: string | null;
  effective_from: string;
}

export interface LiveAdmissionsTransferRecord {
  id: string;
  student_id?: string | null;
  application_id?: string | null;
  transfer_type: string;
  school_name: string;
  reason: string;
  requested_on: string;
  status: "pending" | "completed";
  notes?: string | null;
}

export interface LiveAdmissionsStudentProfileResponse {
  student: {
    id: string;
    admission_number: string;
    first_name: string;
    last_name: string;
    date_of_birth?: string | null;
    gender?: string | null;
    primary_guardian_name?: string | null;
    primary_guardian_phone?: string | null;
    metadata?: Record<string, unknown> | null;
  };
  allocation?: {
    class_name: string;
    stream_name: string;
    dormitory_name?: string | null;
    transport_route?: string | null;
    effective_from?: string | null;
  } | null;
  documents: Array<{
    id: string;
    document_type: string;
    original_file_name: string;
    verification_status: "pending" | "verified" | "rejected";
    created_at?: string | null;
  }>;
  attendance: Array<{
    attendance_date: string;
    status: string;
    notes?: string | null;
  }>;
}

const fallbackAdmissions = createAdmissionsDataset();

function formatDate(value?: string | null, withTime = false) {
  if (!value) {
    return "-";
  }

  const normalized = value.replace("T", " ");
  return withTime ? normalized.slice(0, 16) : normalized.slice(0, 10);
}

function buildFullName(input: {
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
}) {
  if (input.full_name?.trim()) {
    return input.full_name.trim();
  }

  return `${input.first_name ?? ""} ${input.last_name ?? ""}`.trim();
}

function getDocumentOwnerType(document: LiveAdmissionsDocument): "application" | "student" {
  return document.admission_number ? "student" : "application";
}

function getAdmissionsMetadata(metadata?: Record<string, unknown> | null) {
  const admissions =
    metadata && typeof metadata === "object" && "admissions" in metadata
      ? (metadata.admissions as Record<string, unknown>)
      : undefined;

  return admissions ?? {};
}

function getGuardianMetadata(metadata?: Record<string, unknown> | null) {
  const admissions = getAdmissionsMetadata(metadata);
  const guardian =
    admissions.guardian && typeof admissions.guardian === "object"
      ? (admissions.guardian as Record<string, unknown>)
      : {};

  return guardian;
}

function getMedicalMetadata(metadata?: Record<string, unknown> | null) {
  const admissions = getAdmissionsMetadata(metadata);
  const medical =
    admissions.medical && typeof admissions.medical === "object"
      ? (admissions.medical as Record<string, unknown>)
      : {};

  return medical;
}

function getFallbackProfileSeed(input: { admissionNumber: string; fullName: string }) {
  return (
    fallbackAdmissions.studentProfiles.find(
      (profile) =>
        profile.admissionNumber === input.admissionNumber
        || profile.fullName.toLowerCase() === input.fullName.toLowerCase(),
    )
    ?? null
  );
}

function buildLearnerMap(
  students: LiveAdmissionsStudent[],
  applications: LiveAdmissionApplication[],
) {
  const namesByPhone = new Map<string, Set<string>>();
  const studentsById = new Map(students.map((student) => [student.id, student]));
  const studentsByAdmission = new Map(
    students.map((student) => [student.admission_number, student]),
  );
  const applicationsById = new Map(
    applications.map((application) => [application.id, application]),
  );

  students.forEach((student) => {
    const fullName = buildFullName(student);
    const phone = student.primary_guardian_phone ?? "";
    if (!phone) {
      return;
    }

    if (!namesByPhone.has(phone)) {
      namesByPhone.set(phone, new Set<string>());
    }

    namesByPhone.get(phone)?.add(fullName);
  });

  applications.forEach((application) => {
    if (!namesByPhone.has(application.parent_phone)) {
      namesByPhone.set(application.parent_phone, new Set<string>());
    }

    namesByPhone.get(application.parent_phone)?.add(application.full_name);
  });

  return {
    namesByPhone,
    studentsById,
    studentsByAdmission,
    applicationsById,
  };
}

function buildStudentEntry(student: LiveAdmissionsStudent): StudentDirectoryEntry {
  return {
    id: student.id,
    fullName: buildFullName(student),
    admissionNumber: student.admission_number,
    className: student.class_name ?? "Pending",
    streamName: student.stream_name ?? "Pending",
    parentName: student.primary_guardian_name ?? "Guardian pending",
    parentPhone: student.primary_guardian_phone ?? "Not on file",
    status: student.class_name && student.stream_name ? "registered" : "pending_allocation",
    registrationDate: "On file",
  };
}

function buildFallbackStudentProfile(
  student: LiveAdmissionsStudent,
  documents: AdmissionsDocument[],
): AdmissionsStudentProfile {
  const fullName = buildFullName(student);
  const fallbackSeed = getFallbackProfileSeed({
    admissionNumber: student.admission_number,
    fullName,
  });
  const admissionsMetadata = getAdmissionsMetadata(student.metadata);
  const guardianMetadata = getGuardianMetadata(student.metadata);
  const medicalMetadata = getMedicalMetadata(student.metadata);

  return {
    id: student.id,
    fullName,
    admissionNumber: student.admission_number,
    className: student.class_name ?? fallbackSeed?.className ?? "Pending",
    streamName: student.stream_name ?? fallbackSeed?.streamName ?? "Pending",
    dormitoryName: student.dormitory_name ?? fallbackSeed?.dormitoryName ?? "Pending",
    transportRoute: student.transport_route ?? fallbackSeed?.transportRoute ?? "Pending",
    gender: fallbackSeed?.gender ?? "Not recorded",
    dateOfBirth: fallbackSeed?.dateOfBirth ?? "Not recorded",
    nationality:
      typeof admissionsMetadata.nationality === "string"
        ? admissionsMetadata.nationality
        : (fallbackSeed?.nationality ?? "Kenyan"),
    parentName:
      student.primary_guardian_name
      ?? (typeof guardianMetadata.parent_name === "string" ? guardianMetadata.parent_name : null)
      ?? (fallbackSeed?.parentName ?? "Guardian pending"),
    parentPhone: student.primary_guardian_phone ?? fallbackSeed?.parentPhone ?? "Not on file",
    parentEmail:
      typeof guardianMetadata.parent_email === "string"
        ? guardianMetadata.parent_email
        : (fallbackSeed?.parentEmail ?? ""),
    occupation:
      typeof guardianMetadata.parent_occupation === "string"
        ? guardianMetadata.parent_occupation
        : (fallbackSeed?.occupation ?? "Not provided"),
    relationship:
      typeof guardianMetadata.relationship === "string"
        ? guardianMetadata.relationship
        : (fallbackSeed?.relationship ?? "Guardian"),
    previousSchool:
      typeof admissionsMetadata.previous_school === "string"
        ? admissionsMetadata.previous_school
        : (fallbackSeed?.previousSchool ?? "Not provided"),
    kcpeResults:
      typeof admissionsMetadata.kcpe_results === "string"
        ? admissionsMetadata.kcpe_results
        : (fallbackSeed?.kcpeResults ?? "N/A"),
    cbcLevel:
      typeof admissionsMetadata.cbc_level === "string"
        ? admissionsMetadata.cbc_level
        : (fallbackSeed?.cbcLevel ?? "Not recorded"),
    registrationDate: fallbackSeed?.registrationDate ?? "On file",
    applicationStatus: "registered",
    feesBalance: fallbackSeed?.feesBalance ?? 32000,
    lastPayment:
      fallbackSeed?.lastPayment ?? "Finance office will post opening balances after registration.",
    billingPlan: fallbackSeed?.billingPlan ?? "Admission fee and opening term package",
    allergies:
      typeof medicalMetadata.allergies === "string"
        ? medicalMetadata.allergies
        : (fallbackSeed?.allergies ?? "None"),
    conditions:
      typeof medicalMetadata.conditions === "string"
        ? medicalMetadata.conditions
        : (fallbackSeed?.conditions ?? "None"),
    emergencyContact:
      typeof medicalMetadata.emergency_contact === "string"
        ? medicalMetadata.emergency_contact
        : (fallbackSeed?.emergencyContact ?? "Not recorded"),
    academics:
      fallbackSeed?.academics ?? [
        {
          id: `acad-${student.id}`,
          subject: "Entry baseline",
          value: "Pending",
          note: "Academic office will post readiness notes after onboarding.",
        },
      ],
    attendance:
      fallbackSeed?.attendance ?? [
        {
          id: `att-${student.id}`,
          date: "Pending",
          status: "Awaiting start",
          note: "Attendance history will appear once class entry begins.",
        },
      ],
    discipline:
      fallbackSeed?.discipline ?? [
        {
          id: `disc-${student.id}`,
          date: "On file",
          entry: "No record",
          status: "Clear",
        },
      ],
    fees:
      fallbackSeed?.fees ?? [
        {
          id: `fee-${student.id}-1`,
          item: "Admission fee",
          amount: 12000,
          status: "pending",
        },
        {
          id: `fee-${student.id}-2`,
          item: "Opening tuition balance",
          amount: 20000,
          status: "pending",
        },
      ],
    documents: documents
      .filter((document) => document.ownerType === "student" && document.learnerName === fullName)
      .map((document) => ({
        id: document.id,
        documentType: document.documentType,
        fileName: document.fileName,
        uploadedOn: document.uploadedOn,
        verificationStatus: document.verificationStatus,
      })),
  };
}

export function mapAdmissionsDatasetFromLive(input: {
  summary: LiveAdmissionsSummary;
  applications: LiveAdmissionApplication[];
  students: LiveAdmissionsStudent[];
  parents: LiveAdmissionsParent[];
  documents: LiveAdmissionsDocument[];
  allocations: LiveAdmissionsAllocation[];
  transfers: LiveAdmissionsTransferRecord[];
}): AdmissionsDataset {
  const lookup = buildLearnerMap(input.students, input.applications);

  const students = input.students.map(buildStudentEntry);

  const applications: AdmissionApplication[] = input.applications.map((application) => {
    const admittedStudent = application.admitted_student_id
      ? lookup.studentsById.get(application.admitted_student_id)
      : undefined;

    return {
      id: application.id,
      applicationNumber: application.application_number,
      applicantName: application.full_name,
      admissionNumber: admittedStudent?.admission_number ?? "PENDING",
      classApplying: application.class_applying,
      parentName: application.parent_name,
      parentPhone: application.parent_phone,
      status: application.status,
      dateApplied: formatDate(application.created_at),
      gender: application.gender ?? "Not recorded",
      dateOfBirth: application.date_of_birth,
      birthCertificateNumber: application.birth_certificate_number,
      nationality: application.nationality,
      previousSchool: application.previous_school ?? "Not provided",
      kcpeResults: application.kcpe_results ?? "N/A",
      cbcLevel: application.cbc_level ?? "Not recorded",
      parentEmail: application.parent_email ?? "",
      occupation: application.parent_occupation ?? "Not provided",
      relationship: application.relationship,
      allergies: application.allergies ?? "None",
      conditions: application.conditions ?? "None",
      emergencyContact: application.emergency_contact ?? "Not recorded",
      reviewNote: application.review_notes ?? "",
    };
  });

  const parents: ParentDirectoryEntry[] = input.parents.map((parent, index) => ({
    id: `parent-${index + 1}`,
    parentName: parent.parent_name,
    phone: parent.parent_phone,
    email: parent.parent_email ?? "",
    occupation: parent.parent_occupation ?? "Not provided",
    relationship: parent.relationship ?? "Guardian",
    learners: Array.from(lookup.namesByPhone.get(parent.parent_phone) ?? []).join(", ") || "On file",
  }));

  const documents: AdmissionsDocument[] = [
    ...input.documents.map((document) => {
      const matchedStudent = document.admission_number
        ? lookup.studentsByAdmission.get(document.admission_number)
        : undefined;
      const learnerName = document.applicant_name ?? buildFullName(matchedStudent ?? {});

      return {
        id: document.id,
        learnerName: learnerName || "Applicant on file",
        documentType: document.document_type,
        fileName: document.original_file_name,
        uploadedOn: formatDate(document.created_at, true),
        verificationStatus: document.verification_status,
        ownerType: getDocumentOwnerType(document),
      };
    }),
    ...input.summary.missing_documents.map((document) => ({
      id: `missing-${document.application_number}`,
      learnerName: document.full_name,
      documentType: "Required admissions documents",
      fileName: `${document.uploaded_documents}/2 uploaded`,
      uploadedOn: "-",
      verificationStatus: "missing" as const,
      ownerType: "application" as const,
    })),
  ];

  const allocations: ClassAllocation[] = input.allocations.map((allocation) => ({
    id: allocation.id,
    studentId:
      allocation.student_id
      ?? lookup.studentsByAdmission.get(allocation.admission_number)?.id
      ?? `student-${allocation.admission_number}`,
    studentName: buildFullName(allocation),
    admissionNumber: allocation.admission_number,
    className: allocation.class_name,
    streamName: allocation.stream_name,
    dormitoryName: allocation.dormitory_name ?? "Not assigned",
    transportRoute: allocation.transport_route ?? "Not assigned",
    effectiveFrom: formatDate(allocation.effective_from),
    status: "assigned",
  }));

  const transfers: AdmissionsTransfer[] = input.transfers.map((transfer) => {
    const student = transfer.student_id ? lookup.studentsById.get(transfer.student_id) : undefined;
    const application = transfer.application_id
      ? lookup.applicationsById.get(transfer.application_id)
      : undefined;

    return {
      id: transfer.id,
      learnerName: student ? buildFullName(student) : application?.full_name ?? "Learner on file",
      admissionNumber: student?.admission_number ?? "PENDING",
      direction:
        transfer.transfer_type.toLowerCase().includes("out")
          ? "outgoing"
          : "incoming",
      schoolName: transfer.school_name,
      reason: transfer.reason,
      requestedOn: formatDate(transfer.requested_on),
      status: transfer.status,
    };
  });

  const studentProfiles = input.students.map((student) =>
    buildFallbackStudentProfile(student, documents),
  );

  return {
    applications,
    students,
    parents,
    documents,
    allocations,
    transfers,
    studentProfiles,
  };
}

export function mapAdmissionsStudentProfileFromLive(
  input: LiveAdmissionsStudentProfileResponse,
): AdmissionsStudentProfile {
  const fullName = buildFullName(input.student);
  const seed = getFallbackProfileSeed({
    admissionNumber: input.student.admission_number,
    fullName,
  });
  const admissionsMetadata = getAdmissionsMetadata(input.student.metadata);
  const guardianMetadata = getGuardianMetadata(input.student.metadata);
  const medicalMetadata = getMedicalMetadata(input.student.metadata);

  return {
    id: input.student.id,
    fullName,
    admissionNumber: input.student.admission_number,
    className: input.allocation?.class_name ?? seed?.className ?? "Pending",
    streamName: input.allocation?.stream_name ?? seed?.streamName ?? "Pending",
    dormitoryName: input.allocation?.dormitory_name ?? seed?.dormitoryName ?? "Pending",
    transportRoute: input.allocation?.transport_route ?? seed?.transportRoute ?? "Pending",
    gender: input.student.gender ?? seed?.gender ?? "Not recorded",
    dateOfBirth: input.student.date_of_birth ?? seed?.dateOfBirth ?? "Not recorded",
    nationality:
      typeof admissionsMetadata.nationality === "string"
        ? admissionsMetadata.nationality
        : (seed?.nationality ?? "Kenyan"),
    parentName:
      input.student.primary_guardian_name
      ?? (typeof guardianMetadata.parent_name === "string" ? guardianMetadata.parent_name : null)
      ?? (seed?.parentName ?? "Guardian pending"),
    parentPhone: input.student.primary_guardian_phone ?? seed?.parentPhone ?? "Not on file",
    parentEmail:
      typeof guardianMetadata.parent_email === "string"
        ? guardianMetadata.parent_email
        : (seed?.parentEmail ?? ""),
    occupation:
      typeof guardianMetadata.parent_occupation === "string"
        ? guardianMetadata.parent_occupation
        : (seed?.occupation ?? "Not provided"),
    relationship:
      typeof guardianMetadata.relationship === "string"
        ? guardianMetadata.relationship
        : (seed?.relationship ?? "Guardian"),
    previousSchool:
      typeof admissionsMetadata.previous_school === "string"
        ? admissionsMetadata.previous_school
        : (seed?.previousSchool ?? "Not provided"),
    kcpeResults:
      typeof admissionsMetadata.kcpe_results === "string"
        ? admissionsMetadata.kcpe_results
        : (seed?.kcpeResults ?? "N/A"),
    cbcLevel:
      typeof admissionsMetadata.cbc_level === "string"
        ? admissionsMetadata.cbc_level
        : (seed?.cbcLevel ?? "Not recorded"),
    registrationDate: formatDate(input.allocation?.effective_from) || seed?.registrationDate || "On file",
    applicationStatus: "registered",
    feesBalance: seed?.feesBalance ?? 32000,
    lastPayment:
      seed?.lastPayment ?? "Finance office will post opening balances after registration.",
    billingPlan: seed?.billingPlan ?? "Admission fee and opening term package",
    allergies:
      typeof medicalMetadata.allergies === "string"
        ? medicalMetadata.allergies
        : (seed?.allergies ?? "None"),
    conditions:
      typeof medicalMetadata.conditions === "string"
        ? medicalMetadata.conditions
        : (seed?.conditions ?? "None"),
    emergencyContact:
      typeof medicalMetadata.emergency_contact === "string"
        ? medicalMetadata.emergency_contact
        : (seed?.emergencyContact ?? "Not recorded"),
    academics:
      seed?.academics ?? [
        {
          id: `acad-${input.student.id}`,
          subject: "Entry baseline",
          value: "Pending",
          note: "Academic office will post readiness notes after onboarding.",
        },
      ],
    attendance:
      input.attendance.length > 0
        ? input.attendance.map((entry, index) => ({
            id: `att-${input.student.id}-${index + 1}`,
            date: formatDate(entry.attendance_date),
            status: entry.status,
            note: entry.notes ?? "Attendance entry recorded.",
          }))
        : (seed?.attendance ?? [
            {
              id: `att-${input.student.id}`,
              date: "Pending",
              status: "Awaiting start",
              note: "Attendance history will appear once class entry begins.",
            },
          ]),
    discipline:
      seed?.discipline ?? [
        {
          id: `disc-${input.student.id}`,
          date: "On file",
          entry: "No record",
          status: "Clear",
        },
      ],
    fees:
      seed?.fees ?? [
        {
          id: `fee-${input.student.id}-1`,
          item: "Admission fee",
          amount: 12000,
          status: "pending",
        },
        {
          id: `fee-${input.student.id}-2`,
          item: "Opening tuition balance",
          amount: 20000,
          status: "pending",
        },
      ],
    documents: input.documents.map((document) => ({
      id: document.id,
      documentType: document.document_type,
      fileName: document.original_file_name,
      uploadedOn: formatDate(document.created_at, true),
      verificationStatus: document.verification_status,
    })),
  };
}

export function mapAdmissionsSearchItemsFromLive(
  role: DashboardRole,
  students: LiveAdmissionsStudent[],
): ReturnType<typeof buildAdmissionsSearchItems> {
  if (role === "storekeeper") {
    return [];
  }

  return students.map((student) => ({
    id: `student-search-${student.id}`,
    label: `${buildFullName(student)} (${student.admission_number})`,
    description: `${student.class_name ?? "Class pending"} ${student.stream_name ?? "Stream pending"} · Parent ${student.primary_guardian_phone ?? "Not on file"}`,
    href:
      role === "admissions"
        ? `/dashboard/admissions/admissions?view=student-directory&student=${student.id}`
        : `/dashboard/${role}/students/${student.id}`,
    kind: "student" as const,
  }));
}

function withSession<T>(
  session: LiveAuthSession,
  path: string,
  options?: {
    method?: "GET" | "POST" | "PATCH";
    body?: BodyInit | Record<string, unknown> | null;
  },
) {
  return requestDashboardApi<T>(path, {
    tenantId: session.tenantId,
    accessToken: session.accessToken,
    method: options?.method,
    body: options?.body,
  });
}

export async function fetchAdmissionsDatasetLive(session: LiveAuthSession) {
  const [summary, applications, students, parents, documents, allocations, transfers] =
    await Promise.all([
      withSession<LiveAdmissionsSummary>(session, "/admissions/summary"),
      withSession<LiveAdmissionApplication[]>(session, "/admissions/applications?limit=200"),
      withSession<LiveAdmissionsStudent[]>(session, "/admissions/students?limit=200"),
      withSession<LiveAdmissionsParent[]>(session, "/admissions/parents"),
      withSession<LiveAdmissionsDocument[]>(session, "/admissions/documents"),
      withSession<LiveAdmissionsAllocation[]>(session, "/admissions/allocations"),
      withSession<LiveAdmissionsTransferRecord[]>(session, "/admissions/transfers"),
    ]);

  return mapAdmissionsDatasetFromLive({
    summary,
    applications,
    students,
    parents,
    documents,
    allocations,
    transfers,
  });
}

export function fetchAdmissionsStudentProfileLive(
  session: LiveAuthSession,
  studentId: string,
) {
  return withSession<LiveAdmissionsStudentProfileResponse>(
    session,
    `/admissions/students/${studentId}/profile`,
  );
}

export function fetchAdmissionsStudentSearchLive(session: LiveAuthSession) {
  return withSession<LiveAdmissionsStudent[]>(session, "/admissions/students?limit=100");
}

export function createAdmissionApplicationLive(
  session: LiveAuthSession,
  input: {
    full_name: string;
    date_of_birth: string;
    gender: string;
    birth_certificate_number: string;
    nationality: string;
    previous_school?: string;
    kcpe_results?: string;
    cbc_level?: string;
    class_applying: string;
    parent_name: string;
    parent_phone: string;
    parent_email?: string;
    parent_occupation?: string;
    relationship: string;
    allergies?: string;
    conditions?: string;
    emergency_contact?: string;
  },
) {
  return withSession<LiveAdmissionApplication>(session, "/admissions/applications", {
    method: "POST",
    body: input,
  });
}

export function updateAdmissionApplicationLive(
  session: LiveAuthSession,
  applicationId: string,
  input: {
    status?: "pending" | "interview" | "approved" | "rejected" | "registered";
    review_notes?: string;
    interview_date?: string;
  },
) {
  return withSession<LiveAdmissionApplication>(
    session,
    `/admissions/applications/${applicationId}`,
    {
      method: "PATCH",
      body: input,
    },
  );
}

export function uploadAdmissionDocumentLive(
  session: LiveAuthSession,
  applicationId: string,
  input: {
    document_type: string;
    file: File | Blob;
    file_name: string;
    uploaded_by_user_id?: string;
  },
) {
  const formData = new FormData();
  formData.append("document_type", input.document_type);
  if (input.uploaded_by_user_id) {
    formData.append("uploaded_by_user_id", input.uploaded_by_user_id);
  }
  formData.append("file", input.file, input.file_name);

  return withSession(
    session,
    `/admissions/applications/${applicationId}/documents`,
    {
      method: "POST",
      body: formData,
    },
  );
}

export function registerAdmissionApplicationLive(
  session: LiveAuthSession,
  applicationId: string,
  input: {
    admission_number: string;
    class_name: string;
    stream_name: string;
    dormitory_name?: string;
    transport_route?: string;
  },
) {
  return withSession(
    session,
    `/admissions/applications/${applicationId}/register`,
    {
      method: "POST",
      body: input,
    },
  );
}

export function updateAdmissionDocumentVerificationLive(
  session: LiveAuthSession,
  documentId: string,
  input: {
    verification_status: "pending" | "verified" | "rejected";
  },
) {
  return withSession(
    session,
    `/admissions/documents/${documentId}`,
    {
      method: "PATCH",
      body: input,
    },
  );
}

export function createAdmissionsAllocationLive(
  session: LiveAuthSession,
  studentId: string,
  input: {
    class_name: string;
    stream_name: string;
    dormitory_name?: string;
    transport_route?: string;
    effective_from?: string;
  },
) {
  return withSession(session, `/admissions/allocations/${studentId}`, {
    method: "POST",
    body: input,
  });
}

export function createAdmissionsTransferLive(
  session: LiveAuthSession,
  input: {
    student_id?: string;
    application_id?: string;
    transfer_type: string;
    school_name: string;
    reason: string;
    requested_on?: string;
    notes?: string;
  },
) {
  return withSession(session, "/admissions/transfers", {
    method: "POST",
    body: input,
  });
}
